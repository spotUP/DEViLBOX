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
import type { InstrumentConfig, UADEChipRamInfo } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ──────────────────────────────────────────────────────────────

const ML_FILE_MAGIC  = 0x4d4c4544; // 'MLED'
const ML_FILE_MAGIC2 = 0x4d4f444c; // 'MODL' (combined "MLEDMODL")
const ML_INST_MAGIC2 = 0x494e5354; // 'INST' (combined "MLEDINST" for standalone instruments)
const CHUNK_TUNE = 0x54554e45; // 'TUNE'
const CHUNK_VERS = 0x56455253; // 'VERS'
const CHUNK_PART = 0x50415254; // 'PART'
const CHUNK_ARPG = 0x41525047; // 'ARPG'
const CHUNK_INST = 0x494e5354; // 'INST'
const CHUNK_SMPL = 0x534d504c; // 'SMPL'
const CHUNK_MODL = 0x4d4f444c; // 'MODL' (also ML_FILE_MAGIC2, used in isValidChunkId)
const CHUNK_INFO = 0x494e464f; // 'INFO'

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

// Valid chunk IDs — used for forward scan (mirrors module.cpp isValidChunkId)
const VALID_CHUNK_IDS = new Set([
  CHUNK_MODL, CHUNK_VERS, CHUNK_TUNE, CHUNK_PART, CHUNK_ARPG, CHUNK_INST, CHUNK_SMPL, CHUNK_INFO,
]);

function isValidChunkId(id: number): boolean {
  return VALID_CHUNK_IDS.has(id);
}

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
 * Returns true if `data` looks like a standalone MusicLine instrument file.
 * Detection: bytes 0-7 == "MLEDINST"
 */
export function isMusicLineInstrumentFile(data: Uint8Array): boolean {
  if (data.length < 16) return false;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return v.getUint32(0) === ML_FILE_MAGIC && v.getUint32(4) === ML_INST_MAGIC2;
}

/**
 * Parse a standalone MusicLine instrument file (.mli) into an InstrumentConfig.
 *
 * File layout (from SaveExternInst @ Mline116.asm):
 *   "MLED"(4) + "INST"(4) + optional extraHeaderSize(u32BE) + VERS? + INST + SMPL
 *
 * The function tolerates both formats:
 *   - With extraHeaderSize field (written by our exporter): chunks at offset 12+extraSize
 *   - Without (written by original Amiga software): chunks start immediately after the 8-byte magic
 *
 * Returns null on parse error or if the file is not a valid MusicLine instrument.
 */
export function parseMusicLineInstrument(data: Uint8Array): InstrumentConfig | null {
  if (!isMusicLineInstrumentFile(data)) return null;

  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = data.byteLength;

  // Determine where chunks start.
  // If bytes[8..11] form a known chunk ID, chunks start at offset 8 (no extra header field).
  // Otherwise, interpret bytes[8..11] as extraHeaderSize and skip past it.
  const KNOWN_CHUNK_IDS = new Set([
    CHUNK_VERS, CHUNK_TUNE, CHUNK_PART, CHUNK_ARPG, CHUNK_INST, CHUNK_SMPL,
  ]);
  let pos: number;
  if (len >= 12 && KNOWN_CHUNK_IDS.has(v.getUint32(8))) {
    pos = 8; // No extra header field; chunks start right after the 8-byte magic
  } else if (len >= 12) {
    const extraSize = v.getUint32(8);
    pos = 8 + 4 + extraSize; // Skip sizeField + extra header bytes
  } else {
    return null;
  }

  // Collect the first INST and first SMPL chunk
  let instData: ReturnType<typeof parseInst> | null = null;
  let smplData: ReturnType<typeof parseSmpl> | null = null;
  let _mlInstDataStart = 0;

  while (pos + 8 <= len) {
    const chunkId   = v.getUint32(pos);
    const chunkSize = v.getUint32(pos + 4);
    const dataStart = pos + 8;

    if (chunkId === CHUNK_VERS) {
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_INST) {
      if (chunkSize >= INST_SIZE && dataStart + INST_SIZE <= len) {
        instData = parseInst(v, data, dataStart);
        _mlInstDataStart = dataStart;
      }
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_SMPL) {
      const smplEndPos = dataStart + SMPL_EXTRA_HDR + chunkSize;
      if (chunkSize >= SMPL_META_SIZE && smplEndPos <= len + 16) {
        smplData = parseSmpl(v, data, dataStart, chunkSize);
      }
      pos = smplEndPos;

    } else if (chunkId === CHUNK_ARPG) {
      pos = dataStart + chunkSize; // skip

    } else {
      break; // Unknown chunk — stop
    }
  }

  if (!instData) return null;

  const instruments = buildInstruments([{ ...instData!, instrBase: _mlInstDataStart }], smplData ? [smplData] : [], data.byteLength);
  return instruments[0] ?? null;
}

/**
 * Parse a MusicLine Editor file into a TrackerSong.
 * Returns null on parse error.
 */
export function parseMusicLineFile(data: Uint8Array): TrackerSong | null {
  if (!isMusicLineFile(data)) return null;

  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = data.byteLength;

  // Skip "MLED"(0-3) + "MODL"(4-7), then handle MODL's optional extra data.
  //
  // module.cpp LoadMod logic (after consuming "MLED"):
  //   - Reads chunk ID → MODL
  //   - Peeks next 4 bytes:
  //     - If valid chunk ID (e.g. "VERS"): MODL has no data; leave bytes for next iteration
  //     - Otherwise: treat as MODL data size (u32BE); consume size + that many bytes
  //
  // This handles both:
  //   "MLEDMODLVERS..."       → pos=8 (no MODL extra data, VERS follows immediately)
  //   "MLEDMODL\x00\x00\x00\x04[4 bytes]VERS..." → pos=16 (4-byte MODL extra header)
  if (len < 8) return null;
  let pos = 8; // default: start right after "MLEDMODL"
  if (pos + 4 <= len) {
    const next4 = v.getUint32(pos);
    if (!isValidChunkId(next4)) {
      // It's a MODL data-size field, not a chunk ID — skip size + extra bytes
      const modlExtraSize = next4;
      pos += 4 + modlExtraSize;
    }
    // else: valid chunk ID follows immediately; MODL had no extra data
  }

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
    smplType: number;     // 0=raw PCM; >0=waveform loop-size type (1=32s,2=64s,3=128s,4=256s)
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
  while (pos + 4 <= len) {
    // Forward scan: if current position doesn't have a valid chunk ID, advance
    // byte by byte until we find one. Mirrors module.cpp LoadMod:
    //   while (len >= 4 && !isValidChunkId(mod)) { mod++; len--; }
    while (pos + 4 <= len && !isValidChunkId(v.getUint32(pos))) {
      pos++;
    }
    if (pos + 8 > len) break;

    const chunkId = v.getUint32(pos);
    const chunkSize = v.getUint32(pos + 4);
    const dataStart = pos + 8;

    // Guard against corrupt chunk sizes for non-TUNE chunks
    // (TUNE size is known-buggy in some old ML files — handled by sequential read)
    if (chunkId !== CHUNK_TUNE && dataStart + chunkSize > len + 16) {
      break;
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

      const { out: decompressed, consumed: rleConsumed } = decompressPart(data, rleStart, rleLen);
      partDataMap.set(partNumber, decompressed);

      // CRITICAL: Some ML files store incorrect chunk sizes in the PART header.
      // Use actual bytes consumed by the RLE decompressor, not the declared size.
      // This matches the C++ reference (module.cpp: ptr tracks actual position).
      pos = rleStart + rleConsumed;

    } else if (chunkId === CHUNK_ARPG) {
      // ARPG: 2-byte arpeggio number + arpeggio data — skip for now
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_INST) {
      // ── INST: 206-byte instrument struct ──────────────────────────────────
      if (chunkSize < INST_SIZE || dataStart + chunkSize > len) {
        pos = dataStart + chunkSize;
        continue;
      }

      instList.push({ ...parseInst(v, data, dataStart), instrBase: dataStart });
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_SMPL) {
      // ── SMPL: 6-byte extra header + 50-byte metadata + sample data ────────
      // IMPORTANT: The SMPL chunk size does NOT include the 6-byte extra header
      // (rawDataSize[4] + deltaCommand[1] + pad[1]). Those 6 bytes are written
      // separately before the chunk data, so the actual end of a SMPL chunk is
      // dataStart + SMPL_EXTRA_HDR + chunkSize (not dataStart + chunkSize).
      // Verified against SaveModule @ Mline116.asm:7362-7430.
      const smplEndPos = dataStart + SMPL_EXTRA_HDR + chunkSize;
      if (chunkSize < SMPL_META_SIZE || smplEndPos > len + 16) {
        pos = smplEndPos;
        continue;
      }

      const smpl = parseSmpl(v, data, dataStart, chunkSize);
      if (smpl) smplList.push(smpl);

      pos = smplEndPos;

    } else if (chunkId === CHUNK_INFO) {
      // INFO chunk: 9 null-terminated strings (title, author, date, duration, text[0..4])
      // Not needed for playback — skip with declared size.
      pos = dataStart + chunkSize;

    } else if (chunkId === CHUNK_MODL || chunkId === CHUNK_VERS) {
      // MODL/VERS encountered inside the loop (shouldn't happen after header handling,
      // but handle gracefully by skipping — mirrors module.cpp default case behaviour).
      pos = dataStart + chunkSize;

    } else {
      // Unknown chunk — skip with declared size (mirrors module.cpp default case).
      // Do NOT break: remaining chunks (INST, SMPL, etc.) may still be valid.
      if (dataStart + chunkSize <= len) {
        pos = dataStart + chunkSize;
      } else {
        break; // Corrupt/truncated chunk size — stop
      }
    }
  }

  // ── Build TrackerSong ─────────────────────────────────────────────────────

  // Build a sorted partNumber→patternIndex map — ONLY for parts that have actual data.
  // Parts referenced in chnl_Data but missing from PART chunks ("phantom" parts) are
  // excluded here; the track table mapping below falls back to pattern 0 for them.
  const allPartNumbers = new Set<number>();
  for (const pn of partDataMap.keys()) allPartNumbers.add(pn);
  // Also include referenced parts that exist in partDataMap (skip phantom refs)
  for (const table of channelTrackTables) {
    for (const p of table) {
      if (partDataMap.has(p)) allPartNumbers.add(p);
    }
  }

  const sortedPartNumbers = Array.from(allPartNumbers).sort((a, b) => a - b);
  const partToPatternIndex = new Map<number, number>();
  sortedPartNumbers.forEach((pn, idx) => partToPatternIndex.set(pn, idx));

  // Build Pattern array — each PART = single-voice 1-channel pattern (no phantom gaps)
  const patterns: Pattern[] = sortedPartNumbers.map((pn, idx) =>
    buildPattern(partDataMap.get(pn)!, idx, pn)
  );

  // Map channelTrackTables from partNumbers to patternIndices
  const mappedTrackTables: number[][] = channelTrackTables.map(table =>
    table.map(pn => partToPatternIndex.get(pn) ?? 0)
  );

  // Build channel 0's sequence as the global songPositions (for compatibility)
  const songPositions = mappedTrackTables.length > 0 ? mappedTrackTables[0] : [0];

  // Build InstrumentConfig list from INST + SMPL
  const instruments = buildInstruments(instList, smplList, data.byteLength);

  // Stamp importMetadata on all patterns now that totals are known
  const importedAt = new Date().toISOString();
  for (const p of patterns) {
    p.importMetadata = {
      sourceFormat:           'ML' as const,
      sourceFile:             '',
      importedAt,
      originalChannelCount:   numChannels,
      originalPatternCount:   patterns.length,
      originalInstrumentCount: instruments.length,
    };
  }

  // numChannels = actual voice count from TUNE header (1-8).
  // Patterns are 1-channel (single-voice PARTs); the replayer reads channels[0]
  // of whichever PART each channel's track table points to.
  const song: TrackerSong = {
    name: songTitle || 'MusicLine Song',
    format: 'ML' as const,
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


  song.musiclineFileData = data.slice(0);
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
function decompressPart(data: Uint8Array, srcOffset: number, srcLen: number): { out: Uint8Array; consumed: number } {
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

  return { out, consumed: src - srcOffset };
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
 * Note mapping: MusicLine note N (25=C-1, 37=C-2, 49=C-3) → XM note via (mlNote - 12).
 * Note 61 (end sentinel) = reset row counter within PART; treated as rest here.
 */
function buildPattern(rawData: Uint8Array | undefined, _patIdx: number, partNum: number): Pattern {
  const rows: TrackerCell[] = Array.from({ length: PART_ROWS }, (): TrackerCell => createEmptyCell());

  // Effective length: rows up to (not including) the first end-of-part sentinel (note 61).
  // Trailing empty rows after the sentinel are display noise — trim them.
  let effectiveLength = PART_ROWS;

  if (rawData) {
    for (let row = 0; row < PART_ROWS; row++) {
      // Each row is 12 bytes; bytes 0-1 = note + instrument for this voice
      const rowBase = row * PART_ROW_BYTES;
      const noteRaw  = rawData[rowBase];
      const instrRaw = rawData[rowBase + 1];

      if (noteRaw === ML_NOTE_END) {
        // End-of-part sentinel: the pattern ends here; rows beyond this are empty padding.
        effectiveLength = row;
        break;
      }

      const cell = rows[row];

      if (noteRaw > 0) {
        // MusicLine note numbers: 25=C-1, 37=C-2, 49=C-3.
        // XM note numbers:         1=C-0, 13=C-1, 25=C-2.
        // ML note 25 → XM note 13 (C-1): mlNote - 12.
        cell.note = Math.max(1, noteRaw - 12);
        // 0x00 and 0xFF are "no instrument change" sentinels; valid range 1–127
        if (instrRaw > 0 && instrRaw !== 0xFF) {
          cell.instrument = instrRaw;
        }
      }

      // Effects: 5 slots × 2 bytes at bytes 2-11.
      // Slot 0 (bytes 2-3) → cell.effTyp / cell.eff  (XM effect columns)
      // Slot 1 (bytes 4-5) → cell.effTyp2 / cell.eff2
      const eff0Num = rawData[rowBase + 2];
      const eff0Par = rawData[rowBase + 3];
      const eff1Num = rawData[rowBase + 4];
      const eff1Par = rawData[rowBase + 5];

      if (eff0Num) {
        const { effTyp, eff } = mapMLEffect(eff0Num, eff0Par);
        cell.effTyp = effTyp;
        cell.eff    = eff;
      }
      if (eff1Num) {
        const { effTyp, eff } = mapMLEffect(eff1Num, eff1Par);
        cell.effTyp2 = effTyp;
        cell.eff2    = eff;
      }
    }
  }

  // If no sentinel found, fall back to trimming trailing all-empty rows.
  if (effectiveLength === PART_ROWS) {
    let lastNonEmpty = -1;
    for (let row = 0; row < PART_ROWS; row++) {
      const c = rows[row];
      if (c.note || c.instrument || c.effTyp || c.effTyp2) lastNonEmpty = row;
    }
    effectiveLength = lastNonEmpty >= 0 ? lastNonEmpty + 1 : PART_ROWS;
  }

  // Ensure at least 1 row
  if (effectiveLength < 1) effectiveLength = 1;

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
    rows:         rows.slice(0, effectiveLength),
  };

  return {
    id:       `part-${partNum}`,
    name:     `Part ${partNum}`,
    channels: [channel],
    length:   effectiveLength,
  };
}

function createEmptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/**
 * Map a MusicLine effect number + parameter to XM-compatible effTyp/eff.
 *
 * Effect numbers from enums.h (musicline_playback-main reference):
 *   0x01 = fx_SlideUp          → XM 0x01 Portamento up
 *   0x02 = fx_SlideDown        → XM 0x02 Portamento down
 *   0x03 = fx_Portamento       → XM 0x03 Tone portamento
 *   0x04 = fx_InitInstPortamento (ignore — instrument-level portamento init)
 *   0x05 = fx_PitchUp          → XM 0x01 Portamento up (pitch step)
 *   0x06 = fx_PitchDown        → XM 0x02 Portamento down (pitch step)
 *   0x10 = fx_Volume           → XM 0x0C Set volume (0x00–0x40)
 *   0x11 = fx_VolumeSlideUp    → XM 0x0A Volume slide (hi nibble = up speed)
 *   0x12 = fx_VolumeSlideDown  → XM 0x0A Volume slide (lo nibble = down speed)
 *   0x40 = fx_SpeedPart        → XM 0x0F Speed (ticks per row for this channel)
 *   0x42 = fx_SpeedAll         → XM 0x0F Tempo (global BPM / speed)
 */
function mapMLEffect(effectNum: number, effectPar: number): { effTyp: number; eff: number } {
  switch (effectNum) {
    case 0x01: return { effTyp: 0x01, eff: effectPar };                    // SlideUp → portamento up
    case 0x02: return { effTyp: 0x02, eff: effectPar };                    // SlideDown → portamento down
    case 0x03: return { effTyp: 0x03, eff: effectPar };                    // Portamento → tone portamento
    case 0x04: return { effTyp: 0, eff: 0 };                              // InitInstPortamento (ignore)
    case 0x05: return { effTyp: 0x01, eff: effectPar };                    // PitchUp → portamento up
    case 0x06: return { effTyp: 0x02, eff: effectPar };                    // PitchDown → portamento down
    case 0x10: return { effTyp: 0x0C, eff: effectPar };                    // Volume → set volume (0x00–0x40)
    case 0x11: return { effTyp: 0x0A, eff: (effectPar & 0x0F) << 4 };     // VolumeSlideUp
    case 0x12: return { effTyp: 0x0A, eff: effectPar & 0x0F };            // VolumeSlideDown
    case 0x40: return { effTyp: 0x0F, eff: effectPar };                    // SpeedPart → speed
    case 0x42: return { effTyp: 0x0F, eff: effectPar };                    // SpeedAll → speed/tempo
    default:   return { effTyp: 0, eff: 0 };
  }
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
  title: string; smplNumber: number; smplType: number; volume: number;
  fineTune: number; semiTone: number; smplRepStart: number; smplRepLen: number;
} {
  const o = offset;
  return {
    title:       readCString(data, o, 32),
    smplNumber:  data[o + 32],           // 0-based
    smplType:    data[o + 33],           // 0=raw PCM; >0=waveform loop-size (1=32s,2=64s,3=128s,4=256s)
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
  // chunkSize does NOT include the 6-byte extra header, only smpl_SIZE (50) + sampleData
  const storedSize = chunkSize - SMPL_META_SIZE;

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

// ── Waveform synthesis ─────────────────────────────────────────────────────

/**
 * MusicLine smplType → waveform loop length (in BYTES).
 *
 * Source: FixWaveLength @ Mline116.asm.
 * The routine reads inst_SmplLength (in words, =128 for a 256-byte SMPL),
 * then right-shifts by (5 - smplType) bits to get the loop length in words,
 * converting to bytes by × 2:
 *
 *   smplType 1 → 128 >> 4 = 8 words = 16 bytes   (8287/16 ≈ 518 Hz ≈ C4-ish)
 *   smplType 2 → 128 >> 3 = 16 words = 32 bytes  (8287/32 ≈ 259 Hz ≈ C3-ish)
 *   smplType 3 → 128 >> 2 = 32 words = 64 bytes  (8287/64 ≈ 129 Hz ≈ C2-ish)
 *   smplType 4 → 128 >> 1 = 64 words = 128 bytes (8287/128 ≈ 65 Hz ≈ C1-ish)
 *   smplType 5+ → 128 >> 0 = 128 words = 256 bytes (full waveform, C0-ish)
 *
 * The waveform SHAPE is stored as PCM in the SMPL chunk (256 bytes).
 * smplType only selects the downsampled sub-loop length. Different types
 * play at different octaves by design — composers tune their note values
 * accordingly.
 */
export function mlSmplTypeToLoopLen(smplType: number, smplLengthWords: number = 128): number {
  const shift = Math.max(0, 5 - Math.min(smplType, 5));
  const loopWords = smplLengthWords >> shift;
  return Math.max(loopWords * 2, 2); // convert words → bytes; minimum 2 bytes
}

/**
 * Downsample a waveform PCM buffer to targetLen samples by evenly spacing sample points.
 * Used to extract the correct sub-loop from a 256-byte MusicLine waveform.
 */
function downsampleWaveform(pcm: Uint8Array, targetLen: number): Uint8Array {
  if (pcm.length === 0) return new Uint8Array(targetLen);
  const out = new Uint8Array(targetLen);
  const step = pcm.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    out[i] = pcm[Math.min(Math.floor(i * step), pcm.length - 1)];
  }
  return out;
}

/**
 * @deprecated — only kept for MusicLineControls waveform preview.
 * The parser now reads actual PCM from the SMPL chunk; this function is no longer
 * used during import.
 *
 * Generate a placeholder single-cycle waveform as unsigned 8-bit PCM:
 *   type 1 = Sine, type 2 = Sawtooth, type 3 = Square
 */
export function generateMusicLineWaveformPcm(type: number): Uint8Array {
  const len = mlSmplTypeToLoopLen(type) || 16;
  const pcm = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const phase = i / len;
    let val: number;
    switch (type) {
      case 1: val = Math.round(Math.sin(phase * 2 * Math.PI) * 127); break;
      case 2: val = Math.round(phase * 254 - 127); break;
      case 3: val = phase < 0.5 ? 127 : -128; break;
      default: val = 0;
    }
    pcm[i] = (val + 256) & 0xff;
  }
  return pcm;
}

const ML_WAVE_DISPLAY_NAMES: Record<number, string> = {
  1: 'ML Wave 16',   // 16-byte loop (8287/16 ≈ C4)
  2: 'ML Wave 32',   // 32-byte loop (8287/32 ≈ C3)
  3: 'ML Wave 64',   // 64-byte loop (8287/64 ≈ C2)
  4: 'ML Wave 128',  // 128-byte loop (8287/128 ≈ C1)
  5: 'ML Wave 256',  // 256-byte loop (8287/256 ≈ C0)
};

// ── Instrument building ────────────────────────────────────────────────────

/**
 * Build DEViLBOX InstrumentConfig array from parsed INST + SMPL data.
 * Each INST references a SMPL by smplNumber (1-based: smplNumber=1 → smplList[0]).
 */
function buildInstruments(
  instList: Array<{ title: string; smplNumber: number; smplType: number; volume: number; fineTune: number; semiTone: number; smplRepStart: number; smplRepLen: number; instrBase?: number }>,
  smplList: Array<{ title: string; pcm: Uint8Array; smplLength: number; repLength: number; fineTune: number; semiTone: number }>,
  moduleSize = 0
) {
  const instruments = [];

  for (let i = 0; i < instList.length; i++) {
    const inst = instList[i];

    // smplType > 0 = waveform synth.
    // smplType is a LOOP SIZE selector (NOT a waveform shape):
    //   1 → 32-sample loop, 2 → 64, 3 → 128, 4 → 256, 5 → 256 (full)
    // The actual PCM waveform shape is stored in the SMPL chunk.
    // Reference: FixWaveLength @ Mline116.asm — uses sub-loops from 256-byte waveform buffer.
    if (inst.smplType > 0) {
      const smpl = smplList[inst.smplNumber - 1]; // smplNumber is 1-based
      // Use actual SMPL smplLength (in words) if available; default to 128 (= 256 byte waveform)
      const smplLengthWords = smpl?.smplLength ?? 128;
      const loopLen = mlSmplTypeToLoopLen(inst.smplType, smplLengthWords);
      let wavePcm: Uint8Array;

      if (smpl && smpl.pcm.length > 0) {
        // Downsample the 256-byte SMPL waveform to the sub-loop length for this smplType.
        // This mirrors the Amiga makewaves cascade: 256→128→64→32→16 bytes.
        wavePcm = downsampleWaveform(smpl.pcm, loopLen);
      } else {
        // No SMPL data — produce silence (will be inaudible, not a click)
        wavePcm = new Uint8Array(loopLen);
      }

      const displayType = ML_WAVE_DISPLAY_NAMES[inst.smplType] ?? `ML Wave ${inst.smplType}`;
      const base = createSamplerInstrument(
        i + 1,
        inst.title || displayType,
        wavePcm,
        inst.volume > 0 ? inst.volume : 64,
        PAL_C3_RATE,
        0,        // loopStart — loop the full extracted waveform
        loopLen   // loopEnd
      );
      instruments.push({
        ...base,
        metadata: {
          ...base.metadata!,
          displayType,
          mlSynthConfig: { waveformType: inst.smplType, volume: inst.volume },
          isMusicLine: true,
          mlInstIdx: i,
        },
        uadeChipRam: { moduleBase: 0, moduleSize: moduleSize, instrBase: inst.instrBase ?? 0, instrSize: INST_SIZE } as UADEChipRamInfo,
      });
      continue;
    }

    const smpl = smplList[inst.smplNumber - 1]; // smplNumber is 1-based (Mline116.asm:5500 addq #1,_WsMaxNum)

    if (!smpl || smpl.pcm.length === 0) {
      // Instrument has no sample — create a silent placeholder
      const silentPcm = new Uint8Array(2);
      const placeholder = createSamplerInstrument(i + 1, inst.title || `Instrument ${i + 1}`, silentPcm, inst.volume || 64, PAL_C3_RATE, 0, 0);
      instruments.push({ ...placeholder, metadata: { ...placeholder.metadata!, isMusicLine: true, mlInstIdx: i }, uadeChipRam: { moduleBase: 0, moduleSize: moduleSize, instrBase: inst.instrBase ?? 0, instrSize: INST_SIZE } as UADEChipRamInfo });
      continue;
    }

    // Loop: repStart and repLen from INST (in words → bytes via ×2)
    const loopStart = inst.smplRepStart * 2;
    const loopLen   = inst.smplRepLen * 2;
    const loopEnd   = loopStart + loopLen;

    const base2 = createSamplerInstrument(
      i + 1,
      inst.title || smpl.title || `Instrument ${i + 1}`,
      smpl.pcm,
      inst.volume > 0 ? inst.volume : 64,
      PAL_C3_RATE,
      loopStart,
      loopEnd > loopStart + 2 ? loopEnd : 0
    );
    instruments.push({ ...base2, metadata: { ...base2.metadata!, isMusicLine: true, mlInstIdx: i }, uadeChipRam: { moduleBase: 0, moduleSize: moduleSize, instrBase: inst.instrBase ?? 0, instrSize: INST_SIZE } as UADEChipRamInfo });
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
