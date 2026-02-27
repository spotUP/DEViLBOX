/**
 * MusicLineParser.ts — Native parser for MusicLine Editor (.ml) files
 *
 * Binary format verified against:
 *   - Reference Code/musicline-vasm/Mline116.asm (save/load routines, structure defs)
 *   - Reference Code/uade-3.05/amigasrc/players/musicline_editor/mlineplayer102.asm
 *   - Hex analysis of Reference Music/Musicline Editor/- unknown/pink2.ml
 *
 * KEY FACTS (verified, do not change without re-verifying in ASM):
 *   - File prefix: "MLEDMODL"(8) + size(4) + magic(4) = 16 bytes
 *   - Chunks: VERS(optional), TUNE, PART×N, ARPG×M, INST×I, SMPL×S
 *   - TUNE chunk size is stored INCORRECTLY in the file (loader ignores it, reads sequentially)
 *   - TUNE header = 40 bytes (title[32] + tempo[2] + speed[1] + groove[1] + volume[2] + playMode[1] + numChannels[1])
 *   - TUNE channel size table = numChannels × 4 bytes (u32BE each = trimmed chnl_Data size)
 *   - chnl_Data buffer is 512 bytes; file stores only trimmed prefix (no trailing defaults)
 *   - chnl_Data entry (2 bytes): bit5 of byte1 distinguishes play-part from command
 *     - Play-part: byte0=partIdx, byte1[4:0]=transpose(−0x10=range−16..+15)
 *     - Command: byte0=param, byte1[7:6]=type(01=end,10=jump,11=wait)
 *   - PART chunk: 2-byte partNumber + RLE compressed rows (see decompressPart)
 *   - PART decompressed size = 128 rows × 6 columns × 2 bytes = 1536 bytes
 *   - inst_SIZE = 206 bytes (verified by counting struct fields)
 *   - smpl_SIZE = 50 bytes = title[32]+padByte[1]+type[1]+pointer[4]+length[2]+repPointer[4]+repLength[2]+fineTune[2]+semiTone[2]
 *   - SMPL extra header: rawDataSize[4]+deltaCommand[1]+pad[1] = 6 bytes BEFORE smpl_SIZE metadata
 *   - SMPL decompression: if storedSize != rawDataSize → delta-depack (nibble pairs)
 *
 * PART column-to-channel mapping:
 *   Each channel has its own track table (chnl_Data). When a channel is at position P
 *   in its track table, it plays column N of the referenced PART (where N = channel index).
 *   This gives each channel independent sequencing with shared pattern data.
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

  // Skip: "MLEDMODL"(8) + size(4) + magic(4) = 16 bytes
  let pos = 16;

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

  // Build Pattern array
  const patterns: Pattern[] = [];
  for (const pn of partToPatternIndex.keys()) {
    const patIdx = partToPatternIndex.get(pn)!;
    const rawData = partDataMap.get(pn);
    patterns[patIdx] = buildPattern(rawData, numChannels);
  }

  // Map channelTrackTables from partNumbers to patternIndices
  const mappedTrackTables: number[][] = channelTrackTables.map(table =>
    table.map(pn => partToPatternIndex.get(pn) ?? 0)
  );

  // Build channel 0's sequence as the global songPositions (for compatibility)
  const songPositions = mappedTrackTables.length > 0 ? mappedTrackTables[0] : [0];

  // Build InstrumentConfig list from INST + SMPL
  const instruments = buildInstruments(instList, smplList);

  const song: TrackerSong = {
    name: songTitle || 'MusicLine Song',
    format: 'MOD' as const,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
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
 * Convert a 1536-byte decompressed PART buffer into a DEViLBOX Pattern.
 *
 * PART layout: row-major, 6 columns × 2 bytes per row:
 *   byte 0: note (0=rest, 1-60=note, 61=end-of-part sentinel)
 *   byte 1: instrument number (1-based; 0=no instrument)
 *
 * Note mapping: MusicLine note N (1-60) → XM note via amigaNoteToXM (adds 12).
 * Note 61 (end marker) is treated as a rest in the pattern.
 */
function buildPattern(rawData: Uint8Array | undefined, numChannels: number): Pattern {
  // Initialize empty channels for all numChannels
  const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch): ChannelData => ({
    id:           `channel-${ch}`,
    name:         `Channel ${ch + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          0,
    instrumentId: null,
    color:        null,
    rows:         [],
  }));

  if (!rawData) {
    // Empty pattern: fill with empty cells
    for (let ch = 0; ch < numChannels; ch++) {
      channels[ch].rows = Array.from({ length: PART_ROWS }, () => createEmptyCell());
    }
    return { id: 'pattern-0', name: 'Pattern', channels, length: PART_ROWS };
  }

  for (let row = 0; row < PART_ROWS; row++) {
    const rowBase = row * PART_ROW_BYTES;

    for (let ch = 0; ch < numChannels; ch++) {
      const colBase = rowBase + ch * 2;
      const noteRaw = colBase < rawData.length ? rawData[colBase] : 0;
      const instrRaw = colBase + 1 < rawData.length ? rawData[colBase + 1] : 0;

      const cell: TrackerCell = createEmptyCell();

      if (noteRaw > 0 && noteRaw < ML_NOTE_END) {
        // Musical note
        cell.note = amigaNoteToXM(noteRaw);
        // instrRaw 0 or 0xFF = "no instrument change" sentinel; valid range is 1–127
        if (instrRaw > 0 && instrRaw !== 0xFF) {
          cell.instrument = instrRaw; // 1-based instrument index
        }
      } else if (noteRaw === ML_NOTE_END) {
        // End-of-part marker: treat as rest/silence in pattern
        // (replayer handles the actual stopping via track table end command)
      }
      // noteRaw === 0 → rest, leave cell empty

      channels[ch].rows.push(cell);
    }
  }

  // Assign collected rows to each channel (already accumulated via push)
  return { id: `pattern-0`, name: 'Pattern', channels, length: PART_ROWS };
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
