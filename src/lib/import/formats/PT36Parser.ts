/**
 * PT36Parser.ts — ProTracker 3.6 IFF wrapper format parser
 *
 * ProTracker 3.6 wraps a standard ProTracker 4-channel MOD inside an IFF
 * FORM/MODL container. The PTDT chunk contains the raw MOD data; INFO
 * carries song metadata; VERS carries the tracker version string; CMNT
 * carries author/comment.
 *
 * IFF structure (all multi-byte fields big-endian):
 *   +0    "FORM" (4 bytes)
 *   +4    totalSize (uint32BE, size of everything after this field)
 *   +8    "MODL" (4 bytes)
 *   +12   IFF chunks begin here. Each chunk header:
 *           signature  (uint32BE, 4-char name)
 *           chunksize  (uint32BE) — includes the 8-byte header itself
 *         NOTE: first chunk's chunksize -= 4 (OpenMPT quirk: "MODL" counted)
 *   Chunk types:
 *     VERS — 4-byte pad + "PT" (2 bytes) + version string
 *     INFO — 64-byte PT36InfoChunk (see below)
 *     CMNT — author (32 bytes, null-terminated) + comment text
 *     PTDT — raw ProTracker MOD data (same as .mod files)
 *
 * PT36InfoChunk (64 bytes, all uint16BE except name[32]):
 *   +0   name[32]          — song title (null-padded)
 *   +32  numSamples        (uint16BE)
 *   +34  numOrders         (uint16BE)
 *   +36  numPatterns       (uint16BE)
 *   +38  volume            (uint16BE, 0–64; 0 = ignore)
 *   +40  tempo             (uint16BE, BPM; used when CIA mode active)
 *   +42  flags             (uint16BE; bit8 clear = VBlank, bit8 set = CIA)
 *   +44  dateDay           (uint16BE)
 *   +46  dateMonth         (uint16BE, 1-12)
 *   +48  dateYear          (uint16BE, offset from 1900)
 *   +50–62  hour/min/sec/msec playtime fields (unused in playback)
 *
 * PTDT is parsed as a standard 31-instrument ProTracker MOD:
 *   +0:    title (20 bytes)
 *   +20:   31 × 30-byte sample headers
 *   +950:  song length (uint8)
 *   +951:  restart position (uint8)
 *   +952:  pattern order table (128 × uint8)
 *   +1080: format tag (4 bytes: "M.K." / "M!K!")
 *   +1084: pattern data (numPatterns × 64 rows × 4 channels × 4 bytes/cell)
 *   after patterns: sequential raw 8-bit signed PCM sample data
 *
 * Note: some PT36 files report incorrect PTDT chunk sizes when samples
 * exceed 64 KiB (off by 65536 per large sample). Since PTDT is always the
 * last chunk, we pass the entire remainder of the buffer to the MOD parser.
 *
 * Reference: OpenMPT soundlib/Load_pt36.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── IFF chunk ID constants (big-endian uint32) ────────────────────────────────

const CHUNK_VERS = 0x56455253; // "VERS"
const CHUNK_INFO = 0x494E464F; // "INFO"
const CHUNK_CMNT = 0x434D4E54; // "CMNT"
const CHUNK_PTDT = 0x50544454; // "PTDT"

// ── MOD layout constants ───────────────────────────────────────────────────────

const NUM_MOD_INSTRUMENTS   = 31;
const MOD_ROWS_PER_PATTERN  = 64;
const MOD_CHANNELS          = 4;
const MOD_TITLE_LEN         = 20;
const MOD_SAMPLE_HDR_OFFSET = 20;
const MOD_SAMPLE_HDR_SIZE   = 30;
const MOD_ORDER_COUNT_OFF   = 950;
const MOD_RESTART_OFF       = 951;
const MOD_ORDER_TABLE_OFF   = 952;
const MOD_TAG_OFF           = 1080;
const MOD_PATTERN_DATA_OFF  = 1084;

// Channel panning: LRRL (classic Amiga hard stereo, ±50 in DEViLBOX units)
const CHANNEL_PANNING = [-50, 50, 50, -50];

// ── Binary helpers ─────────────────────────────────────────────────────────────

const TEXT_DECODER = new TextDecoder('iso-8859-1');

function readStr(buf: Uint8Array, offset: number, len: number): string {
  let end = offset;
  while (end < offset + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(offset, end)).trim();
}

function readU16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) | (buf[offset + 1] << 16) |
     (buf[offset + 2] <<  8) |  buf[offset + 3]) >>> 0
  );
}

function readFourCC(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

// ── Internal cell type ─────────────────────────────────────────────────────────

interface RawCell {
  note:       number;  // XM note number (0 = none)
  instrument: number;  // 1-31, 0 = none
  effTyp:     number;
  eff:        number;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the buffer starts with either:
 *   - ProTracker 3.6 IFF FORM/MODL header ("FORM" at +0, "MODL" at +8), or
 *   - PreTracker format magic: "PRT" at +0 followed by a version byte (0x1B for v1.x).
 *
 * Both are handled by parsePT36File.
 */
export function isPT36Format(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const buf = new Uint8Array(buffer);
  // ProTracker 3.6 IFF
  if (readFourCC(buf, 0) === 'FORM' && readFourCC(buf, 8) === 'MODL') return true;
  // PreTracker: magic is 'PRT' + version byte (non-zero, e.g. 0x1B for v1.x)
  if (buf[0] === 0x50 && buf[1] === 0x52 && buf[2] === 0x54 && buf[3] !== 0) return true;
  return false;
}

/**
 * Parse a ProTracker 3.6 IFF-wrapped MOD file or a PreTracker (.prt) file
 * into a TrackerSong.
 */
export async function parsePT36File(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isPT36Format(buffer)) {
    throw new Error('PT36Parser: not a valid ProTracker 3.6 / PreTracker file');
  }

  // ── PreTracker format (PRT\xNN magic) ─────────────────────────────────────
  if (buf[0] === 0x50 && buf[1] === 0x52 && buf[2] === 0x54 && buf[3] !== 0) {
    return parsePreTrackerBuffer(buf, filename);
  }

  // ── Walk IFF chunks ───────────────────────────────────────────────────────
  // The IFF FORM header is 12 bytes: "FORM"(4) + uint32 size(4) + "MODL"(4).
  // Chunks begin at offset 12. Per OpenMPT, the first chunk's declared size
  // includes the 4-byte "MODL" magic (which belongs to the FORM header), so
  // we subtract 4 from rawSize before processing the first chunk.

  let ptdtBuf:   Uint8Array | null = null;
  let infoChunk: Uint8Array | null = null;
  let commentBuf: Uint8Array | null = null;
  let versionStr = '3.6';

  let pos = 12;
  let firstChunk = true;

  while (pos + 8 <= buf.byteLength) {
    const id      = readU32BE(buf, pos);
    let rawSize   = readU32BE(buf, pos + 4);

    if (firstChunk) {
      // OpenMPT: iffHead.chunksize -= 4 to compensate for MODL in FORM size
      rawSize  = rawSize > 4 ? rawSize - 4 : 0;
      firstChunk = false;
    }

    // OpenMPT loop body subtracts 8 from chunksize to get the payload length,
    // since chunksize includes the 8-byte chunk header.
    const dataSize  = rawSize > 8 ? rawSize - 8 : 0;
    const dataStart = pos + 8;
    const dataEnd   = Math.min(dataStart + dataSize, buf.byteLength);

    switch (id) {
      case CHUNK_VERS: {
        // Layout: 4-byte padding, then "PT" (2 bytes), then version string
        if (dataSize > 6) {
          const vOff = dataStart + 4;
          if (buf[vOff] === 0x50 && buf[vOff + 1] === 0x54) { // "PT"
            const vStr = readStr(buf, vOff + 2, dataEnd - (vOff + 2));
            if (vStr.length > 0) versionStr = vStr;
          }
        }
        break;
      }

      case CHUNK_INFO: {
        if (dataEnd - dataStart >= 64) {
          infoChunk = buf.subarray(dataStart, dataEnd);
        }
        break;
      }

      case CHUNK_CMNT: {
        commentBuf = buf.subarray(dataStart, dataEnd);
        break;
      }

      case CHUNK_PTDT: {
        // Per OpenMPT: some PT36 files report too-small PTDT chunk sizes when
        // samples exceed 64 KiB. Since PTDT is always last, we extend to EOF.
        ptdtBuf = buf.subarray(dataStart, buf.byteLength);
        break;
      }

      default:
        break;
    }

    // Advance: rawSize includes the 8-byte header, so the next chunk is at
    // pos + rawSize. Guard against zero-size infinite loops.
    const advance = rawSize > 0 ? rawSize : 8;
    pos += advance;
  }

  if (!ptdtBuf) {
    throw new Error('PT36Parser: PTDT chunk not found');
  }

  // ── Decode INFO chunk ──────────────────────────────────────────────────────
  let infoSongName = '';
  let infoVolume   = 0;
  let infoTempo    = 0;
  let infoFlags    = 0;

  if (infoChunk && infoChunk.byteLength >= 64) {
    infoSongName = readStr(infoChunk, 0, 32);
    // +32 numSamples, +34 numOrders, +36 numPatterns — not used for playback
    infoVolume   = readU16BE(infoChunk, 38);
    infoTempo    = readU16BE(infoChunk, 40);
    infoFlags    = readU16BE(infoChunk, 42);
  }

  // bit 8 clear = VBlank timing; bit 8 set = CIA timing (tempo field is BPM)
  const useCIA = (infoFlags & 0x100) !== 0;

  // ── Decode CMNT chunk ─────────────────────────────────────────────────────
  if (commentBuf && commentBuf.byteLength > 0) {
    const author = readStr(commentBuf, 0, Math.min(32, commentBuf.byteLength));
    if (author.length > 0 && author !== 'UNNAMED AUTHOR') {
      console.log(`[PT36Parser] Author: ${author}`);
    }
  }

  // ── Parse PTDT as ProTracker MOD ──────────────────────────────────────────
  const song = parseMODBuffer(ptdtBuf, filename, infoSongName, infoVolume, infoTempo, useCIA);

  console.log(
    `[PT36Parser] Loaded "${song.name}" — ProTracker ${versionStr}` +
    ` | ${song.patterns.length} patterns | ${song.instruments.length} instruments` +
    ` | speed=${song.initialSpeed} BPM=${song.initialBPM}`,
  );

  return song;
}

// ── PreTracker binary parser ───────────────────────────────────────────────────

/**
 * Parse a PreTracker (.prt) file into a TrackerSong stub.
 *
 * PreTracker header layout (inferred from reference files and pretracker.s):
 *   +0   'PRT' + version byte (e.g. 0x1B for v1.x)
 *   +4   uint32BE: offset to sub-song table
 *   +8   uint32BE: offset to instruments
 *   +12  uint32BE: offset to patterns
 *   +16  uint32BE: offset to sample data
 *   +20  char[16]: song title (null-terminated)
 *   +36  char[16]: author (null-terminated)
 *   +90  uint8: sub-song count (0 = 1 sub-song)
 *
 * Actual audio playback is handled by UADE; this returns a metadata stub.
 */
function parsePreTrackerBuffer(buf: Uint8Array, filename: string): TrackerSong {
  const songTitle = readStr(buf, 20, 16) || filename.replace(/\.[^/.]+$/, '');

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'sample' as const,
    synthType: 'Sampler' as const, effects: [], volume: -60, pan: 0,
  } as InstrumentConfig];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHANNEL_PANNING[ch],
      instrumentId: null,
      color: null,
      rows: emptyRows,
    } as ChannelData)),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile:   filename,
      importedAt:   new Date().toISOString(),
      originalChannelCount:    4,
      originalPatternCount:    1,
      originalInstrumentCount: 0,
    },
  };

  return {
    name:            `${songTitle} [PreTracker]`,
    format:          'MOD' as TrackerFormat,
    patterns:        [pattern],
    instruments,
    songPositions:   [0],
    songLength:      1,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}

// ── MOD binary parser ──────────────────────────────────────────────────────────

interface MODSampleHeader {
  name:           string;
  lengthWords:    number;  // stored in words (× 2 = bytes)
  finetune:       number;  // signed -8..+7
  volume:         number;  // 0-64
  loopStartWords: number;
  loopLenWords:   number;
}

/**
 * Parse the PTDT binary buffer as a standard 31-instrument ProTracker MOD.
 */
function parseMODBuffer(
  buf:        Uint8Array,
  filename:   string,
  infoName:   string,
  infoVolume: number,
  infoTempo:  number,
  useCIA:     boolean,
): TrackerSong {
  if (buf.byteLength < MOD_PATTERN_DATA_OFF) {
    throw new Error('PT36Parser: PTDT chunk too small to be a valid MOD');
  }

  // ── Song name ──────────────────────────────────────────────────────────────
  const modTitle = readStr(buf, 0, MOD_TITLE_LEN);
  const songName = infoName || modTitle || filename.replace(/\.[^/.]+$/, '');

  // ── 31 sample headers (30 bytes each) ─────────────────────────────────────
  const sampleHeaders: MODSampleHeader[] = [];
  for (let i = 0; i < NUM_MOD_INSTRUMENTS; i++) {
    const base          = MOD_SAMPLE_HDR_OFFSET + i * MOD_SAMPLE_HDR_SIZE;
    const name          = readStr(buf, base, 22);
    const lengthWords   = readU16BE(buf, base + 22);
    const rawFT         = buf[base + 24] & 0x0F;
    const finetune      = rawFT > 7 ? rawFT - 16 : rawFT; // signed -8..+7
    const volume        = Math.min(buf[base + 25], 64);
    const loopStartWords = readU16BE(buf, base + 26);
    const loopLenWords  = readU16BE(buf, base + 28);
    sampleHeaders.push({ name, lengthWords, finetune, volume, loopStartWords, loopLenWords });
  }

  // ── Order table ────────────────────────────────────────────────────────────
  const songLength      = buf[MOD_ORDER_COUNT_OFF];
  const restartPosition = buf[MOD_RESTART_OFF];

  const orderTable: number[] = [];
  let maxPatternIndex = 0;
  for (let i = 0; i < 128; i++) {
    const p = buf[MOD_ORDER_TABLE_OFF + i];
    orderTable.push(p);
    if (i < songLength && p > maxPatternIndex) maxPatternIndex = p;
  }
  const numPatterns = maxPatternIndex + 1;

  // Format tag at +1080 (always "M.K." or "M!K!" for PT36 — 4 channels)
  void readStr(buf, MOD_TAG_OFF, 4);

  // ── Pattern data ───────────────────────────────────────────────────────────
  // Layout: numPatterns × 64 rows × 4 channels × 4 bytes per cell
  const patternCells: RawCell[][][] = [];

  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const patOffset = MOD_PATTERN_DATA_OFF + patIdx * MOD_ROWS_PER_PATTERN * MOD_CHANNELS * 4;
    const rows: RawCell[][] = [];

    for (let row = 0; row < MOD_ROWS_PER_PATTERN; row++) {
      const rowCells: RawCell[] = [];

      for (let ch = 0; ch < MOD_CHANNELS; ch++) {
        const off = patOffset + (row * MOD_CHANNELS + ch) * 4;

        if (off + 3 >= buf.byteLength) {
          rowCells.push({ note: 0, instrument: 0, effTyp: 0, eff: 0 });
          continue;
        }

        const b0 = buf[off];
        const b1 = buf[off + 1];
        const b2 = buf[off + 2];
        const b3 = buf[off + 3];

        // Standard ProTracker 4-byte cell encoding:
        //   b0: [instHi(4)] [periodHi(4)]
        //   b1: [periodLo(8)]
        //   b2: [instLo(4)] [effectType(4)]
        //   b3: [effectParam(8)]
        const period      = ((b0 & 0x0F) << 8) | b1;
        const instrument  = (b0 & 0xF0) | (b2 >> 4);
        const effectType  = b2 & 0x0F;
        const effectParam = b3;

        const noteIdx = period > 0 ? periodToNoteIndex(period) : 0;
        const xmNote  = amigaNoteToXM(noteIdx);

        rowCells.push({ note: xmNote, instrument, effTyp: effectType, eff: effectParam });
      }

      rows.push(rowCells);
    }

    patternCells.push(rows);
  }

  // ── Initial speed / BPM ───────────────────────────────────────────────────
  // CIA mode: INFO tempo field is the BPM directly.
  // VBlank mode: scan first pattern for Fxx effects (ProTracker standard).
  let initialSpeed = 6;
  let initialBPM   = 125;

  if (infoTempo > 0 && useCIA) {
    initialBPM = infoTempo;
  } else {
    const found  = scanForTempo(patternCells, orderTable);
    initialSpeed = found.speed;
    initialBPM   = found.bpm;
  }

  // infoVolume is available for future global-volume scaling (0 = ignore).
  void infoVolume;

  // ── Build TrackerSong patterns ────────────────────────────────────────────
  const trackerPatterns: Pattern[] = patternCells.map((rows, patIdx) => {
    const channels: ChannelData[] = Array.from({ length: MOD_CHANNELS }, (_, ch) => {
      const trackerRows: TrackerCell[] = rows.map(rowCells => {
        const cell = rowCells[ch];
        return {
          note:      cell.note,
          instrument: cell.instrument,
          volume:    0,
          effTyp:    cell.effTyp,
          eff:       cell.eff,
          effTyp2:   0,
          eff2:      0,
        } as TrackerCell;
      });

      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          CHANNEL_PANNING[ch],
        instrumentId: null,
        color:        null,
        rows:         trackerRows,
      } as ChannelData;
    });

    return {
      id:       `pattern-${patIdx}`,
      name:     `Pattern ${patIdx}`,
      length:   MOD_ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:             'PT36',
        sourceFile:               filename,
        importedAt:               new Date().toISOString(),
        originalChannelCount:     MOD_CHANNELS,
        originalPatternCount:     numPatterns,
        originalInstrumentCount:  NUM_MOD_INSTRUMENTS,
      },
    } as Pattern;
  });

  // ── Sample PCM data (follows pattern data sequentially) ───────────────────
  let sampleDataOffset =
    MOD_PATTERN_DATA_OFF + numPatterns * MOD_ROWS_PER_PATTERN * MOD_CHANNELS * 4;

  // ── Build instruments ──────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < NUM_MOD_INSTRUMENTS; i++) {
    const hdr        = sampleHeaders[i];
    const id         = i + 1;
    const byteLength = hdr.lengthWords * 2;

    if (byteLength === 0) {
      // Silent placeholder stub
      instruments.push({
        id,
        name:      hdr.name || `Sample ${id}`,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig);
      continue;
    }

    // Clamp to buffer bounds: broken PT36 files can have inflated sample sizes
    const end    = Math.min(sampleDataOffset + byteLength, buf.byteLength);
    const rawPcm = buf.subarray(sampleDataOffset, end);
    sampleDataOffset += byteLength;

    // Loop points are stored in words; convert to bytes
    const loopStartBytes = hdr.loopStartWords * 2;
    const loopLenBytes   = hdr.loopLenWords   * 2;
    const hasLoop        = hdr.loopLenWords > 1;
    const loopStart      = hasLoop ? loopStartBytes : 0;
    const loopEnd        = hasLoop ? loopStartBytes + loopLenBytes : 0;

    instruments.push(
      createSamplerInstrument(
        id,
        hdr.name || `Sample ${id}`,
        rawPcm,
        hdr.volume,
        8287,       // Amiga standard C-3 sample rate (matches ICEParser / OktalyzerParser)
        loopStart,
        loopEnd,
      ),
    );
  }

  // ── Song positions ────────────────────────────────────────────────────────
  const songPositions = orderTable.slice(0, songLength);

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns:        trackerPatterns,
    instruments,
    songPositions,
    songLength,
    restartPosition,
    numChannels:     MOD_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}

// ── Tempo scanner ──────────────────────────────────────────────────────────────

/**
 * Scan the first pattern in song order for Fxx (Set Speed / Set BPM) effects.
 *
 * ProTracker Fxx semantics:
 *   0x01..0x1F → set speed (ticks per row)
 *   0x20..0xFF → set BPM
 */
function scanForTempo(
  patternCells: RawCell[][][],
  orderTable:   number[],
): { speed: number; bpm: number } {
  let speed      = 6;
  let bpm        = 125;
  let foundSpeed = false;
  let foundBPM   = false;

  const firstPatIdx = orderTable[0] ?? 0;
  const firstPat    = patternCells[firstPatIdx];
  if (!firstPat) return { speed, bpm };

  const rowsToScan = Math.min(16, firstPat.length);

  for (let row = 0; row < rowsToScan && !(foundSpeed && foundBPM); row++) {
    for (const cell of firstPat[row]) {
      if (cell.effTyp === 0x0F && cell.eff !== 0) {
        if (cell.eff < 0x20) {
          if (!foundSpeed) { speed = cell.eff; foundSpeed = true; }
        } else {
          if (!foundBPM)   { bpm   = cell.eff; foundBPM   = true; }
        }
      }
    }
  }

  return { speed, bpm };
}
