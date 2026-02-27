/**
 * MusicLineParser.ts — Native parser for MusicLine Editor (.ml) files
 *
 * Binary format verified 1:1 against Reference Code/musicline-vasm/Mline116.asm.
 *
 * KEY FACTS (from ASM source, do not change without re-verifying):
 *
 *  File header (before first chunk):
 *    "MLEDMODL"(8) + sizeField(u32BE, 4) + sizeField_bytes_of_extra_header
 *    First chunk starts at offset 8 + 4 + sizeField = 12 + sizeField.
 *    sizeField varies by ML version (e.g. 4, 8, 12 bytes of extra header).
 *
 *  Chunks: VERS(opt) → TUNE → PART×N → ARPG×M → INST×I → SMPL×S → INFO(opt)
 *  Each chunk header: chunkId(4) + size(u32BE, 4)
 *
 *  TUNE chunk (sequential read, LoadTune @ line 5230):
 *    40 bytes: title[32]+tempo(u16BE)+speed(u8)+groove(u8)+volume(u16BE)+playMode(u8)+numChannels(u8)
 *    numChannels × u32BE: per-channel trimmed chnl_Data byte counts (0 = empty channel)
 *    For each non-zero count: that many bytes of chnl_Data (up to 512 = 256 entries × 2 bytes)
 *
 *  chnl_Data entry (2 bytes, big-endian u16, PlayVoice @ line 9690):
 *    byte0 (HIGH_BYTE) = low 8 bits of part number
 *    byte1 (LOW_BYTE):
 *      bit5 = 0 → play-part entry
 *        bits 7:6 = high 2 bits of part number  (partNum = (bits7:6 << 8) | byte0)
 *        bits 4:0 = transpose (0x10 = no transpose, range -16..+15 semitones)
 *      bit5 = 1 → control command
 *        bits 7:6 = 01 → STOP (voice silenced)
 *        bits 7:6 = 10 → JUMP (byte0 = target position)
 *        bits 7:6 = 11 → WAIT (byte0 = wait count; bits4:0 = new speed if non-zero)
 *    Default fill: 0x0010 (play PART 0, no transpose)
 *    TunePos advances when PartPos wraps 127→0 (= after 128 rows of current PART).
 *
 *  PART chunk (LoadPart @ line 5312, single-voice data):
 *    2-byte part number (u16BE) + RLE-compressed rows
 *    Decompressed: 128 rows × 12 bytes/row = 1536 bytes for ONE VOICE:
 *      byte 0: note (0=rest, 1-60=musical, 61=end-of-part sentinel)
 *      byte 1: instrument (1-based; 0=no change; 0xFF=no change sentinel)
 *      bytes 2-11: effect data (effectNum, effectPar, 4×effectWord)
 *    The 6 RLE columns per row correspond to 6×2 bytes of one voice row.
 *    PARTs are shared across all channels; each channel picks PARTs via its chnl_Data.
 *
 *  INST chunk (LoadInst @ line 5371): 206 bytes (inst_SIZEOF - inst_Title)
 *  SMPL chunk (LoadSmpl @ line 5403):
 *    6-byte extra header: rawDataSize(u32BE)+deltaCommand(u8)+pad(u8)
 *    50-byte smpl metadata (smpl_Title through smpl_SemiTone)
 *    Sample data: raw if storedSize==rawDataSize, else delta-packed nibbles
 *
 *  TUNE chunk size IS reliable (computed correctly in SaveSong @ line 7175-7207).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { createSamplerInstrument, amigaNoteToXM } from './AmigaUtils';

// ── Constants ──────────────────────────────────────────────────────────────

const ML_FILE_MAGIC = 0x4d4c4544; // 'MLED'
const ML_FILE_MAGIC2 = 0x4d4f444c; // 'MODL' (combined "MLEDMODL")
const CHUNK_TUNE = 0x54554e45; // 'TUNE'
const CHUNK_VERS = 0x56455253; // 'VERS'
const CHUNK_PART = 0x50415254; // 'PART'
const CHUNK_ARPG = 0x41525047; // 'ARPG'
const CHUNK_INST = 0x494e5354; // 'INST'
const CHUNK_SMPL = 0x534d504c; // 'SMPL'

const TUNE_HEADER_SIZE = 40;   // bytes from tune_Title to end of tune_Channels (incl. numChannels)
const PART_ROWS = 128;
const PART_COLS = 6;
const PART_ROW_BYTES = PART_COLS * 2;  // 12 bytes per row
const PART_FULL_SIZE = PART_ROWS * PART_ROW_BYTES; // 1536 bytes
const INST_SIZE = 206;   // inst_SIZEOF - inst_Title (verified from struct counting)
const SMPL_META_SIZE = 50; // smpl_SampleData - smpl_Title (verified)
const SMPL_EXTRA_HDR = 6;  // rawDataSize[4] + deltaCommand[1] + pad[1]

// Amiga PAL C-3 sample rate (3546895 / 2 / 428 ≈ 8287 Hz at C-1, ×8 at C-4)
const PAL_C3_RATE = 8287;

// MusicLine note 61 = end-of-part sentinel (not a musical note)
const ML_NOTE_END = 61;

// chnl_Data command byte1 values
const CHNL_CMD_FLAG = 0x20;     // bit5 = 1: command entry
const CHNL_CMD_TYPE_MASK = 0xC0; // bits 7:6 = command type
const CHNL_CMD_END = 0x40;      // type 01: end channel
const CHNL_CMD_JUMP = 0x80;     // type 10: jump (loop)

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if `data` looks like a MusicLine Editor file.
 * Detection: bytes 0-7 == "MLEDMODL"
 */
export function isMusicLineFile(data: Uint8Array): boolean {
  if (data.length < 16) return false;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return v.getUint32(0) === ML_FILE_MAGIC && v.getUint32(4) === ML_FILE_MAGIC2;
}

/**
 * Parse a MusicLine Editor file into a TrackerSong.
 * Returns null on parse error.
 */
export function parseMusicLineFile(data: Uint8Array): TrackerSong | null {
  if (!isMusicLineFile(data)) return null;

  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = data.byteLength;

  // Skip: "MLEDMODL"(8) + sizeField(4) + sizeField bytes of extra header
  // The extra header size varies by MusicLine version (4, 8, 12, ... bytes).
  // sizeField at offset 8 tells us exactly how many extra bytes follow.
  //   0x00: "MLEDMODL" (8 bytes)
  //   0x08: u32BE — size of extra header that follows
  //   0x0C: extra header bytes (magic, timestamps, etc.)
  //   0x0C + sizeField: first chunk (e.g. VERS or TUNE)
  if (len < 12) return null;
  const headerExtraSize = v.getUint32(8);
  let pos = 8 + 4 + headerExtraSize;

  // Parsed data accumulators
  let songTitle = '';
  let tempo = 125;
  let speed = 6;
  let groove = 0;
  let numChannels = 4;
  const channelTrackTables: number[][] = [];  // [chIdx][posIdx] = partIdx
  const channelSpeeds: number[] = [];          // ticks per row per channel (all same for now)
  const channelGrooves: number[] = [];         // groove speed per channel

  // Map from partNumber → decompressed PART data (1536 bytes)
  const partDataMap = new Map<number, Uint8Array>();

  // INST structs (raw, indexed by instrument order)
  interface InstData {
    title: string;
    smplNumber: number;
    volume: number;       // 0–64
    fineTune: number;     // signed, may be used for finetune
    semiTone: number;     // signed, semitone transposition
    smplRepStart: number; // loop start in words
    smplRepLen: number;   // loop length in words
  }
  const instList: InstData[] = [];

  // SMPL PCM data (indexed by smpl order = smplNumber - 1 or by appearance order)
  interface SmplData {
    title: string;
    pcm: Uint8Array;      // decompressed signed 8-bit PCM
    smplLength: number;   // in words (actual byte length = smplLength * 2)
    repLength: number;    // loop length in words
    fineTune: number;
    semiTone: number;
  }
  const smplList: SmplData[] = [];

  // ── Chunk parsing loop ────────────────────────────────────────────────────
  while (pos + 8 <= len) {
    const chunkId = v.getUint32(pos);
    const chunkSize = v.getUint32(pos + 4);
    const dataStart = pos + 8;

    // Guard against corrupt chunk sizes
    if (dataStart + chunkSize > len + 16) {
      // Allow small over-reads (TUNE stores wrong size); stop on large mismatch
      if (chunkId !== CHUNK_TUNE) break;
    }

    if (chunkId === CHUNK_VERS) {
      // VERS: just skip
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_TUNE) {
      // ── TUNE: read sequentially (stored size may be wrong) ────────────────
      // IMPORTANT: The TUNE chunk size in the file is NOT reliable.
      // We must read exactly what we need and advance pos accordingly.
      // The loader (Mline116.asm:5250-5307) ignores chunk size for TUNE.

      let t = dataStart;
      if (t + TUNE_HEADER_SIZE > len) break;

      // Title: 32 bytes
      songTitle = readCString(data, t, 32);
      t += 32;

      // tempo (u16BE), speed (u8), groove (u8), volume (u16BE, ignore), playMode (u8), numChannels (u8)
      tempo = v.getUint16(t);      t += 2;
      speed = data[t++];
      groove = data[t++];
      /* volume = */ v.getUint16(t); t += 2;  // master volume 0-64
      /* playMode = */ data[t++];              // 0=4ch, 1=8ch
      numChannels = data[t++];

      if (numChannels === 0 || numChannels > 8) numChannels = 4; // safety

      // Channel size table: numChannels × u32BE
      if (t + numChannels * 4 > len) break;
      const channelSizeTable: number[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        channelSizeTable.push(v.getUint32(t));
        t += 4;
      }

      // Per-channel track table data
      for (let ch = 0; ch < numChannels; ch++) {
        const storedBytes = channelSizeTable[ch];
        if (storedBytes === 0 || t + storedBytes > len) {
          // Empty or missing channel — give it a default empty track table
          channelTrackTables.push([]);
          channelSpeeds.push(speed);
          channelGrooves.push(groove);
          if (storedBytes > 0 && t + storedBytes <= len) t += storedBytes;
          continue;
        }

        const trackTable = parseChnlData(data, t, storedBytes);
        channelTrackTables.push(trackTable.patternSeq);
        channelSpeeds.push(speed);
        channelGrooves.push(groove);
        t += storedBytes;
      }

      // After reading all channel data, set pos = t (sequential, not chunk-size-based)
      pos = t;
      continue; // don't execute pos = dataStart + chunkSize below

    } else if (chunkId === CHUNK_PART) {
      // ── PART: 2-byte part number + RLE compressed pattern ─────────────────
      if (chunkSize < 2 || dataStart + chunkSize > len) {
        pos = dataStart + chunkSize;
        continue;
      }

      const partNumber = v.getUint16(dataStart);
      const rleStart = dataStart + 2;
      const rleLen = chunkSize - 2;

      const decompressed = decompressPart(data, rleStart, rleLen);
      partDataMap.set(partNumber, decompressed);

      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_ARPG) {
      // ARPG: 2-byte arpeggio number + arpeggio data — skip for now
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_INST) {
      // ── INST: 206-byte instrument struct ──────────────────────────────────
      if (chunkSize < INST_SIZE || dataStart + chunkSize > len) {
        pos = dataStart + chunkSize;
        continue;
      }

      instList.push(parseInst(v, data, dataStart));
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_SMPL) {
      // ── SMPL: 6-byte extra header + 50-byte metadata + sample data ────────
      if (chunkSize < SMPL_EXTRA_HDR + SMPL_META_SIZE || dataStart + chunkSize > len) {
        pos = dataStart + chunkSize;
        continue;
      }

      const smpl = parseSmpl(v, data, dataStart, chunkSize);
      if (smpl) smplList.push(smpl);

      pos = dataStart + chunkSize;

    } else {
      // Unknown chunk ID — stop (loader does same: hits CloseFile on unknown ID)
      break;
    }
  }

  // ── Build TrackerSong ─────────────────────────────────────────────────────

  // Collect all used part numbers and build a sorted partNumber→patternIndex map
  const usedPartNumbers = new Set<number>();
  for (const table of channelTrackTables) {
    for (const p of table) usedPartNumbers.add(p);
  }

  // Sort part numbers so pattern indices are deterministic
  const sortedPartNumbers = Array.from(usedPartNumbers).sort((a, b) => a - b);
  const partToPatternIndex = new Map<number, number>();
  sortedPartNumbers.forEach((pn, idx) => partToPatternIndex.set(pn, idx));

  // Also include parts not referenced (in case they exist in the file)
  for (const pn of partDataMap.keys()) {
    if (!partToPatternIndex.has(pn)) {
      partToPatternIndex.set(pn, partToPatternIndex.size);
    }
  }

  // Build Pattern array — each PART = single-voice 1-channel pattern
  const patterns: Pattern[] = [];
  for (const pn of partToPatternIndex.keys()) {
    const patIdx = partToPatternIndex.get(pn)!;
    const rawData = partDataMap.get(pn);
    patterns[patIdx] = buildPattern(rawData, patIdx, pn);
  }

  // Map channelTrackTables from partNumbers to patternIndices
  const mappedTrackTables: number[][] = channelTrackTables.map(table =>
    table.map(pn => partToPatternIndex.get(pn) ?? 0)
  );

  // Build channel 0's sequence as the global songPositions (for compatibility)
  const songPositions = mappedTrackTables.length > 0 ? mappedTrackTables[0] : [0];

  // Build InstrumentConfig list from INST + SMPL
  const instruments = buildInstruments(instList, smplList);

  // numChannels = actual voice count from TUNE header (1-8).
  // Patterns are 1-channel (single-voice PARTs); the replayer reads channels[0]
  // of whichever PART each channel's track table points to.
  const song: TrackerSong = {
    name: songTitle || 'MusicLine Song',
    format: 'MOD' as const,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,       // TUNE header channel count (4 or 8)
    initialSpeed: speed,
    initialBPM: ciaTempoBPM(tempo),
    linearPeriods: false,
    channelTrackTables: mappedTrackTables,
    channelSpeeds,
    channelGrooves,
  };


  return song;
}

// ── TUNE channel data parsing ──────────────────────────────────────────────

interface ChnlDataResult {
  patternSeq: number[];  // Ordered list of pattern indices for this channel
}

/**
 * Parse chnl_Data from file bytes. The buffer stores trimmed entries followed
 * by an end or loop-back command. Default fill value = 0x0010 (part 0, no transpose).
 *
 * Entry format (2 bytes, big-endian):
 *   Play-part (byte1 bit5 == 0):
 *     byte0: partIndex (0-based)
 *     byte1: bit5=0, bits4:0=transpose offset (0x10 = no transpose)
 *            bits7:6 = partIndex extension (bits 9:8) — for >255 parts
 *   Command (byte1 bit5 == 1):
 *     byte0: parameter (e.g. jump target)
 *     byte1: bits7:6 = command type (01=end, 10=jump, 11=wait), bit5=1
 */
function parseChnlData(data: Uint8Array, offset: number, byteCount: number): ChnlDataResult {
  const patternSeq: number[] = [];
  const end = offset + byteCount;

  for (let p = offset; p + 1 < end; p += 2) {
    const byte0 = data[p];
    const byte1 = data[p + 1];

    if (byte1 & CHNL_CMD_FLAG) {
      // Command entry
      const cmdType = byte1 & CHNL_CMD_TYPE_MASK;
      if (cmdType === CHNL_CMD_END) {
        // End: channel stops
        break;
      } else if (cmdType === CHNL_CMD_JUMP) {
        // Jump (loop): byte0 = position to jump to
        // We stop the linear scan here; replayer handles the loop
        break;
      }
      // WAIT: continue scanning
    } else {
      // Play-part entry
      // Part index: byte0 is the low 8 bits; byte1 bits 7:6 are the high 2 bits
      const partHigh = (byte1 >> 6) & 0x03;
      const partIdx = (partHigh << 8) | byte0;
      // Ignore transpose for song structure; it's applied at playback time
      patternSeq.push(partIdx);
    }
  }

  return { patternSeq };
}

// ── PART decompression ─────────────────────────────────────────────────────

/**
 * Decompress a PART chunk's RLE data into a full 1536-byte pattern buffer.
 *
 * RLE algorithm (from Mline116.asm LoadPart, lines 5332-5341):
 *   For each row:
 *     Read 1 control byte:
 *       - If bit7 is set → end of compressed data; remaining rows are zero
 *       - bits 0-5 = column presence flags (bit 0 = column 0, ..., bit 5 = column 5)
 *     For each of the 6 columns (regardless of presence flag):
 *       - If presence bit was set: copy 2 bytes from compressed stream to output
 *       - Advance output pointer by 2 (always, whether data present or not)
 *
 * Output: 128 rows × 6 cols × 2 bytes = 1536 bytes, zero-initialized.
 */
function decompressPart(data: Uint8Array, srcOffset: number, srcLen: number): Uint8Array {
  const out = new Uint8Array(PART_FULL_SIZE); // zero-initialized
  let src = srcOffset;
  const srcEnd = srcOffset + srcLen;
  let dst = 0; // index into out

  while (src < srcEnd && dst < PART_FULL_SIZE) {
    const ctrl = data[src++];

    // bit7 set → end of compressed data (remaining rows stay zero)
    if (ctrl & 0x80) break;

    // Process 6 columns for this row
    let flags = ctrl;
    for (let col = 0; col < PART_COLS; col++) {
      if (flags & 1) {
        // Column has data: copy 2 bytes
        if (src + 1 < srcEnd && dst + 1 < PART_FULL_SIZE) {
          out[dst]     = data[src++];
          out[dst + 1] = data[src++];
        }
      }
      flags >>= 1;
      dst += 2; // always advance (even if no data was copied)
    }
  }

  return out;
}

// ── Build Pattern from decompressed PART data ─────────────────────────────

/**
 * Convert a 1536-byte decompressed PART buffer into a single-voice DEViLBOX Pattern.
 *
 * Each PART in MusicLine is single-voice data (verified in PlayVoice @ Mline116.asm:9673).
 * The 6 × 2-byte "columns" per row are NOT separate channels — they are the 12 bytes
 * for ONE voice:
 *   bytes 0-1  : note (0=rest, 1-60=note, 61=end-of-part sentinel) + instrument (1-based)
 *   bytes 2-3  : effect number + effect parameter
 *   bytes 4-11 : 4 × u16 effect words
 *
 * Multiple channels each independently select which PART to play via their chnl_Data
 * track tables. The pattern editor shows ONE PART (one voice) at a time.
 *
 * Note mapping: MusicLine note N (1-60) → XM note via amigaNoteToXM (adds 12 octaves).
 * Note 61 (end sentinel) = reset row counter within PART; treated as rest here.
 */
function buildPattern(rawData: Uint8Array | undefined, _patIdx: number, partNum: number): Pattern {
  const channel: ChannelData = {
    id:           'channel-0',
    name:         'Voice',
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          0,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: PART_ROWS }, (): TrackerCell => {
      return createEmptyCell();
    }),
  };

  if (rawData) {
    for (let row = 0; row < PART_ROWS; row++) {
      // Each row is 12 bytes; bytes 0-1 = note + instrument for this voice
      const rowBase = row * PART_ROW_BYTES;
      const noteRaw  = rawData[rowBase];
      const instrRaw = rawData[rowBase + 1];

      const cell = channel.rows[row];

      if (noteRaw > 0 && noteRaw < ML_NOTE_END) {
        cell.note = amigaNoteToXM(noteRaw);
        // 0x00 and 0xFF are "no instrument change" sentinels; valid range 1–127
        if (instrRaw > 0 && instrRaw !== 0xFF) {
          cell.instrument = instrRaw;
        }
      }
      // noteRaw === 0 → rest; noteRaw === ML_NOTE_END → end-of-part (reset) → treated as rest
    }
  }

  return {
    id:       `part-${partNum}`,
    name:     `Part ${partNum}`,
    channels: [channel],
    length:   PART_ROWS,
  };
}

function createEmptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

// ── INST parsing ───────────────────────────────────────────────────────────

/**
 * Parse a 206-byte INST chunk into instrument metadata.
 *
 * inst_SIZE = 206 bytes (inst_SIZEOF - inst_Title, verified by counting struct fields):
 *   +0   title[32]
 *   +32  smplNumber[1]   (0-based sample index)
 *   +33  smplType[1]
 *   +34  smplPointer[4]  (Amiga RAM address — ignore)
 *   +38  smplLength[2]   (words)
 *   +40  smplRepPointer[4] (ignore)
 *   +44  smplRepLength[2] (words)
 *   +46  fineTune[2]     (signed)
 *   +48  semiTone[2]     (signed)
 *   +50  smplStart[2]    (words)
 *   +52  smplEnd[2]      (words)
 *   +54  smplRepStart[2] (words — loop start offset within sample)
 *   +56  smplRepLen[2]   (words — loop length)
 *   +58  volume[2]       (0-64)
 *   +60  transpose[1]
 *   +61  slideSpeed[1]
 *   +62  effects1[1]
 *   +63  effects2[1]
 *   +64  ADSR (12×u16 = 24 bytes)
 *   +88  Vibrato (2×u8 + 5×u16 = 12 bytes)
 *   +100 Tremolo (2×u8 + 5×u16 = 12 bytes)
 *   +112 Arpeggio (1×u16 + 2×u8 = 4 bytes)
 *   +116 Transform (1×u8 + 5×u8 + 6×u16 = 18 bytes)
 *   +134 Phase (7×u16 = 14 bytes)
 *   +148 Mix (2×u8 + 6×u16 = 14 bytes)
 *   +162 Resonance (6×u16 + 2×u8 = 14 bytes)
 *   +176 Filter (6×u16 + 2×u8 = 14 bytes)
 *   +190 Loop (8×u16 = 16 bytes)
 *   Total = 206 bytes ✓
 */
function parseInst(v: DataView, data: Uint8Array, offset: number): {
  title: string; smplNumber: number; volume: number;
  fineTune: number; semiTone: number; smplRepStart: number; smplRepLen: number;
} {
  const o = offset;
  return {
    title:       readCString(data, o, 32),
    smplNumber:  data[o + 32],           // 0-based
    // smplType  = data[o + 33],          // ignore
    // smplPtr   = v.getUint32(o + 34),   // ignore (Amiga RAM)
    // smplLen   = v.getUint16(o + 38),   // in words
    // smplRepPtr= v.getUint32(o + 40),   // ignore
    // smplRepLengthSMPL = v.getUint16(o + 44), // ignore (use inst fields below)
    fineTune:    v.getInt16(o + 46),
    semiTone:    v.getInt16(o + 48),
    // smplStart = v.getUint16(o + 50),   // sample start (words)
    // smplEnd   = v.getUint16(o + 52),   // sample end (words)
    smplRepStart: v.getUint16(o + 54),   // loop start (words)
    smplRepLen:   v.getUint16(o + 56),   // loop length (words)
    volume:       v.getUint16(o + 58),   // 0-64
  };
}

// ── SMPL parsing + delta decompression ───────────────────────────────────

/**
 * Parse a SMPL chunk.
 *
 * SMPL chunk data layout:
 *   [6]  Extra header: rawDataSize[4] + deltaCommand[1] + pad[1]
 *   [50] smpl metadata (starting at smpl_Title):
 *        title[32] + padByte[1] + type[1] + pointer[4] + smplLength[2] +
 *        repPointer[4] + repLength[2] + fineTune[2] + semiTone[2]
 *   [?]  Sample data (chunkSize - 6 - 50 bytes)
 *        If storedSize == rawDataSize → raw signed 8-bit PCM
 *        If storedSize != rawDataSize → delta-packed nibbles → need DeltaDePacker
 */
function parseSmpl(
  v: DataView,
  data: Uint8Array,
  offset: number,
  chunkSize: number
): { title: string; pcm: Uint8Array; smplLength: number; repLength: number; fineTune: number; semiTone: number } | null {
  const rawDataSize = v.getUint32(offset);       // uncompressed sample byte count
  const deltaCommand = data[offset + 4];          // escape byte for DeltaDePacker

  const metaOffset = offset + SMPL_EXTRA_HDR;    // smpl_Title start
  const title = readCString(data, metaOffset, 32);
  // metaOffset+32 = padByte, +33 = type — ignore both
  // metaOffset+34 = smplPointer (Amiga RAM) — ignore
  const smplLength  = v.getUint16(metaOffset + 38); // total length in words
  // metaOffset+40 = repPointer — ignore
  const repLength   = v.getUint16(metaOffset + 44); // loop length in words
  const fineTune    = v.getInt16(metaOffset + 46);
  const semiTone    = v.getInt16(metaOffset + 48);

  const sampleDataOffset = offset + SMPL_EXTRA_HDR + SMPL_META_SIZE;
  const storedSize = chunkSize - SMPL_EXTRA_HDR - SMPL_META_SIZE;

  if (storedSize <= 0) return null;

  const storedPcm = data.subarray(sampleDataOffset, sampleDataOffset + storedSize);

  let pcm: Uint8Array;
  if (storedSize === rawDataSize || rawDataSize === 0) {
    // Uncompressed: raw signed 8-bit PCM
    pcm = new Uint8Array(storedPcm);
  } else {
    // Delta-packed: decompress
    pcm = deltaDePack(storedPcm, rawDataSize, deltaCommand);
  }

  return { title, pcm, smplLength, repLength, fineTune, semiTone };
}

/**
 * DeltaDePacker — decompresses MusicLine's nibble-delta format.
 *
 * Algorithm (from Mline116.asm DeltaDePacker, lines 5800-5835):
 *   Read input bytes:
 *   - If byte != deltaCommand: output directly (pass-through)
 *   - If byte == deltaCommand:
 *       seed     = next byte (output directly, becomes current running value)
 *       countHi  = next byte
 *       countLo  = next byte
 *       count    = (countHi << 8) | countLo
 *       if count == 0: continue main loop
 *       Alternating nibble-delta pairs from each packed byte:
 *         packed = next input byte
 *         upperNibble = (packed >> 4) & 0xf  → sign-extend to 8-bit → add to running value → output
 *         count--; if count == 0: break
 *         lowerNibble = packed & 0xf → sign-extend to 8-bit → add to running value → output
 *         count--; if count == 0: advance to next packed byte
 */
function deltaDePack(packed: Uint8Array, outputSize: number, deltaCommand: number): Uint8Array {
  const out = new Uint8Array(outputSize);
  let src = 0;
  let dst = 0;
  let current = 0; // running accumulator (8-bit unsigned)

  while (src < packed.length && dst < outputSize) {
    const b = packed[src++];

    if (b !== deltaCommand) {
      // Pass-through byte
      out[dst++] = b;
      current = b;
    } else {
      // Delta-compressed run
      if (src + 2 >= packed.length) break;

      const seed = packed[src++];
      const countHi = packed[src++];
      const countLo = packed[src++];
      const count = (countHi << 8) | countLo;

      out[dst++] = seed;
      current = seed;
      if (count === 0) continue;

      let remaining = count;
      while (remaining > 0 && src < packed.length) {
        const packedByte = packed[src++];

        // Upper nibble delta
        const hiNib = (packedByte >> 4) & 0x0f;
        const hiDelta = hiNib >= 8 ? hiNib - 16 : hiNib; // sign-extend 4→8 bit
        current = (current + hiDelta) & 0xff;
        out[dst++] = current;
        remaining--;
        if (remaining === 0) break;

        // Lower nibble delta (same packed byte)
        const loNib = packedByte & 0x0f;
        const loDelta = loNib >= 8 ? loNib - 16 : loNib; // sign-extend 4→8 bit
        current = (current + loDelta) & 0xff;
        out[dst++] = current;
        remaining--;
      }
    }
  }

  return out;
}

// ── Instrument building ────────────────────────────────────────────────────

/**
 * Build DEViLBOX InstrumentConfig array from parsed INST + SMPL data.
 * Each INST references a SMPL by smplNumber (0-based index into smplList).
 */
function buildInstruments(
  instList: Array<{ title: string; smplNumber: number; volume: number; fineTune: number; semiTone: number; smplRepStart: number; smplRepLen: number }>,
  smplList: Array<{ title: string; pcm: Uint8Array; smplLength: number; repLength: number; fineTune: number; semiTone: number }>
) {
  const instruments = [];

  for (let i = 0; i < instList.length; i++) {
    const inst = instList[i];
    const smpl = smplList[inst.smplNumber]; // smplNumber is 0-based index

    if (!smpl || smpl.pcm.length === 0) {
      // Instrument has no sample — create a silent placeholder
      const silentPcm = new Uint8Array(2);
      instruments.push(
        createSamplerInstrument(i + 1, inst.title || `Instrument ${i + 1}`, silentPcm, inst.volume || 64, PAL_C3_RATE, 0, 0)
      );
      continue;
    }

    // Loop: repStart and repLen from INST (in words → bytes via ×2)
    const loopStart = inst.smplRepStart * 2;
    const loopLen   = inst.smplRepLen * 2;
    const loopEnd   = loopStart + loopLen;

    instruments.push(
      createSamplerInstrument(
        i + 1,
        inst.title || smpl.title || `Instrument ${i + 1}`,
        smpl.pcm,
        inst.volume > 0 ? inst.volume : 64,
        PAL_C3_RATE,
        loopStart,
        loopEnd > loopStart + 2 ? loopEnd : 0
      )
    );
  }

  // If no instruments were parsed, add a placeholder
  if (instruments.length === 0) {
    const silentPcm = new Uint8Array(2);
    instruments.push(createSamplerInstrument(1, 'Empty', silentPcm, 64, PAL_C3_RATE, 0, 0));
  }

  return instruments;
}

// ── CIA tempo → BPM mapping ────────────────────────────────────────────────

/**
 * Convert a MusicLine tempo value to BPM.
 * MusicLine stores a CIA interval value; the reference tempo 125 corresponds to 125 BPM.
 * For compatibility, we treat the stored tempo directly as BPM.
 */
function ciaTempoBPM(tempo: number): number {
  if (tempo <= 0) return 125;
  return Math.max(32, Math.min(255, tempo));
}

// ── String utilities ───────────────────────────────────────────────────────

function readCString(data: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(offset + maxLen, data.length);
  while (end < limit && data[end] !== 0) end++;
  let s = '';
  for (let i = offset; i < end; i++) {
    s += String.fromCharCode(data[i]);
  }
  return s.trim();
}
