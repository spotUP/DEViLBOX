/**
 * DeltaMusic2Parser.ts — Delta Music 2.0 native parser
 *
 * Delta Music 2.0 is a 4-channel Amiga tracker using wavetable-based synthesis
 * and optional PCM sample playback. It stores 4 independent channel tracks, each
 * a sequence of [block_number, transpose] pairs. Blocks are 16-row × 4-byte
 * patterns (note, instrument, effect, param). Instruments carry either a PCM
 * sample reference or a waveform index sequence (synth).
 *
 * Reference: NostalgicPlayer DeltaMusic20Worker.cs (authoritative loader/replayer)
 * Reference: Delta Music 2.0.txt format spec
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/Delta Music 2/
 *
 * File layout (all offsets from file start):
 *   0x000 – 0x877  Player code (878 bytes)
 *   0x878 – 0x9A3  Internal channel structures
 *   0x9A4 – 0xAE1  Sound-effect channel structures
 *   0xAE2 – 0xB8B  Period table (85 × uint16 BE)
 *   0xB8C – 0xBC5  Internal global variables
 *   0xBC6 – 0xBC9  ID: ".FNL"
 *   0xBCA – 0xFC9  Arpeggios (64 × 16 bytes = 1024 bytes)
 *   0xFCA – 0xFD9  Track loop positions + track lengths (4 pairs × 2×uint16)
 *   0xFDA –        Track 1..4 data (variable length; each 2-byte pair = [block_num, transpose])
 *   +               Block data length (uint32 BE) + block data (64 bytes/block = 16 rows × 4 bytes)
 *   +               Instrument offset table (128 × uint16 BE; last entry = breakOffset) + instrument data
 *   +               Waveform data length (uint32 BE) + waveform data (256 bytes/waveform)
 *   +               64 unknown bytes
 *   +               8 sample offsets (uint32 BE each) + sample PCM data
 *
 * Note mapping:
 *   The DM2 note byte is a direct index into the period table embedded at 0xAE2.
 *   For synth instruments the note index IS the XM note number (1-based), because
 *   the period table mirrors the standard XM period table layout. The sample is stored
 *   at a base rate of PAL_CLOCK / (2 × periods[REFERENCE_NOTE]) so that note N plays
 *   the waveform at the correct Amiga frequency.
 *
 *   For PCM sample instruments, the same mapping applies: use note index as XM note,
 *   store sample at PAL C-3 rate (8287 Hz) with baseNote='C3' (XM note 37), and
 *   the DM2 note value maps directly to the XM note in the pattern cell.
 *
 *   REFERENCE_NOTE = 37 (period 856 = ProTracker C-1 → XM C3 = note 37)
 *   At XM note 37, baseNote 'C3': plays at natural sample rate.
 *   DM2 note 37 (period 856) at PAL: 3546895/(2×856) = 2072 Hz sample rate.
 *   DM2 note 61 (period 214) at PAL: 3546895/(2×214) = 8287 Hz = C-3 PAL standard.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import type { DeltaMusic2Config, DeltaMusic2VolEntry, DeltaMusic2VibEntry, UADEChipRamInfo } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────

/** PAL Amiga clock frequency (Hz) */
const PAL_CLOCK = 3546895;

/**
 * Reference DM2 note index for base-note tuning.
 * DM2 note 37 → period 856 → sample rate 2072 Hz → base-note 'C3' (XM note 37).
 * All synth waveforms are stored at this rate so note values map 1:1 to XM notes.
 */
const REFERENCE_NOTE = 37;

/**
 * PAL sample rate at the reference note (period 856).
 * Synth waveforms are stored at this rate with baseNote='C3'.
 */
const SYNTH_BASE_RATE = Math.round(PAL_CLOCK / (2 * 856)); // 2072 Hz

/**
 * PAL Amiga C-3 reference sample rate (period 214).
 * PCM samples are stored at this rate with baseNote='C3', matching Amiga standard.
 * At DM2 note 61 (period 214), PCM samples play at natural rate.
 * Since note 61 ≠ 37 (REFERENCE_NOTE), PCM samples use a different rate from synth.
 */
const PCM_BASE_RATE = Math.round(PAL_CLOCK / (2 * 214)); // 8287 Hz

// ── Utility ────────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` appears to be a Delta Music 2.0 module.
 * Checks the ".FNL" magic at offset 0xBC6 and the minimum file size.
 */
export function isDeltaMusic2Format(bytes: Uint8Array): boolean {
  if (bytes.length < 0xfda) return false;
  return (
    bytes[0xbc6] === 0x2e && // '.'
    bytes[0xbc7] === 0x46 && // 'F'
    bytes[0xbc8] === 0x4e && // 'N'
    bytes[0xbc9] === 0x4c    // 'L'
  );
}

// ── Internal data types ────────────────────────────────────────────────────

interface DM2Track {
  loopPosition: number;
  entries: Array<{ blockNumber: number; transpose: number }>;
}

interface DM2BlockLine {
  note: number;       // raw note index (0 = no note); use directly as XM note after transpose
  instrument: number; // 0-based instrument index
  effect: number;     // effect type (0x00–0x08)
  effectArg: number;  // effect argument
}

interface DM2Instrument {
  sampleLength: number;  // in bytes (already doubled from words)
  repeatStart: number;   // in bytes (raw, NOT doubled)
  repeatLength: number;  // in bytes (already doubled from words)
  pitchBend: number;
  isSample: boolean;     // true = PCM sample, false = synth waveform
  sampleNumber: number;  // which PCM sample slot (0-7)
  table: Uint8Array;     // 48-byte waveform sequence table
  sampleData?: Int8Array; // PCM data if isSample
  /** DeltaMusic2Config built from instrument header at parse time */
  dm2Config: DeltaMusic2Config;
  /** Chip RAM address of this instrument's header (= instrumentDataBase + instrumentOffsets[i]) */
  instrBase: number;
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Delta Music 2.0 module file and return a TrackerSong.
 * Returns null if the file cannot be parsed (wrong magic, truncated, etc.).
 */
export function parseDeltaMusic2File(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isDeltaMusic2Format(bytes)) return null;

  // ── Period table (85 × uint16 BE at 0xAE2) ────────────────────────────
  // periods[0] = 0 (no note), periods[1..84] = valid Amiga periods.
  // Note: the table is identical across all DM2 files (embedded player code).
  const periods: number[] = [];
  for (let i = 0; i < 85; i++) {
    periods.push(u16BE(bytes, 0xAE2 + i * 2));
  }

  // Verify the REFERENCE_NOTE period matches expected value for correct tuning
  // periods[37] should be 856 (PAL ProTracker C-1). If not, log a warning.
  if (periods[REFERENCE_NOTE] !== 856) {
    console.warn(`[DeltaMusic2Parser] Unexpected reference period: ${periods[REFERENCE_NOTE]} (expected 856)`);
  }

  // ── Start speed (int8 at 0xBBB) ───────────────────────────────────────
  const startSpeed = s8(bytes[0xBBB]);
  const speed = Math.max(1, Math.min(15, startSpeed > 0 ? startSpeed : 3));

  // ── Arpeggios (64 × 16 signed bytes at 0xBCA) ─────────────────────────
  const arpeggios: Int8Array[] = [];
  for (let i = 0; i < 64; i++) {
    const arr = new Int8Array(16);
    for (let j = 0; j < 16; j++) {
      arr[j] = s8(bytes[0xBCA + i * 16 + j]);
    }
    arpeggios.push(arr);
  }

  // ── Track header (4 × [loopPos uint16, length uint16]) at 0xFCA ───────
  const trackByteLens: number[] = [];
  const trackLoops: number[] = [];
  for (let i = 0; i < 4; i++) {
    trackLoops.push(u16BE(bytes, 0xFCA + i * 4));
    trackByteLens.push(u16BE(bytes, 0xFCA + i * 4 + 2));
  }

  // ── Track entries at 0xFDA ─────────────────────────────────────────────
  const tracks: DM2Track[] = [];
  let off = 0xFDA;
  for (let i = 0; i < 4; i++) {
    const entryCount = trackByteLens[i] / 2; // 2 bytes per entry
    const entries: Array<{ blockNumber: number; transpose: number }> = [];
    for (let j = 0; j < entryCount; j++) {
      entries.push({
        blockNumber: bytes[off],
        transpose: s8(bytes[off + 1]),
      });
      off += 2;
    }
    tracks.push({ loopPosition: trackLoops[i], entries });
  }

  // ── Block data ────────────────────────────────────────────────────────
  if (off + 4 > bytes.length) return null;
  const blockDataLen = u32BE(bytes, off);
  off += 4;
  const numBlocks = Math.floor(blockDataLen / 64);
  const blocks: DM2BlockLine[][] = [];

  for (let b = 0; b < numBlocks; b++) {
    const blockLines: DM2BlockLine[] = [];
    for (let row = 0; row < 16; row++) {
      blockLines.push({
        note: bytes[off],
        instrument: bytes[off + 1],
        effect: bytes[off + 2],
        effectArg: bytes[off + 3],
      });
      off += 4;
    }
    blocks.push(blockLines);
  }

  // ── Instrument offsets (256 bytes: 127 × uint16 for indices 1–127, then breakOffset) ──
  // Per C# loader: ReadArray_B_UINT16s(instrumentOffsets, 1, 127) reads 127 values into
  // indices 1..127. Index 0 is implicitly 0 (instrument 0 is at byte offset 0 from base).
  if (off + 256 > bytes.length) return null;
  const instrumentOffsets: number[] = new Array(128).fill(0);
  for (let i = 1; i <= 127; i++) {
    instrumentOffsets[i] = u16BE(bytes, off + (i - 1) * 2);
  }
  const breakOffset = u16BE(bytes, off + 254); // 127 × 2 = 254 bytes into the section
  off += 256; // advance past the full 256-byte offset table (127 offsets + breakOffset + pad word)

  // ── Instrument data ───────────────────────────────────────────────────
  const instrumentDataBase = off;
  const rawInstruments: (DM2Instrument | null)[] = [];

  for (let i = 0; i < 128; i++) {
    if (instrumentOffsets[i] === breakOffset) {
      break; // no more instruments
    }
    const base = instrumentDataBase + instrumentOffsets[i];
    if (base + 88 > bytes.length) break;

    let iOff = base;

    // Per C# loader (DeltaMusic20Worker.cs lines 233-244):
    //   SampleLength = (ushort)(Read_B_UINT16() * 2)   -- words → bytes
    //   RepeatStart  = Read_B_UINT16()                  -- raw value (already in bytes per spec offset 2)
    //   RepeatLength = (ushort)(Read_B_UINT16() * 2)   -- words → bytes
    const sLen  = u16BE(bytes, iOff) * 2;  iOff += 2;
    const rStart = u16BE(bytes, iOff);     iOff += 2;
    let   rLen   = u16BE(bytes, iOff) * 2; iOff += 2;

    // Guard: loop cannot extend beyond sample
    if (rStart + rLen >= sLen && sLen > 0) {
      rLen = sLen > rStart ? sLen - rStart : 0;
    }

    // Volume table: 5 × 3 bytes (speed, level, sustain) at base+6
    const volTable: DeltaMusic2VolEntry[] = [];
    for (let v = 0; v < 5; v++) {
      volTable.push({
        speed:   bytes[base + 6 + v * 3],
        level:   bytes[base + 7 + v * 3],
        sustain: bytes[base + 8 + v * 3],
      });
    }
    iOff += 15;

    // Vibrato table: 5 × 3 bytes (speed, delay, sustain) at base+21
    const vibTable: DeltaMusic2VibEntry[] = [];
    for (let v = 0; v < 5; v++) {
      vibTable.push({
        speed:   bytes[base + 21 + v * 3],
        delay:   bytes[base + 22 + v * 3],
        sustain: bytes[base + 23 + v * 3],
      });
    }
    iOff += 15;

    const pitchBend   = u16BE(bytes, iOff); iOff += 2;
    const isSampleByte = bytes[iOff];        iOff++;
    const sampleNum   = bytes[iOff] & 0x7;  iOff++;
    const table       = new Uint8Array(bytes.buffer, bytes.byteOffset + iOff, 48);

    rawInstruments.push({
      sampleLength:  sLen,
      repeatStart:   rStart,
      repeatLength:  rLen,
      pitchBend,
      isSample:      isSampleByte === 0xff,
      sampleNumber:  sampleNum,
      table,
      dm2Config: {
        volTable,
        vibTable,
        pitchBend,
        table: new Uint8Array(table),
        isSample: isSampleByte === 0xff,
      },
      instrBase: base,
    });
  }

  // Advance offset past all instrument data (to breakOffset from instrumentDataBase)
  off = instrumentDataBase + breakOffset;

  // ── Waveform data ─────────────────────────────────────────────────────
  if (off + 4 > bytes.length) return null;
  const waveformDataLen = u32BE(bytes, off); off += 4;
  const numWaveforms = Math.floor(waveformDataLen / 256);
  const waveforms: Int8Array[] = [];

  for (let w = 0; w < numWaveforms; w++) {
    if (off + 256 > bytes.length) break;
    const wave = new Int8Array(256);
    for (let j = 0; j < 256; j++) {
      wave[j] = s8(bytes[off + j]);
    }
    waveforms.push(wave);
    off += 256;
  }

  // ── Skip 64 unknown bytes ─────────────────────────────────────────────
  off += 64;

  // ── 8 sample start offsets (uint32 BE each) ───────────────────────────
  if (off + 32 > bytes.length) {
    // No sample data section — OK, all instruments must be synth
  } else {
    const sampleOffsets: number[] = [];
    for (let i = 0; i < 8; i++) {
      sampleOffsets.push(u32BE(bytes, off + i * 4));
    }
    off += 32;
    const sampleDataBase = off;

    // Attach PCM data to sample instruments
    for (const inst of rawInstruments) {
      if (!inst || !inst.isSample) continue;
      const sn = inst.sampleNumber;
      if (sn >= 8) continue;
      const sampleOff = sampleDataBase + sampleOffsets[sn];
      if (sampleOff + inst.sampleLength > bytes.length) continue;
      inst.sampleData = new Int8Array(
        bytes.buffer,
        bytes.byteOffset + sampleOff,
        inst.sampleLength
      );
    }
  }

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  // Instruments are 0-indexed in DM2 pattern cells; DEViLBOX uses 1-based IDs.
  // rawInstruments may contain nulls (holes) only from a break during loading.
  const dm2Instruments = rawInstruments.filter((x): x is DM2Instrument => x !== null);
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < dm2Instruments.length; i++) {
    const inst = dm2Instruments[i];
    const id = i + 1; // 1-based

    // Build UADEChipRamInfo — common to all three instrument branches.
    // DeltaMusic2 loads at chip RAM address 0x000000 (moduleBase=0),
    // so file offsets equal chip RAM addresses directly.
    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: inst.instrBase,
      instrSize: 88,
      sections: { instrumentTable: instrumentDataBase },
    };

    let builtInstrument: InstrumentConfig;

    if (inst.isSample && inst.sampleData && inst.sampleLength > 0) {
      // ── PCM sample instrument ──────────────────────────────────────────
      // Amiga PCM samples are 8-bit signed at PAL C-3 rate (8287 Hz).
      // DM2 stores repeatStart in raw bytes (NOT doubled like lengths).
      // NostalgicPlayer: RepeatLength > 2 → loop; else no loop.
      const pcmUint8 = new Uint8Array(inst.sampleLength);
      for (let j = 0; j < inst.sampleLength; j++) {
        pcmUint8[j] = inst.sampleData[j] & 0xff;
      }
      const hasLoop = inst.repeatLength > 2;
      const loopStart = hasLoop ? inst.repeatStart : 0;
      const loopEnd   = hasLoop ? inst.repeatStart + inst.repeatLength : 0;

      builtInstrument = createSamplerInstrument(id, `Sample ${i}`, pcmUint8, 64, PCM_BASE_RATE, loopStart, loopEnd);
    } else if (!inst.isSample && inst.sampleLength > 0 && waveforms.length > 0) {
      // ── Synth (waveform) instrument ───────────────────────────────────
      // The first entry in inst.table gives the initial waveform index.
      // 0xff = loop-back marker; any waveform index below that is valid.
      const waveIdx = (inst.table[0] !== undefined && inst.table[0] !== 0xff)
        ? inst.table[0]
        : 0;
      const clampedWave = Math.max(0, Math.min(waveIdx, waveforms.length - 1));
      const waveform = waveforms[clampedWave];

      // The DM2 player loops the waveform over [0, sampleLength) bytes.
      // sampleLength is in bytes (already converted from words above).
      const playLen = Math.min(inst.sampleLength, 256);
      const pcmUint8 = new Uint8Array(playLen);
      for (let j = 0; j < playLen; j++) {
        pcmUint8[j] = waveform[j % 256] & 0xff;
      }

      // Store at SYNTH_BASE_RATE (2072 Hz) with baseNote='C3' (XM note 37).
      // This ensures that DM2 note N (used directly as XM note N in patterns)
      // plays the waveform at the correct Amiga period frequency:
      //   playbackRate = SYNTH_BASE_RATE × 2^((N − 37)/12)
      //   = (PAL_CLOCK/2/856) × 2^((N−37)/12)
      //   = PAL_CLOCK / (2 × periods[N])   [because periods[N] = 856 / 2^((N−37)/12)]
      builtInstrument = createSamplerInstrument(id, `Synth ${i}`, pcmUint8, 64, SYNTH_BASE_RATE, 0, playLen);
    } else {
      // Placeholder (no sample data / no waveforms)
      builtInstrument = {
        id,
        name: `Instrument ${i}`,
        type: 'synth' as const,
        synthType: 'DeltaMusic2Synth' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as InstrumentConfig;
    }

    // Attach DeltaMusic2Config and chip RAM metadata to every instrument
    builtInstrument.deltaMusic2 = inst.dm2Config;
    builtInstrument.uadeChipRam = chipRam;

    instruments.push(builtInstrument);
  }

  // ── Build patterns ─────────────────────────────────────────────────────
  // Delta Music 2 plays all 4 channels independently. Each channel has its own
  // position pointer stepping through its track entry list. We flatten the 4
  // independent tracks into TrackerSong "patterns" by zipping track positions:
  // song position P uses tracks[ch].entries[P] for channel ch.
  //
  // Shorter tracks use loop wrapping from trackLoopPosition.

  const maxTrackLen = Math.max(...tracks.map(t => t.entries.length), 1);
  const trackerPatterns: Pattern[] = [];

  for (let pos = 0; pos < maxTrackLen; pos++) {
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let ch = 0; ch < 4; ch++) {
      const trackEntries = tracks[ch].entries;
      const tLen = trackEntries.length;

      let trackPos = pos;
      if (tLen === 0) {
        // Empty channel — fill with silent rows
        for (let row = 0; row < 16; row++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        continue;
      }

      if (trackPos >= tLen) {
        // Loop: wrap from loopPosition
        const loopStart = tracks[ch].loopPosition < tLen ? tracks[ch].loopPosition : 0;
        const loopSpan = tLen - loopStart;
        if (loopSpan > 0) {
          trackPos = loopStart + ((pos - loopStart) % loopSpan);
        } else {
          trackPos = tLen - 1;
        }
      }

      const entry = trackEntries[trackPos];
      const blockIdx = entry.blockNumber;
      const transpose = entry.transpose;
      const block = blockIdx < blocks.length ? blocks[blockIdx] : null;

      for (let row = 0; row < 16; row++) {
        if (!block) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const line = block[row];

        // DM2 note byte + transpose → XM note number (1-based; 0 = no note)
        // The DM2 period table index is the XM note number directly.
        // Valid range: 1-84 (clamped). 0 means no note.
        let xmNote = 0;
        if (line.note > 0) {
          const noteIdx = line.note + transpose;
          xmNote = Math.max(1, Math.min(96, noteIdx));
        }

        // DEViLBOX instruments are 1-based
        const instrId = line.instrument < dm2Instruments.length ? line.instrument + 1 : 0;

        // Effect mapping: DM2 effects → XM effects
        let effTyp = 0;
        let eff = 0;
        let effTyp2 = 0;
        let eff2 = 0;

        switch (line.effect) {
          case 0x01: // SetSpeed: new play speed (low nibble of effectArg)
            effTyp = 0x0F;
            eff = Math.max(1, line.effectArg & 0x0f);
            break;

          case 0x02: // SetFilter: Amiga LED filter toggle — no XM equivalent, omit
            break;

          case 0x03: // SetBendRateUp: pitch bend up (period decreases)
            effTyp = 0x01; // XM portamento up
            eff = line.effectArg & 0xff;
            break;

          case 0x04: // SetBendRateDown: pitch bend down (period increases)
            effTyp = 0x02; // XM portamento down
            eff = line.effectArg & 0xff;
            break;

          case 0x05: // SetPortamento: tone portamento speed
            effTyp = 0x03; // XM tone portamento
            eff = line.effectArg;
            break;

          case 0x06: { // SetVolume: channel max volume (0–63 Amiga scale)
            // Encode as XM volume column: 0x10 = vol 0, 0x50 = vol 64
            const xmVol = Math.round((line.effectArg & 0x3f) / 63 * 64);
            channelRows[ch].push({
              note: xmNote,
              instrument: instrId,
              volume: 0x10 + Math.min(64, xmVol),
              effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
            });
            continue; // volume already set, skip the push below
          }

          case 0x07: { // SetGlobalVolume (0–63 Amiga scale → 0–64 XM scale)
            effTyp = 0x10; // XM global volume (Gxx)
            eff = Math.min(64, Math.round((line.effectArg & 0x3f) / 63 * 64));
            break;
          }

          case 0x08: { // SetArp: select arpeggio table (effectArg & 0x3f = table index)
            // Map to XM arpeggio effect 0xy using first two semitone offsets
            const arpIdx = line.effectArg & 0x3f;
            const arpTable = arpIdx < arpeggios.length ? arpeggios[arpIdx] : null;
            if (arpTable) {
              const x = Math.max(0, Math.min(15, arpTable[1] > 0 ? arpTable[1] : 0));
              const y = Math.max(0, Math.min(15, arpTable[2] > 0 ? arpTable[2] : 0));
              effTyp = 0x00; // XM arpeggio
              eff = (x << 4) | y;
            }
            break;
          }

          default:
            break; // effect 0x00 = None
        }

        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2,
          eff2,
        });
      }
    }

    trackerPatterns.push({
      id: `pattern-${pos}`,
      name: `Position ${pos}`,
      length: 16,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        // Amiga hard stereo LRRL panning
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'DM2',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numBlocks,
        originalInstrumentCount: dm2Instruments.length,
      },
    });
  }

  // Fallback: ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 16,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 16 }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'DM2',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'DM2' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
  };
}
