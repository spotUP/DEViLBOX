/**
 * KarlMortonParser.ts — Karl Morton Music Format (.mus) module loader
 *
 * Karl Morton's music engine was used in Psycho Pinball and Micro Machines 2.
 * Files are IFF-like chunk streams with "SONG" and "SMPL" 4-byte identifiers.
 * The format is file-extension ".mus".
 *
 * Chunk layout (each chunk):
 *   uint32LE id       — chunk identifier ("SONG" = 0x474E4F53, "SMPL" = 0x4C504D53)
 *   uint32LE length   — total chunk size including 8-byte header
 *   <payload>         — length - 8 bytes
 *
 * SMPL chunk payload = KMSampleHeader (40 bytes) + PCM data
 *   KMSampleHeader:
 *     +0  name[32]        — sample name (null-terminated printable ASCII)
 *     +32 loopStart (uint32LE)
 *     +36 size      (uint32LE)  — byte length of PCM data
 *   PCM: 8-bit signed mono little-endian
 *
 * SONG chunk payload = KMSongHeader + music data
 *   KMSongHeader:
 *     +0  name[32]           — song name (null-terminated printable ASCII)
 *     +32 samples[31] x KMSampleReference (34 bytes each = 1054 bytes)
 *         KMSampleReference:
 *           +0  name[32]     — matches sample name in SMPL chunk
 *           +32 finetune (uint8, 0-15)
 *           +33 volume   (uint8, 0-64)
 *     +1086 unknown  (uint16LE)  — always 0
 *     +1088 numChannels (uint32LE)  — 1-4
 *     +1092 restartPos  (uint32LE)  — byte offset in music data for loop restart
 *     +1096 musicSize   (uint32LE)  — bytes of music data following header
 *
 * Music data encoding (per-row, per-channel interleaved):
 *   Each channel per row:
 *     If high bit set: repeat mode
 *       byte & 0x7F = repeat count (0-127); repeat last command that many more times
 *     Else: note byte
 *       0       = empty row (no note)
 *       1-36    = note (note + NOTE_MIDDLEC - 13, i.e. C-1 to B-3)
 *
 *   If not repeat:
 *     byte 2: instr (& 0x1F = 1-based sample map index, & 0x80 = reuse previous effects)
 *     If not reuse:
 *       byte 3: effect command (0-19)
 *       byte 4: effect param
 *
 * Effect table (command index → XM effect):
 *   0  CMD_VOLUME         1  CMD_MODCMDEX | 0xA0  2  CMD_MODCMDEX | 0xB0  3  CMD_MODCMDEX | 0x10
 *   4  CMD_MODCMDEX | 0x20  5  CMD_MODCMDEX | 0x50  6  CMD_OFFSET  7  CMD_TONEPORTAMENTO
 *   8  CMD_TONEPORTAVOL   9  CMD_VIBRATO  10 CMD_VIBRATOVOL  11 CMD_ARPEGGIO
 *  12  CMD_PORTAMENTOUP  13  CMD_PORTAMENTODOWN  14  CMD_VOLUMESLIDE  15  CMD_MODCMDEX | 0x90
 *  16  CMD_TONEPORTAMENTO (param=0xFF, masks param)  17  CMD_MODCMDEX | 0xC0
 *  18  CMD_SPEED (param >= 0x20 → CMD_TEMPO)  19  CMD_TREMOLO
 *
 * Pattern length: 64 rows (MUS_PATTERN_LENGTH)
 * The music stream is split into 64-row patterns as it is parsed.
 * Multiple SONG chunks = multiple subsongs (we use only the first for the TrackerSong).
 *
 * Amiga format constraints (MOD_TYPE_MOD):
 *   Samples: loopStart + loopEnd = size (loop-to-end), loopStart=0 = no loop
 *   Volume: nVolume = finetune * 4 (range 0-256)
 *   Finetune: MOD2XMFineTune(finetune)
 *
 * Reference: OpenMPT soundlib/Load_mus_km.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEChipRamInfo } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}
function u16le(bytes: Uint8Array, off: number): number {
  return ((bytes[off] ?? 0) | ((bytes[off + 1] ?? 0) << 8)) >>> 0;
}
function u32le(bytes: Uint8Array, off: number): number {
  return (((bytes[off] ?? 0) | ((bytes[off + 1] ?? 0) << 8)
         | ((bytes[off + 2] ?? 0) << 16) | ((bytes[off + 3] ?? 0) << 24)) >>> 0);
}

function readString32(bytes: Uint8Array, off: number): string {
  let s = '';
  for (let i = 0; i < 32; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    if (c >= 0x20) s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Chunk IDs (little-endian 32-bit)
const ID_SONG = 0x474E4F53; // 'SONG'
const ID_SMPL = 0x4C504D53; // 'SMPL'

const SMPL_HDR_SIZE    = 40;
const SONG_FIXED_SIZE  = 32 + 31 * 34 + 2 + 4 + 4 + 4; // 1100 bytes
const KM_PATTERN_LEN   = 64;
const MAX_CHANNELS     = 4;
const AMIGA_PAL_FREQ   = 3546895;
const SAMPLE_RATE      = 8287; // standard Amiga PAL rate (C5)

// MOD2XMFineTune table (nibble 0-15 → XM finetune -128..+112)
const MOD2XM_FINETUNE = [0, 16, 32, 48, 64, 80, 96, 112, -128, -112, -96, -80, -64, -48, -32, -16];

// Effect translation table (matches OpenMPT effTrans[] in Load_mus_km.cpp)
// Each entry: [effTyp, mask]  — if mask != 0, param = mask | (param & 0x0F)
const KM_EFF_TRANS: Array<[number, number]> = [
  [0x0C, 0x00], // 0  CMD_VOLUME
  [0x0E, 0xA0], // 1  CMD_MODCMDEX | 0xA0
  [0x0E, 0xB0], // 2  CMD_MODCMDEX | 0xB0
  [0x0E, 0x10], // 3  CMD_MODCMDEX | 0x10
  [0x0E, 0x20], // 4  CMD_MODCMDEX | 0x20
  [0x0E, 0x50], // 5  CMD_MODCMDEX | 0x50
  [0x09, 0x00], // 6  CMD_OFFSET
  [0x03, 0x00], // 7  CMD_TONEPORTAMENTO
  [0x05, 0x00], // 8  CMD_TONEPORTAVOL
  [0x04, 0x00], // 9  CMD_VIBRATO
  [0x06, 0x00], // 10 CMD_VIBRATOVOL
  [0x00, 0x00], // 11 CMD_ARPEGGIO (arpeggio = 0x00 in XM notation)
  [0x01, 0x00], // 12 CMD_PORTAMENTOUP
  [0x02, 0x00], // 13 CMD_PORTAMENTODOWN
  [0x0A, 0x00], // 14 CMD_VOLUMESLIDE
  [0x0E, 0x90], // 15 CMD_MODCMDEX | 0x90
  [0x03, 0xFF], // 16 CMD_TONEPORTAMENTO param=0xFF (slide to previous)
  [0x0E, 0xC0], // 17 CMD_MODCMDEX | 0xC0
  [0x0F, 0x00], // 18 CMD_SPEED (param >= 0x20 → CMD_TEMPO)
  [0x07, 0x00], // 19 CMD_TREMOLO
];

// XM note base for Karl Morton: note 1-36 maps to C-? range
// OpenMPT: m->note = note + NOTE_MIDDLEC - 13  where NOTE_MIDDLEC = 49 → +36
const KM_NOTE_OFFSET = 49 - 13; // = 36

// ── Validation helpers ────────────────────────────────────────────────────────

function isValidKMString32(bytes: Uint8Array, off: number): boolean {
  let nullFound = false;
  for (let i = 0; i < 32; i++) {
    const c = bytes[off + i] ?? 0;
    if (c > 0x00 && c < 0x20) return false;
    if (c === 0) nullFound = true;
    else if (nullFound) return false; // non-null after null
  }
  return nullFound;
}

// ── Format detection ──────────────────────────────────────────────────────────

export function isKarlMortonFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 8 + SONG_FIXED_SIZE + 8) return false; // need SONG chunk + at least one SMPL chunk header

  // First chunk must be SONG
  const id     = u32le(bytes, 0);
  const length = u32le(bytes, 4);
  if (id !== ID_SONG) return false;
  if (length < 8 + SONG_FIXED_SIZE) return false;
  if (length > 0x40000) return false;

  const songBase   = 8; // skip chunk header
  const musicSize  = u32le(bytes, songBase + 1092);
  // chunkHeader.length - sizeof(KMFileHeader) == musicSize
  const songHdrSize = 8 + SONG_FIXED_SIZE; // 8 (chunk header) + song header
  if (length - songHdrSize !== musicSize) return false;

  const unknown    = u16le(bytes, songBase + 1086);
  if (unknown !== 0) return false;

  const numChannels = u32le(bytes, songBase + 1088);
  if (numChannels < 1 || numChannels > 4) return false;

  // Song name must be valid
  if (!isValidKMString32(bytes, songBase)) return false;

  // Sample references must be valid
  for (let i = 0; i < 31; i++) {
    const refBase = songBase + 32 + i * 34;
    const ft      = u8(bytes, refBase + 32);
    const vol     = u8(bytes, refBase + 33);
    if (ft > 15 || vol > 64) return false;
    if (!isValidKMString32(bytes, refBase)) return false;
  }

  return true;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseKarlMortonFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseInternal(bytes, filename);
  } catch {
    return null;
  }
}

function parseInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isKarlMortonFormat(bytes)) return null;

  // ── Parse all chunks ──────────────────────────────────────────────────────

  interface SampleChunk {
    name:         string;
    loopStart:    number;
    size:         number;
    dataOffset:   number; // byte offset into `bytes` (past KMSampleHeader)
    headerOffset: number; // byte offset of KMSampleHeader start (= payloadOff)
  }

  interface SongChunk {
    name:        string;
    samples:     Array<{ name: string; finetune: number; volume: number }>;
    numChannels: number;
    restartPos:  number;
    musicSize:   number;
    musicOffset: number; // byte offset into `bytes`
  }

  const sampleChunks: SampleChunk[] = [];
  const songChunks:   SongChunk[]   = [];

  let pos = 0;
  while (pos + 8 <= bytes.length) {
    const chunkId  = u32le(bytes, pos);
    const chunkLen = u32le(bytes, pos + 4);
    if (chunkLen < 8) break;

    const payloadOff = pos + 8;
    const payloadLen = chunkLen - 8;

    if (chunkId === ID_SMPL) {
      if (payloadLen >= SMPL_HDR_SIZE) {
        const name      = readString32(bytes, payloadOff);
        const loopStart = u32le(bytes, payloadOff + 32);
        const size      = u32le(bytes, payloadOff + 36);
        if (isValidKMString32(bytes, payloadOff)) {
          sampleChunks.push({
            name,
            loopStart,
            size,
            dataOffset:   payloadOff + SMPL_HDR_SIZE,
            headerOffset: payloadOff,
          });
        }
      }
    } else if (chunkId === ID_SONG) {
      if (payloadLen >= SONG_FIXED_SIZE) {
        const name        = readString32(bytes, payloadOff);
        const numChannels = u32le(bytes, payloadOff + 1088);
        const restartPos  = u32le(bytes, payloadOff + 1092);
        const musicSize   = u32le(bytes, payloadOff + 1096);

        const sampRefs: SongChunk['samples'] = [];
        for (let i = 0; i < 31; i++) {
          const refBase  = payloadOff + 32 + i * 34;
          const refName  = readString32(bytes, refBase);
          const finetune = u8(bytes, refBase + 32);
          const volume   = u8(bytes, refBase + 33);
          sampRefs.push({ name: refName, finetune, volume });
        }

        songChunks.push({
          name,
          samples:     sampRefs,
          numChannels: Math.min(Math.max(numChannels, 1), MAX_CHANNELS),
          restartPos,
          musicSize,
          musicOffset: payloadOff + SONG_FIXED_SIZE,
        });
      }
    }

    pos += chunkLen;
  }

  if (songChunks.length === 0 || sampleChunks.length === 0) return null;

  // ── Build sample index by name ────────────────────────────────────────────

  // Map sample name → index (1-based) into the global samples array
  // Multiple SONG chunks may share samples; each may have different finetune/volume.
  // For simplicity we use the first SONG chunk and assign the first matching sample.
  const firstSong = songChunks[0];
  if (!firstSong) return null;

  const numChannels = firstSong.numChannels;

  // Track per-sample name → globalIdx (0-based into sampleChunks)
  const sampleNameToIdx = new Map<string, number>();
  for (let i = 0; i < sampleChunks.length; i++) {
    const s = sampleChunks[i];
    if (s && !sampleNameToIdx.has(s.name)) {
      sampleNameToIdx.set(s.name, i);
    }
  }

  // Build sampleMap[1..31] → sampleChunks index (0-based), or -1 if not found
  const sampleMap: number[] = new Array(32).fill(-1);
  for (let i = 0; i < 31; i++) {
    const ref = firstSong.samples[i];
    if (!ref || ref.name === '') continue;
    const idx = sampleNameToIdx.get(ref.name);
    if (idx !== undefined) sampleMap[i + 1] = idx;
  }

  // ── Parse music data into patterns ────────────────────────────────────────

  const musicEnd = firstSong.musicOffset + firstSong.musicSize;
  let   musicPos = firstSong.musicOffset;

  // Pattern list built dynamically (KM has no explicit pattern table)
  const patterns:     Pattern[] = [];
  const orderList:    number[]  = [];
  let   restartOrderIdx = 0;

  // Per-channel previous command state (for repeat tracking)
  interface ChannelState {
    prevNote:   number;
    prevInstr:  number;
    prevEffTyp: number;
    prevEff:    number;
    repeat:     number;
    repeatsLeft: number; // global decrement counter
  }
  const chnStates: ChannelState[] = Array.from({ length: numChannels }, () => ({
    prevNote: 0, prevInstr: 0, prevEffTyp: 0, prevEff: 0, repeat: 0, repeatsLeft: 0,
  }));

  let globalRepeatsLeft = 0;

  // Build rows until we run out of music data
  let patRows: TrackerCell[][] = Array.from(
    { length: numChannels },
    () => Array.from({ length: KM_PATTERN_LEN }, () => emptyCell()),
  );
  let rowInPat = KM_PATTERN_LEN; // triggers new pattern creation immediately

  let restartRow = 0;
  let restartPatternIdx = -1;

  function flushPattern(): void {
    const pat = patterns.length;
    const channels: ChannelData[] = patRows.map((rows, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          ch < 2 ? -50 : 50, // Amiga LRRL
      instrumentId: null,
      color:        null,
      rows,
    }));
    patterns.push({
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  KM_PATTERN_LEN,
      channels,
      importMetadata: {
        sourceFormat:            'MUS',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    0,
        originalInstrumentCount: sampleChunks.length,
      },
    });
    orderList.push(pat);
  }

  while (globalRepeatsLeft > 0 || musicPos < musicEnd) {
    // Move to next row (and new pattern if needed)
    rowInPat++;
    if (rowInPat >= KM_PATTERN_LEN) {
      if (patterns.length > 0) {
        // Check if we need to write a pattern break on the final row of the last pattern
        // (handled below for restart row)
      }
      flushPattern();
      patRows = Array.from(
        { length: numChannels },
        () => Array.from({ length: KM_PATTERN_LEN }, () => emptyCell()),
      );
      rowInPat = 0;
    }

    for (let ch = 0; ch < numChannels; ch++) {
      const state = chnStates[ch];
      if (!state) continue;

      if (state.repeat > 0) {
        state.repeat--;
        globalRepeatsLeft--;
        const cell = patRows[ch]?.[rowInPat];
        if (cell) {
          cell.note       = state.prevNote;
          cell.instrument = state.prevInstr;
          cell.effTyp     = state.prevEffTyp;
          cell.eff        = state.prevEff;
        }
        continue;
      }

      if (musicPos >= musicEnd) continue;

      // Check if this offset is the restart position
      if (musicPos - firstSong.musicOffset === firstSong.restartPos) {
        restartOrderIdx   = orderList.length - 1;
        restartRow        = rowInPat;
        restartPatternIdx = patterns.length - 1;
      }

      const noteByte = u8(bytes, musicPos++);

      if (noteByte & 0x80) {
        // Repeat mode
        state.repeat = noteByte & 0x7F;
        globalRepeatsLeft += state.repeat;
        const cell = patRows[ch]?.[rowInPat];
        if (cell) {
          cell.note       = state.prevNote;
          cell.instrument = state.prevInstr;
          cell.effTyp     = state.prevEffTyp;
          cell.eff        = state.prevEff;
        }
        continue;
      }

      // Regular note
      let xmNote = 0;
      if (noteByte > 0 && noteByte <= 36) {
        xmNote = noteByte + KM_NOTE_OFFSET;
      }

      if (musicPos >= musicEnd) continue;
      const instrByte = u8(bytes, musicPos++);
      const instrIdx  = instrByte & 0x1F; // 1-based sample reference index
      const reuseEff  = !!(instrByte & 0x80);

      let effTyp = 0;
      let eff    = 0;

      if (reuseEff) {
        effTyp = state.prevEffTyp;
        eff    = state.prevEff;
      } else {
        if (musicPos + 2 > musicEnd) continue;
        const cmd   = u8(bytes, musicPos++);
        const param = u8(bytes, musicPos++);

        if (cmd < KM_EFF_TRANS.length) {
          const [et, mask] = KM_EFF_TRANS[cmd] ?? [0, 0];
          effTyp = et;
          eff    = mask ? (mask | (param & 0x0F)) : param;
          // speed/tempo split (CMD_SPEED when param >= 0x20 → CMD_TEMPO)
          if (cmd === 18 && param >= 0x20) {
            effTyp = 0x0F; // same as speed (XM uses single F command for both)
          }
        }
      }

      // Map sampleMap[instrIdx] → global sample chunk index
      const globalSmpIdx = instrIdx > 0 ? sampleMap[instrIdx] : -1;
      const trackerInstr = globalSmpIdx >= 0 ? globalSmpIdx + 1 : 0;

      const cell = patRows[ch]?.[rowInPat];
      if (cell) {
        cell.note       = xmNote;
        cell.instrument = trackerInstr;
        cell.effTyp     = effTyp;
        cell.eff        = eff;
      }

      state.prevNote   = xmNote;
      state.prevInstr  = trackerInstr;
      state.prevEffTyp = effTyp;
      state.prevEff    = eff;
    }
  }

  // Flush remaining pattern
  if (rowInPat < KM_PATTERN_LEN - 1 || patterns.length === 0) {
    // Write pattern break if restart row is not at start of pattern
    if (restartRow !== 0 && restartPatternIdx >= 0) {
      const lastPat = patRows[0]?.[rowInPat];
      if (lastPat) {
        lastPat.effTyp = 0x0D; // pattern break
        lastPat.eff    = restartRow;
      }
    }
    flushPattern();
  }

  if (orderList.length === 0) return null;

  // ── Build instruments from sample chunks ──────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < sampleChunks.length; i++) {
    const sc = sampleChunks[i];
    if (!sc) continue;

    const id   = i + 1;
    const name = sc.name || `Sample ${id}`;

    if (sc.size === 0 || sc.dataOffset + sc.size > bytes.length) {
      const kmSilentChipRam: UADEChipRamInfo = {
        moduleBase: 0,
        moduleSize: bytes.length,
        instrBase: sc.headerOffset,
        instrSize: SMPL_HDR_SIZE + sc.size,
        sections: {},
      };
      const kmSilentInst = silentInstrument(id, name);
      kmSilentInst.uadeChipRam = kmSilentChipRam;
      instruments.push(kmSilentInst);
      continue;
    }

    // KM samples: 8-bit signed PCM, loopStart + loopEnd = size (loop always to end)
    const rawPcm = bytes.subarray(sc.dataOffset, sc.dataOffset + sc.size);

    // Convert signed to unsigned (createSamplerInstrument expects unsigned)
    const pcm8 = new Uint8Array(sc.size);
    for (let j = 0; j < sc.size; j++) {
      const s = rawPcm[j] ?? 0;
      pcm8[j] = ((s < 128 ? s : s - 256) + 128) & 0xFF;
    }

    // Get finetune and volume from the first song's sample reference that matches
    let finetune = 0;
    let volume   = 64;
    for (let s = 0; s < 31; s++) {
      const ref = firstSong.samples[s];
      if (ref && ref.name === sc.name) {
        const ft = ref.finetune & 0x0F;
        finetune = MOD2XM_FINETUNE[ft] ?? 0;
        volume   = Math.min(ref.volume, 64);
        break;
      }
    }

    // Loop: loopStart == 0 && size == loopEnd (always loop-to-end in KM)
    // OpenMPT sets mptSample.nLoopEnd = mptSample.nLength = sampleHeader.size
    //           and mptSample.nLoopStart = sampleHeader.loopStart
    //           and CHN_LOOP flag always set
    const loopStart = sc.loopStart;
    const loopEnd   = sc.size;

    const inst = createSamplerInstrument(
      id, name, pcm8, volume, SAMPLE_RATE, loopStart, loopEnd,
    );

    // Apply finetune via the modPlayback metadata
    if (inst.metadata?.modPlayback) {
      inst.metadata.modPlayback.finetune         = finetune;
      inst.metadata.modPlayback.periodMultiplier = AMIGA_PAL_FREQ;
    }

    inst.uadeChipRam = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: sc.headerOffset,
      instrSize: SMPL_HDR_SIZE + sc.size,
      sections: {},
    } satisfies UADEChipRamInfo;
    instruments.push(inst);
  }

  // ── Assemble TrackerSong ──────────────────────────────────────────────────

  const songName = firstSong.name || filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: restartOrderIdx >= 0 ? restartOrderIdx : 0,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function silentInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig;
}
