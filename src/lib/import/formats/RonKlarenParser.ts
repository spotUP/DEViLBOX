/**
 * RonKlarenParser.ts — Ron Klaren Sound Module native parser
 *
 * Ron Klaren is a 4-channel Amiga tracker whose modules are Amiga Hunk executables.
 * Files are identified by:
 *   - uint32 BE 0x000003F3 at offset 0 (Amiga HUNK_HEADER magic)
 *   - "RON_KLAREN_SOUNDMODULE!" (23 bytes) at offset 40
 *
 * Extensions: .rk (also .rkb)
 *
 * Reference: NostalgicPlayer RonKlarenWorker.cs (authoritative loader/replayer)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/Ron Klaren/
 *
 * Binary layout (Amiga HUNK executable):
 *   The module contains embedded player code in M68k machine language.
 *   All data offsets are found by scanning the M68k code for known instruction sequences.
 *
 *   The parser scans the first 0xA40 bytes (MinFileSize=0xA40) of the player
 *   code section (starting at AMIGA_HUNK_SIZE=32) to find:
 *   - Number of sub-songs (by counting MOVE.W #n,D0 sequences before main JSR table)
 *   - CIA timer value (for tempo calculation)
 *   - Sub-song info offset (4 × uint32 BE track list pointers per sub-song)
 *   - Instrument offset, arpeggio offset (from code)
 *
 * Track format: variable-length stream of commands
 *   0x00-0x7F: note byte (0-based index into period table) followed by waitCount byte
 *     - waitCount == 0: continue processing (no wait), set next note immediately
 *     - waitCount > 0: trigger note, wait waitCount*4-1 ticks
 *   0x80 (SetArpeggio): + 1 byte arpeggio number
 *   0x81 (SetPortamento): + endNote(1) + increment(1) + waitCount(1)
 *   0x82 (SetInstrument): + 1 byte instrument number
 *   0x83 (EndSong): restart/loop
 *   0x84 (ChangeAdsrSpeed): + 1 byte speed
 *   0x85 (EndSong2): restart/loop
 *   0xFF (EndOfTrack): end of this track, advance to next track in position list
 *
 * Track list (per voice per sub-song):
 *   Sequence of: uint32 BE trackOffset(from hunk start) + uint16 skip + int16 transpose + uint16 skip + uint16 repeatTimes
 *   Terminated when trackOffset's MSB is set (< 0 as int32)
 *
 * Instrument format (32 bytes each):
 *   int32 BE sampleOffset (from hunk start)
 *   int32 BE vibratoOffset (from hunk start)
 *   uint8 type (0=Synthesis, 1=Sample)
 *   uint8 phaseSpeed
 *   uint8 phaseLengthInWords
 *   uint8 vibratoSpeed
 *   uint8 vibratoDepth
 *   uint8 vibratoDelay
 *   4 × (point(1) + increment(1)) = 8 bytes ADSR
 *   int8 phaseValue
 *   int8 phaseDirection (<0 = true)
 *   uint8 phasePosition
 *   7 bytes padding
 *   Total: 4+4+6+8+3+7 = 32 bytes
 *
 * Sample record (at instrument.sampleOffset):
 *   int32 BE sampleDataOffset (from hunk start)
 *   uint16 BE lengthInWords
 *   uint16 BE phaseIndex
 *
 * Vibrato record (at instrument.vibratoOffset):
 *   uint32 BE tableOffset (from hunk start)
 *   uint16 BE length (in words → bytes = length*2)
 *
 * Period table (from Tables.cs): 70 entries, index 0-69.
 *   Index 36 = 856 = ProTracker C-2 = XM C-3 = note 37.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ──────────────────────────────────────────────────────────────

const AMIGA_HUNK_MAGIC = 0x3f3;
const AMIGA_HUNK_SIZE = 32;
const HEADER_SIZE = 32;
const MIN_FILE_SIZE = 0xa40;
const SIGNATURE = 'RON_KLAREN_SOUNDMODULE!';
const SIGNATURE_OFFSET = 40;
const PAL_CLOCK = 3546895;

/**
 * Ron Klaren period table (verbatim from Tables.cs).
 * 70 entries indexed 0-69.
 * Index 36 = period 856 = ProTracker C-2 = XM C-3 = XM note 37.
 */
const RK_PERIODS: number[] = [
  6848, 6464, 6096, 5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3616,
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808,
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  904,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  452,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,
];

// RK period index 36 → period 856 → XM note 37 (C-3)
const RK_REFERENCE_IDX = 36;
const XM_REFERENCE_NOTE = 37;

// ── Utilities ──────────────────────────────────────────────────────────────

function u16BE(b: Uint8Array, off: number): number {
  return (b[off] << 8) | b[off + 1];
}

function u32BE(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function s32BE(b: Uint8Array, off: number): number {
  const v = u32BE(b, off);
  return v >= 0x80000000 ? v - 0x100000000 : v;
}

function s16BE(b: Uint8Array, off: number): number {
  const v = u16BE(b, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

function periodToRate(period: number): number {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}

/** Convert Ron Klaren period table index (0-based) to XM note number */
function rkNoteToXM(noteIdx: number): number {
  if (noteIdx < 0 || noteIdx >= RK_PERIODS.length) return 0;
  const xm = XM_REFERENCE_NOTE + (noteIdx - RK_REFERENCE_IDX);
  return Math.max(1, Math.min(96, xm));
}

// ── Format Identification ──────────────────────────────────────────────────

export function isRonKlarenFormat(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_FILE_SIZE) return false;

  // Check Amiga HUNK header magic at offset 0
  const magic = u32BE(bytes, 0);
  if (magic !== AMIGA_HUNK_MAGIC) return false;

  // Check signature at offset 40
  let sig = '';
  for (let i = 0; i < SIGNATURE.length; i++) {
    sig += String.fromCharCode(bytes[SIGNATURE_OFFSET + i]);
  }
  return sig === SIGNATURE;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface RkTrack { trackNumber: number; transpose: number; repeatTimes: number; }
interface RkSongInfo { positions: RkTrack[][]; /* [4][N] */ }
interface RkSample { sampleDataOffset: number; lengthInWords: number; phaseIndex: number; }
interface RkInstrument {
  sampleOffset: number;
  vibratoOffset: number;
  isSample: boolean; // true=Sample, false=Synthesis
  phaseSpeed: number;
  phaseLengthInWords: number;
  vibratoSpeed: number;
  vibratoDepth: number;
  vibratoDelay: number;
  adsr: Array<{ point: number; increment: number }>;
  phaseValue: number;
  phaseDirection: boolean;
  phasePosition: number;
  // Resolved indices (filled after loading)
  sampleNumber: number;
  vibratoNumber: number;
}

// ── Format scanner (M68k code analysis) ───────────────────────────────────

interface ScanResult {
  numberOfSubSongs: number;
  ciaValue: number;
  subSongInfoOffset: number;
  instrumentOffset: number;
  arpeggioOffset: number;
  clearAdsrStateOnPortamento: boolean;
}

function scanModuleCode(bytes: Uint8Array): ScanResult | null {
  const fileLen = bytes.length;
  // The search buffer is the first MIN_FILE_SIZE bytes of the code section (starting at AMIGA_HUNK_SIZE)
  const searchLen = Math.min(MIN_FILE_SIZE, fileLen - AMIGA_HUNK_SIZE);
  if (searchLen < 64) return null;

  const buf = bytes.subarray(AMIGA_HUNK_SIZE, AMIGA_HUNK_SIZE + searchLen);
  const bufLen = buf.length;

  // ── Find number of sub-songs ───────────────────────────────────────────
  // Skip leading JMP ($4e $f9) instructions (6 bytes each), then count MOVE.W #n,D0 (0x30 0x3c ... 8 bytes each)
  let index = HEADER_SIZE - AMIGA_HUNK_SIZE; // HeaderSize=32 relative to code start
  // HEADER_SIZE is 32 from start of file, but search buffer starts at AMIGA_HUNK_SIZE=32
  // So relative to search buffer: index = HEADER_SIZE - AMIGA_HUNK_SIZE = 0
  index = 0;

  // Skip JMPs
  while (index + 6 <= bufLen && buf[index] === 0x4e && buf[index + 1] === 0xf9) {
    index += 6;
  }
  if (index >= bufLen - 6) return null;

  let numberOfSubSongs = 0;
  while (index + 8 <= bufLen && buf[index] === 0x30 && buf[index + 1] === 0x3c) {
    numberOfSubSongs++;
    index += 8;
  }
  if (numberOfSubSongs === 0) return null;

  // ── Find song speed (CIA value) and IRQ routine offset ─────────────────
  // Re-scan from header start to find init function (either 0x61 0x00 BSR or 0x33 0xfc MOVE.W)
  index = 0;
  let ciaLoValue = 0, ciaHiValue = 0;
  let irqOffset = 0;
  let initOffset = 0;
  let foundInit = false;

  for (let i = 0; i < 2 && !foundInit; i++) {
    if (index + 6 > bufLen || buf[index] !== 0x4e || buf[index + 1] !== 0xf9) break;
    const dest = (buf[index + 2] << 24) | (buf[index + 3] << 16) | (buf[index + 4] << 8) | buf[index + 5];
    if (dest < 0 || dest >= bufLen) { index += 6; continue; }
    if ((buf[dest] === 0x61 && buf[dest + 1] === 0x00) || (buf[dest] === 0x33 && buf[dest + 1] === 0xfc)) {
      initOffset = dest;
      foundInit = true;
    }
    index += 6;
  }

  if (!foundInit) {
    // Try VBlank player fallback: third JMP (index 12)
    index = 6; // second JMP
    if (index + 6 <= bufLen && buf[index] === 0x4e && buf[index + 1] === 0xf9) {
      const playOffset = (buf[index + 2] << 24) | (buf[index + 3] << 16) | (buf[index + 4] << 8) | buf[index + 5];
      if (playOffset >= 0 && playOffset < bufLen && buf[playOffset] === 0x41 && buf[playOffset + 1] === 0xfa) {
        irqOffset = playOffset;
        // VBlank: CIA = 14187 (PAL 50Hz)
        ciaLoValue = 14187 & 0xff;
        ciaHiValue = (14187 >> 8) & 0xff;
      }
    }
  } else {
    // Scan init function for CIA register writes and IRQ vector
    let idx2 = initOffset;
    while (idx2 + 10 <= bufLen && !(buf[idx2] === 0x4e && buf[idx2 + 1] === 0x75)) {
      if (buf[idx2] === 0x13 && buf[idx2 + 1] === 0xfc) {
        const value = buf[idx2 + 3];
        const adr = (buf[idx2 + 4] << 24) | (buf[idx2 + 5] << 16) | (buf[idx2 + 6] << 8) | buf[idx2 + 7];
        idx2 += 6;
        if ((adr >>> 0) === 0xbfd400) ciaLoValue = value;
        else if ((adr >>> 0) === 0xbfd500) ciaHiValue = value;
      } else if (buf[idx2] === 0x23 && buf[idx2 + 1] === 0xfc) {
        const srcAdr = (buf[idx2 + 2] << 24) | (buf[idx2 + 3] << 16) | (buf[idx2 + 4] << 8) | buf[idx2 + 5];
        const destAdr = (buf[idx2 + 6] << 24) | (buf[idx2 + 7] << 16) | (buf[idx2 + 8] << 8) | buf[idx2 + 9];
        idx2 += 8;
        if ((destAdr >>> 0) === 0x00000078) irqOffset = srcAdr;
      }
      idx2 += 2;
    }
  }

  const ciaValue = ((ciaHiValue << 8) | ciaLoValue);

  // ── Find sub-song info offset ──────────────────────────────────────────
  // Start from irqOffset in search buffer, find "LEA xxx,A0" (0x41 0xfa)
  index = irqOffset >= 0 && irqOffset < bufLen ? irqOffset : 0;
  while (index + 2 <= bufLen && !(buf[index] === 0x41 && buf[index + 1] === 0xfa)) {
    index += 2;
  }
  if (index + 4 > bufLen) return null;

  let globalOffset = ((buf[index + 2] << 8) | buf[index + 3]) + index + 2;
  // Make globalOffset absolute from start of file
  const globalOffsetAbs = globalOffset + AMIGA_HUNK_SIZE;
  index += 4;

  if (globalOffsetAbs >= fileLen) return null;

  // Find sub-song initializer pattern:
  // 0x02 0x40 0x00 0x0f 0x53 0x40 0xe9 0x48 0x47 0xf0
  let subSongInfoOffset = 0;
  while (index + 12 <= bufLen) {
    if (buf[index] === 0x4e && (buf[index + 1] === 0x73 || buf[index + 1] === 0x75)) break;
    if (
      buf[index] === 0x02 && buf[index + 1] === 0x40 && buf[index + 2] === 0x00 && buf[index + 3] === 0x0f &&
      buf[index + 4] === 0x53 && buf[index + 5] === 0x40 &&
      buf[index + 6] === 0xe9 && buf[index + 7] === 0x48 &&
      buf[index + 8] === 0x47 && buf[index + 9] === 0xf0
    ) {
      subSongInfoOffset = globalOffset + ((buf[index + 10] << 8) | buf[index + 11]) + AMIGA_HUNK_SIZE;
      break;
    }
    index += 2;
  }

  if (subSongInfoOffset === 0 || subSongInfoOffset >= fileLen) {
    // Heuristic fallback for VBlank player: sub-song info right after header
    subSongInfoOffset = 0x40 + AMIGA_HUNK_SIZE;
  }

  // ── Find instrument and arpeggio offsets ───────────────────────────────
  let instrumentOffset = 0, arpeggioOffset = 0;

  for (let i = 0; i + 4 <= bufLen; i += 2) {
    if (buf[i] === 0x0c && buf[i + 1] === 0x12 && buf[i + 2] === 0x00) {
      if (buf[i + 3] === 0x82) {
        // Look for LEA (0x49 0xfa) nearby
        for (let j = i; j + 4 <= bufLen; j += 2) {
          if (buf[j] === 0x49 && buf[j + 1] === 0xfa) {
            instrumentOffset = ((buf[j + 2] << 8) | buf[j + 3]) + j + 2 + AMIGA_HUNK_SIZE;
            break;
          }
        }
      }
      if (buf[i + 3] === 0x80) {
        for (let j = i; j + 4 <= bufLen; j += 2) {
          if (buf[j] === 0x49 && buf[j + 1] === 0xfa) {
            arpeggioOffset = ((buf[j + 2] << 8) | buf[j + 3]) + j + 2 + AMIGA_HUNK_SIZE;
            break;
          }
        }
      }
    }
    if (instrumentOffset !== 0 && arpeggioOffset !== 0) break;
  }

  if (instrumentOffset === 0 || arpeggioOffset === 0) return null;
  if (instrumentOffset >= fileLen || arpeggioOffset >= fileLen) return null;

  // ── Check clearAdsrStateOnPortamento ────────────────────────────────────
  let clearAdsrStateOnPortamento = false;
  for (let i = 0; i + 10 <= bufLen; i += 2) {
    if (buf[i] === 0x0c && buf[i + 1] === 0x12 && buf[i + 2] === 0x00 && buf[i + 3] === 0x81) {
      if (i + 10 <= bufLen && buf[i + 8] === 0x42 && buf[i + 9] === 0x68) {
        clearAdsrStateOnPortamento = true;
        break;
      }
    }
  }

  return {
    numberOfSubSongs,
    ciaValue,
    subSongInfoOffset,
    instrumentOffset,
    arpeggioOffset,
    clearAdsrStateOnPortamento,
  };
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parseRonKlarenFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isRonKlarenFormat(bytes)) return null;

  try {
    return parseInternal(bytes, filename);
  } catch (e) {
    console.warn('[RonKlarenParser] Parse failed:', e);
    return null;
  }
}

function parseInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  const fileLen = bytes.length;

  const scan = scanModuleCode(bytes);
  if (!scan) return null;

  const {
    numberOfSubSongs,
    ciaValue,
    subSongInfoOffset,
    instrumentOffset,
    arpeggioOffset,
  } = scan;

  // ── Load sub-song track list offsets ────────────────────────────────────
  // Each sub-song entry: 4 × uint32 BE (track list pointers from file start)
  const subSongTrackOffsets: number[][] = [];

  let _actualSubSongs = numberOfSubSongs;
  for (let i = 0; i < numberOfSubSongs; i++) {
    const base = subSongInfoOffset + i * 16;
    if (base + 16 > fileLen) {
      _actualSubSongs = i;
      break;
    }
    const offsets: number[] = [];
    for (let j = 0; j < 4; j++) {
      const trackListOffset = u32BE(bytes, base + j * 4) + AMIGA_HUNK_SIZE;
      if (trackListOffset >= fileLen) {
        _actualSubSongs = i;
        break;
      }
      offsets.push(trackListOffset);
    }
    if (offsets.length < 4) break;
    subSongTrackOffsets.push(offsets);
  }

  if (subSongTrackOffsets.length === 0) return null;

  // ── Load track lists for each sub-song ──────────────────────────────────
  const subSongs: RkSongInfo[] = [];

  function _loadSingleTrackList(offset: number): RkTrack[] | null {
    const tracks: RkTrack[] = [];
    let off = offset;
    for (;;) {
      if (off + 4 > fileLen) return null;
      const trackOffset = s32BE(bytes, off);
      if (trackOffset < 0) break; // sentinel

      const trackAbsOffset = trackOffset + AMIGA_HUNK_SIZE;
      off += 2; // skip 2 bytes (reserved/padding)
      if (off + 2 > fileLen) return null;
      const _transpose = s16BE(bytes, off + 2); // actually at off+2 since we skipped 2
      // Per NostalgicPlayer: seek(2) then read int16 transpose
      // Re-reading the code:
      //   trackOffset = Read_B_INT32() → 4 bytes consumed, off moved by 4
      //   seek(2) → skip 2
      //   transpose = Read_B_INT16() → 2 bytes
      //   seek(2) → skip 2
      //   repeatTimes = Read_B_UINT16() → 2 bytes
      // Total per entry: 4 + 2 + 2 + 2 + 2 = 12 bytes
      off -= 2; // undo the premature advance
      // Correct parsing from scratch at the entry start:
      // Let's redo: we advanced off by 0 yet (s32BE doesn't advance), so:
      if (off + 12 > fileLen) return null;
      const transposeVal = s16BE(bytes, off + 6);
      const repeatTimes = u16BE(bytes, off + 10);

      if (trackAbsOffset < fileLen) {
        tracks.push({ trackNumber: trackAbsOffset, transpose: transposeVal, repeatTimes });
      }
      off += 12;
    }
    return tracks;
  }

  // Re-implement track list loading correctly (was muddled above)
  function loadTrackListClean(offset: number): RkTrack[] | null {
    const tracks: RkTrack[] = [];
    let off = offset;
    for (;;) {
      if (off + 4 > fileLen) return null;
      const rawTrackOffset = s32BE(bytes, off); // int32 BE
      if (rawTrackOffset < 0) break; // terminated

      // Per NostalgicPlayer source:
      //   trackOffset = moduleStream.Read_B_INT32()  → 4 bytes
      //   moduleStream.Seek(2, SeekOrigin.Current)   → skip 2
      //   transpose = moduleStream.Read_B_INT16()    → 2 bytes
      //   moduleStream.Seek(2, SeekOrigin.Current)   → skip 2
      //   repeatTimes = moduleStream.Read_B_UINT16() → 2 bytes
      // Total: 12 bytes per entry
      if (off + 12 > fileLen) return null;
      const transpose = s16BE(bytes, off + 6);
      const repeatTimes = u16BE(bytes, off + 10);
      const trackAbsOffset = rawTrackOffset + AMIGA_HUNK_SIZE;

      if (trackAbsOffset >= 0 && trackAbsOffset < fileLen) {
        tracks.push({ trackNumber: trackAbsOffset, transpose, repeatTimes });
      }
      off += 12;
    }
    return tracks.length > 0 ? tracks : null;
  }

  for (let i = 0; i < subSongTrackOffsets.length; i++) {
    const positions: RkTrack[][] = [];
    let valid = true;
    for (let ch = 0; ch < 4; ch++) {
      const trackList = loadTrackListClean(subSongTrackOffsets[i][ch]);
      if (!trackList) { valid = false; break; }
      positions.push(trackList);
    }
    if (valid) subSongs.push({ positions });
  }

  if (subSongs.length === 0) return null;

  // ── Collect and load all unique tracks ────────────────────────────────
  // A "track" in RK is an absolute file offset. We load each unique track once.
  const trackOffsetToIndex = new Map<number, number>();
  const trackDataArrays: Uint8Array[] = [];

  function getOrLoadTrack(absOffset: number): number {
    if (trackOffsetToIndex.has(absOffset)) return trackOffsetToIndex.get(absOffset)!;
    const idx = trackDataArrays.length;
    trackOffsetToIndex.set(absOffset, idx);
    // Load single track: read bytes until 0xFF (EndOfTrack), each cmd has variable length
    const data: number[] = [];
    let off = absOffset;
    while (off < fileLen) {
      const cmd = bytes[off];
      data.push(cmd);
      off++;
      if (cmd === 0xff) break; // EndOfTrack
      if (cmd < 0x80) {
        // Note: 1 byte following (waitCount)
        if (off < fileLen) data.push(bytes[off++]);
      } else if (cmd === 0x80) {
        // SetArpeggio: 1 arg
        if (off < fileLen) data.push(bytes[off++]);
      } else if (cmd === 0x81) {
        // SetPortamento: 3 args
        for (let i = 0; i < 3 && off < fileLen; i++) data.push(bytes[off++]);
      } else if (cmd === 0x82) {
        // SetInstrument: 1 arg
        if (off < fileLen) data.push(bytes[off++]);
      } else if (cmd === 0x83 || cmd === 0x85) {
        // EndSong / EndSong2: 0 args
      } else if (cmd === 0x84) {
        // ChangeAdsrSpeed: 1 arg
        if (off < fileLen) data.push(bytes[off++]);
      }
      // 0x83, 0x85 stop processing but loop back — stop here
      if (cmd === 0x83 || cmd === 0x85) break;
    }
    trackDataArrays.push(new Uint8Array(data));
    return idx;
  }

  // Process all sub-songs to load tracks and remap offsets to indices
  for (const songInfo of subSongs) {
    for (const posList of songInfo.positions) {
      for (const track of posList) {
        const idx = getOrLoadTrack(track.trackNumber);
        track.trackNumber = idx;
      }
    }
  }

  // ── Find max instrument / arpeggio counts from track data ─────────────
  let maxInstrument = 0, maxArpeggio = 0;
  for (const td of trackDataArrays) {
    for (let i = 0; i < td.length; i++) {
      const cmd = td[i];
      if (cmd === 0x82 && i + 1 < td.length) {
        maxInstrument = Math.max(maxInstrument, td[i + 1] + 1);
        i++;
      } else if (cmd === 0x80 && i + 1 < td.length) {
        maxArpeggio = Math.max(maxArpeggio, td[i + 1] + 1);
        i++;
      } else if (cmd < 0x80) {
        i++; // skip waitCount
      } else if (cmd === 0x81) {
        i += 3;
      } else if (cmd === 0x84) {
        i++;
      }
    }
  }

  // ── Load arpeggios ─────────────────────────────────────────────────────
  // Each arpeggio: 12 signed bytes
  const arpeggios: Int8Array[] = [];
  for (let i = 0; i < maxArpeggio; i++) {
    const base = arpeggioOffset + i * 12;
    if (base + 12 > fileLen) break;
    const arr = new Int8Array(12);
    for (let j = 0; j < 12; j++) arr[j] = s8(bytes[base + j]);
    arpeggios.push(arr);
  }

  // ── Load instruments ───────────────────────────────────────────────────
  // Instrument format: 32 bytes each (from NostalgicPlayer LoadInstruments)
  // int32 sampleOffset + int32 vibratoOffset + type(1) + phaseSpeed(1) + phaseLengthInWords(1) +
  // vibratoSpeed(1) + vibratoDepth(1) + vibratoDelay(1) + adsr[4]×(point+increment) = 8 +
  // phaseValue(1) + phaseDirection(1) + phasePosition(1) + seek(7) = 32 bytes total
  const instruments: RkInstrument[] = [];

  for (let i = 0; i < maxInstrument; i++) {
    const base = instrumentOffset + i * 32;
    if (base + 32 > fileLen) break;
    const rawSampleOffset = s32BE(bytes, base);
    const rawVibratoOffset = s32BE(bytes, base + 4);
    const typeVal = bytes[base + 8];
    const phaseSpeed = bytes[base + 9];
    const phaseLengthInWords = bytes[base + 10];
    const vibratoSpeed = bytes[base + 11];
    const vibratoDepth = bytes[base + 12];
    const vibratoDelay = bytes[base + 13];

    const adsr: Array<{ point: number; increment: number }> = [];
    for (let j = 0; j < 4; j++) {
      adsr.push({ point: bytes[base + 14 + j], increment: bytes[base + 18 + j] });
    }
    const phaseValue = s8(bytes[base + 22]);
    const phaseDirectionRaw = s8(bytes[base + 23]);
    const phaseDirection = phaseDirectionRaw < 0;
    const phasePosition = bytes[base + 24];

    const sampleAbsOffset = rawSampleOffset + AMIGA_HUNK_SIZE;
    const vibratoAbsOffset = rawVibratoOffset + AMIGA_HUNK_SIZE;

    instruments.push({
      sampleOffset: sampleAbsOffset,
      vibratoOffset: vibratoSpeed > 0 ? vibratoAbsOffset : -1,
      isSample: typeVal !== 0,
      phaseSpeed,
      phaseLengthInWords,
      vibratoSpeed,
      vibratoDepth,
      vibratoDelay,
      adsr,
      phaseValue,
      phaseDirection,
      phasePosition,
      sampleNumber: -1,
      vibratoNumber: -1,
    });
  }

  // ── Load samples and sample data ───────────────────────────────────────
  // Each instrument points to a sample record at sampleOffset (8 bytes):
  //   int32 BE sampleDataOffset (relative, + HUNK_SIZE to get absolute)
  //   uint16 BE lengthInWords
  //   uint16 BE phaseIndex
  const sampleOffsetToIndex = new Map<number, number>();
  const loadedSamples: RkSample[] = [];
  const sampleDataMap = new Map<number, Int8Array>();

  for (const instr of instruments) {
    const soff = instr.sampleOffset;
    if (soff < 0 || soff + 8 > fileLen) continue;

    if (!sampleOffsetToIndex.has(soff)) {
      const sampleDataRaw = s32BE(bytes, soff);
      const lengthInWords = u16BE(bytes, soff + 4);
      const phaseIndex = u16BE(bytes, soff + 6);
      const sampleDataAbs = sampleDataRaw + AMIGA_HUNK_SIZE;

      const idx = loadedSamples.length;
      sampleOffsetToIndex.set(soff, idx);

      loadedSamples.push({ sampleDataOffset: sampleDataAbs, lengthInWords, phaseIndex });

      // Load PCM data
      if (!sampleDataMap.has(sampleDataAbs) && sampleDataAbs >= 0 && sampleDataAbs + lengthInWords * 2 <= fileLen) {
        const byteLen = lengthInWords * 2;
        const pcm = new Int8Array(byteLen);
        for (let j = 0; j < byteLen; j++) pcm[j] = s8(bytes[sampleDataAbs + j]);
        sampleDataMap.set(sampleDataAbs, pcm);
      }
    }

    instr.sampleNumber = sampleOffsetToIndex.get(soff) ?? -1;
  }

  // ── Build InstrumentConfig[] ───────────────────────────────────────────
  const instrumentConfigs: InstrumentConfig[] = [];

  // Instrument 0 is always the "empty" instrument in RK (skip it)
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;

    if (instr.sampleNumber < 0 || instr.sampleNumber >= loadedSamples.length) {
      instrumentConfigs.push({
        id,
        name: `Instrument ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
      continue;
    }

    const sample = loadedSamples[instr.sampleNumber];
    const pcm = sampleDataMap.get(sample.sampleDataOffset);

    if (pcm && sample.lengthInWords > 0) {
      const pcmBytes = new Uint8Array(pcm.buffer);
      const period = RK_PERIODS[RK_REFERENCE_IDX];
      const sampleRate = periodToRate(period);
      const loopStart = instr.isSample ? 0 : 0;
      const loopEnd = (!instr.isSample && pcmBytes.length > 0) ? pcmBytes.length : 0;

      instrumentConfigs.push(
        createSamplerInstrument(id, `Sample ${i + 1}`, pcmBytes, 64, sampleRate, loopStart, loopEnd)
      );
    } else {
      instrumentConfigs.push({
        id,
        name: `Instrument ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // Ensure instrument 0 exists (empty instrument)
  if (instrumentConfigs.length === 0 || instrumentConfigs[0].id !== 1) {
    instrumentConfigs.unshift({
      id: 0,
      name: 'Empty',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Decode tracks into note rows ───────────────────────────────────────
  interface RkRow { noteIdx: number; instrNum: number; }

  function decodeTrackToRows(data: Uint8Array, numRows: number, transpose: number): RkRow[] {
    const rows: RkRow[] = [];
    let pos = 0;
    let currentInstr = 0;
    let pendingRows = 0;

    function emitRow(noteIdx: number, instrId: number): void {
      rows.push({ noteIdx, instrNum: instrId });
    }

    while (pos < data.length && rows.length < numRows) {
      if (pendingRows > 0) {
        emitRow(0, 0);
        pendingRows--;
        continue;
      }

      const cmd = data[pos++];

      if (cmd === 0xff) {
        // EndOfTrack
        break;
      }

      if (cmd === 0x80) {
        // SetArpeggio (skip arg, not tracked for static display)
        if (pos < data.length) pos++;
        continue;
      }

      if (cmd === 0x81) {
        // SetPortamento: endNote(1) + increment(1) + waitCount(1)
        if (pos + 2 < data.length) {
          const endNote = data[pos];
          const increment = data[pos + 1];
          const waitCount = data[pos + 2];
          pos += 3;
          // Portamento: emit note row with current period and wait
          const transposedEnd = Math.min(endNote + transpose, RK_PERIODS.length - 1);
          if (waitCount > 0) {
            emitRow(transposedEnd, currentInstr);
            pendingRows = waitCount * 4 - 2; // -1 for current row, -1 for trigger
            if (pendingRows < 0) pendingRows = 0;
          }
          void increment; // used by playback only
        }
        continue;
      }

      if (cmd === 0x82) {
        // SetInstrument
        if (pos < data.length) { currentInstr = data[pos++]; }
        continue;
      }

      if (cmd === 0x83 || cmd === 0x85) {
        // EndSong / EndSong2 — stop
        break;
      }

      if (cmd === 0x84) {
        // ChangeAdsrSpeed
        if (pos < data.length) pos++;
        continue;
      }

      if (cmd < 0x80) {
        // Note
        const noteIdx = cmd;
        const waitCount = pos < data.length ? data[pos++] : 0;

        const transposedNote = Math.min(noteIdx + transpose, RK_PERIODS.length - 1);
        const clampedNote = Math.max(0, transposedNote);

        if (waitCount === 0) {
          // No wait — don't emit row, keep processing
          // This means the note is set but we continue reading (per NostalgicPlayer: return true)
          emitRow(clampedNote, currentInstr);
        } else {
          emitRow(clampedNote, currentInstr);
          pendingRows = waitCount * 4 - 2;
          if (pendingRows < 0) pendingRows = 0;
        }
        continue;
      }
    }

    // Pad to numRows
    while (rows.length < numRows) rows.push({ noteIdx: 0, instrNum: 0 });
    return rows.slice(0, numRows);
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────
  // Use sub-song 0 (primary). Each track in each channel's position list contributes rows.
  // For display, we flatten the track list per channel into one big pattern (or per-track patterns).
  // We'll produce one pattern per position-list-entry of the longest channel.

  const primarySong = subSongs[0];
  const ROWS_PER_TRACK = 64; // Standard rows per track display unit

  // Find the max number of track entries across all channels
  const maxTrackEntries = Math.max(...primarySong.positions.map(p => p.length));

  const trackerPatterns: Pattern[] = [];

  for (let posIdx = 0; posIdx < maxTrackEntries; posIdx++) {
    const channelRows: TrackerCell[][] = Array.from({ length: 4 }, () => []);

    for (let ch = 0; ch < 4; ch++) {
      const posList = primarySong.positions[ch];
      const entry = posIdx < posList.length ? posList[posIdx] : null;

      if (!entry || entry.trackNumber >= trackDataArrays.length) {
        // Emit empty rows
        for (let r = 0; r < ROWS_PER_TRACK; r++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        continue;
      }

      const trackData = trackDataArrays[entry.trackNumber];
      const decodedRows = decodeTrackToRows(trackData, ROWS_PER_TRACK, entry.transpose);

      for (const row of decodedRows) {
        const _xmNote = row.noteIdx > 0 ? rkNoteToXM(row.noteIdx - 1) : 0;
        // Note byte in RK is 0-based index into period table; 0 means C-0 (lowest note)
        // Actually in RK, the note byte is the period table index directly (no special 0=empty)
        // But 0x80+ are effects. So note 0 means period[0] which is 6848 (very low).
        // We treat 0 specially since there's no "no note" sentinel in the note range.
        // Looking at ParseTrackNewNote: note byte comes BEFORE any check for 0 — so all
        // values 0x00-0x7F are valid notes. A "rest" is conveyed by not writing a note byte.
        // Since empty rows are padded, row.noteIdx=0 from padding → XM note 0 = rest.
        const xmNoteFixed = row.noteIdx === 0 ? 0 : rkNoteToXM(row.noteIdx);
        const instrId = row.instrNum;

        channelRows[ch].push({
          note: xmNoteFixed,
          instrument: instrId,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }

    trackerPatterns.push({
      id: `pattern-${posIdx}`,
      name: `Position ${posIdx}`,
      length: ROWS_PER_TRACK,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ([-50, 50, 50, -50] as const)[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'RK',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: trackDataArrays.length,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: ROWS_PER_TRACK,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ([-50, 50, 50, -50] as const)[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: ROWS_PER_TRACK }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'RK',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  // Convert CIA timer to BPM: CIA clock = PAL 709379 Hz / ciaValue
  // Typical: ciaValue=14187 → 50 Hz → 125 BPM (assuming speed=2)
  const bpm = ciaValue > 0 ? Math.round(709379 / ciaValue) : 125;

  return {
    name: moduleName,
    format: 'RK' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrumentConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, bpm)),
    linearPeriods: false,
  };
}
