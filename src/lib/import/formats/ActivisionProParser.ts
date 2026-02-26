/**
 * ActivisionProParser.ts — Activision Pro (Martin Walker) native parser
 *
 * Activision Pro is a 4-channel Amiga tracker used in games published by Activision.
 * Also known as the "Martin Walker" player. Identified by scanning M68k player code
 * for distinctive byte patterns (no static magic bytes — identification is heuristic).
 * Extensions: .avp, .mw (NostalgicPlayer FileExtensions).
 *
 * Format characteristics:
 *   - No fixed header magic; identification by scanning the first ~4096 bytes
 *     for the init function pattern (0x48 0xe7 0xfc 0xfe) and validating several
 *     structural patterns within the player code.
 *   - Multiple instrument format versions (1, 2, 3) and track parse versions (1-5)
 *     are determined by reading the M68k opcode patterns.
 *   - Sub-songs: each is 16 bytes of offsets + 8 speed-variation bytes at the
 *     sub-song list offset.
 *   - Position lists: variable-length; end markers 0xfe or 0xff.
 *   - Tracks: variable-length; end marker 0xff.
 *   - Instruments: 16 bytes each, with three format variants.
 *   - Samples: 27 slots (index 0-26); some variants embed length/loop in sample data.
 *
 * Reference: NostalgicPlayer ActivisionProWorker.cs (authoritative loader/replayer)
 *
 * IMPORTANT: Identification is entirely heuristic (M68k opcode scan). False positives
 * are possible; false negatives on heavily customised players are possible. Return null
 * on any structural inconsistency.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────

const PAL_CLOCK = 3546895;
const MAX_SAMPLES = 27;

/**
 * Activision Pro period table (verbatim from NostalgicPlayer Tables.cs).
 * 85 entries (some duplicated / quirky values in the original, preserved faithfully).
 */
const AVP_PERIODS: number[] = [
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951,  895,
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951,  895,
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951, 1790,
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951,  895,
   848,  800,  753,  713,  674,  634,  595,  563,  531,  503,  476,  448,
   424,  400,  377,  357,  337,  317,  298,  282,  266,  252,  238,  224,
   212,  200,  189,  179,  169,  159,  149,  141,  133,  126,  119,  112,
   106,
];

// Reference: period 424 = ProTracker C-2 ≈ XM note 37 (C-3). Index of 424 in table = 60.
const AVP_REF_PERIOD = 424;
const AVP_REF_IDX    = 60;  // 0-based index in AVP_PERIODS for period 424
const AVP_REF_XM     = 37;  // XM note C-3

// ── Utilities ──────────────────────────────────────────────────────────────

function u16BE(b: Uint8Array, off: number): number {
  return (b[off] << 8) | b[off + 1];
}

function u32BE(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function s8(v: number): number { return v < 128 ? v : v - 256; }
function s16BE(b: Uint8Array, off: number): number {
  const v = u16BE(b, off);
  return v < 0x8000 ? v : v - 0x10000;
}

function periodToRate(period: number): number {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}

/** Convert AVP period index (0-based) to XM note */
function avpNoteToXM(idx: number): number {
  if (idx < 0 || idx >= AVP_PERIODS.length) return 0;
  const xm = AVP_REF_XM + (idx - AVP_REF_IDX);
  return Math.max(1, Math.min(96, xm));
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if bytes could be an Activision Pro (Martin Walker) module.
 * Uses the same heuristic as NostalgicPlayer: scan first 0x400 bytes for
 * init function byte pattern (0x48 0xe7 0xfc 0xfe), then validate play
 * function patterns and extract offsets.
 */
export function isActivisionProFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 1024) return false;
  const info = extractPlayerInfo(bytes);
  return info !== null;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface AvpPlayerInfo {
  subSongListOffset: number;
  positionListsOffset: number;
  trackOffsetsOffset: number;
  tracksOffset: number;
  envelopesOffset: number;
  instrumentsOffset: number;
  sampleStartOffsetsOffset: number;
  sampleDataOffset: number;
  sampleInfoOffset: number;      // -1 if not present (haveSeparateSampleInfo=false)
  instrumentFormatVersion: number; // 1, 2 or 3
  parseTrackVersion: number;       // 1-5
  speedVariationVersion: number;   // 1 or 2
  speedVariationSpeedIncrementOffset: number; // only for version 2
  haveSeparateSampleInfo: boolean;
  haveEnvelope: boolean;
  vibratoVersion: number;          // 1 or 2
}

interface AvpSample {
  length: number;    // in words
  loopStart: number; // in words (bytes: loopStart * 1 per haveSeparateSampleInfo)
  loopLength: number; // in words
  pcm: Int8Array | null;
}

interface AvpInstrument {
  sampleNumber: number;
  envelopeNumber: number;
  volume: number;
  enabledEffectFlags: number;
  portamentoAdd: number;
  fineTune: number;
  stopResetEffectDelay: number;
  sampleNumber2: number;
  sampleStartOffset: number;
  arpeggioTable: number[];  // 4 signed bytes
  fixedOrTransposedNote: number;
  transpose: number;
  vibratoNumber: number;
  vibratoDelay: number;
}

interface AvpSongInfo {
  positionLists: Uint8Array[];  // 4 channels, each a raw position list
  speedVariation: Int8Array;    // 8 bytes
}

// ── Heuristic player info extraction ──────────────────────────────────────

/**
 * Scan the first 4096 bytes for the M68k init pattern and extract all
 * necessary offsets. Returns null if the format is not recognised.
 * Faithfully mirrors NostalgicPlayer's TestModule → FindStartOffset →
 * ExtractInfoFromInitFunction → ExtractInfoFromPlayFunction chain.
 */
function extractPlayerInfo(bytes: Uint8Array): AvpPlayerInfo | null {
  const searchLength = Math.min(bytes.length, 4096);

  // Find start offset: look for 0x48 0xe7 0xfc 0xfe
  let startOffset = -1;
  for (let i = 0; i < searchLength - 3; i++) {
    if (bytes[i] === 0x48 && bytes[i + 1] === 0xe7 && bytes[i + 2] === 0xfc && bytes[i + 3] === 0xfe) {
      startOffset = i;
      break;
    }
  }
  if (startOffset < 0) return null;

  // ── Extract from init function ─────────────────────────────────────────
  let subSongListOffset = -1;
  let positionListsOffset = -1;
  let index: number;

  // Look for: 0xe9 0x41 0x70 0x00 0x41 0xfa
  for (index = startOffset; index < searchLength - 6; index += 2) {
    if (bytes[index] === 0xe9 && bytes[index + 1] === 0x41 &&
        bytes[index + 2] === 0x70 && bytes[index + 3] === 0x00 &&
        bytes[index + 4] === 0x41 && bytes[index + 5] === 0xfa) {
      break;
    }
  }
  if (index >= searchLength - 6) return null;

  subSongListOffset = (s16BE(bytes, index + 6)) + index + 6;

  // Find BSR (0x61 0x00) not preceded by RTS
  for (; index < searchLength - 4; index += 2) {
    if (bytes[index] === 0x4e && bytes[index + 1] === 0x75) return null;
    if (bytes[index] === 0x61 && bytes[index + 1] === 0x00) break;
  }
  if (index >= searchLength - 4) return null;

  index = s16BE(bytes, index + 2) + index + 2;
  if (index < 0 || index >= searchLength) return null;

  // Check for: 0x7a 0x00 … 0x49 0xfa
  if (bytes[index] !== 0x7a || bytes[index + 1] !== 0x00) return null;
  if (bytes[index + 6] !== 0x49 || bytes[index + 7] !== 0xfa) return null;

  positionListsOffset = s16BE(bytes, index + 8) + index + 8;

  // ── Extract from play function ─────────────────────────────────────────
  let trackOffsetsOffset = -1;
  let tracksOffset = -1;
  let envelopesOffset = -1;
  let instrumentsOffset = -1;
  let sampleStartOffsetsOffset = -1;
  let sampleDataOffset = -1;
  let sampleInfoOffset = -1;
  let speedVariationVersion = 0;
  let speedVariationSpeedIncrementOffset = -1;
  let parseTrackVersion = 0;
  let instrumentFormatVersion = 0;
  let haveSeparateSampleInfo = false;
  let haveEnvelope = false;
  let vibratoVersion = 0;

  // Find play function: 0x2c 0x7c … 0x4a 0x29
  for (index = startOffset; index < searchLength - 8; index += 2) {
    if (bytes[index] === 0x2c && bytes[index + 1] === 0x7c &&
        bytes[index + 6] === 0x4a && bytes[index + 7] === 0x29) {
      break;
    }
  }
  if (index >= searchLength - 8) return null;

  const startOfPlay = index;
  let globalOffset = 0;

  // Walk backwards for: 0x4b 0xfa (instrumentsOffset) and 0x43 0xfa (globalOffset)
  index -= 4;
  for (; index >= 0; index -= 2) {
    if (bytes[index] === 0x4b && bytes[index + 1] === 0xfa) {
      instrumentsOffset = s16BE(bytes, index + 2) + index + 2;
    } else if (bytes[index] === 0x43 && bytes[index + 1] === 0xfa) {
      globalOffset = s16BE(bytes, index + 2) + index + 2;
    }
    if (instrumentsOffset !== -1 && globalOffset !== 0) break;
  }
  if (instrumentsOffset === -1 || globalOffset === 0) return null;

  // Find speed variation version: 0x53 0x69 … 0x67
  index = startOfPlay;
  for (; index < searchLength - 16; index += 2) {
    if (bytes[index] === 0x53 && bytes[index + 1] === 0x69 && bytes[index + 4] === 0x67) break;
  }
  if (index >= searchLength - 16) return null;

  if (bytes[index + 6] === 0x70 && bytes[index + 7] === 0x03) {
    speedVariationVersion = 1;
  } else if (bytes[index + 6] === 0x7a && bytes[index + 7] === 0x00) {
    speedVariationVersion = 2;
    if (bytes[index + 12] !== 0xda || bytes[index + 13] !== 0x29) return null;
    speedVariationSpeedIncrementOffset = globalOffset + s16BE(bytes, index + 14);
  } else {
    return null;
  }

  index += 8;

  // Find: 0x7a 0x00 0x1a 0x31 … 0xda 0x45 0x49 0xfa
  for (; index < searchLength - 12; index += 2) {
    if (bytes[index] === 0x7a && bytes[index + 1] === 0x00 &&
        bytes[index + 2] === 0x1a && bytes[index + 3] === 0x31 &&
        bytes[index + 6] === 0xda && bytes[index + 7] === 0x45 &&
        bytes[index + 8] === 0x49 && bytes[index + 9] === 0xfa) {
      break;
    }
  }
  if (index >= searchLength - 12) return null;

  trackOffsetsOffset = s16BE(bytes, index + 10) + index + 10;
  index += 12;

  // Validate: 0x3a 0x34 … 0x49 0xfa
  if (index >= searchLength - 8) return null;
  if (bytes[index] !== 0x3a || bytes[index + 1] !== 0x34 ||
      bytes[index + 4] !== 0x49 || bytes[index + 5] !== 0xfa) return null;

  tracksOffset = s16BE(bytes, index + 6) + index + 6;
  index += 8;

  // Parse track version: find 0x18 0x31
  for (; index < searchLength - 6; index += 2) {
    if (bytes[index] === 0x18 && bytes[index + 1] === 0x31) break;
  }
  if (index >= searchLength - 6) return null;

  index += 6;

  // Determine parse track version from next few bytes
  for (; index < searchLength - 10; index += 2) {
    if (bytes[index] === 0x42 && bytes[index + 1] === 0x31) break;
  }
  if (index >= searchLength - 10) return null;

  index += 8;

  if (bytes[index] === 0x08 && bytes[index + 1] === 0x31) {
    parseTrackVersion = 1;
  } else if (bytes[index] === 0x4a && bytes[index + 1] === 0x34) {
    parseTrackVersion = 2;
  } else if (bytes[index] === 0x1a && bytes[index + 1] === 0x34) {
    parseTrackVersion = 3;
  } else if (bytes[index] === 0x42 && bytes[index + 1] === 0x30) {
    parseTrackVersion = 4;
    index += 2;
    for (; index < searchLength - 4; index += 2) {
      if (bytes[index] === 0x31 && bytes[index + 1] === 0x85) break;
      if (bytes[index] === 0x0c && bytes[index + 1] === 0x05 &&
          bytes[index + 2] === 0x00 && bytes[index + 3] === 0x84) {
        parseTrackVersion = 5;
        break;
      }
    }
    if (index >= searchLength - 4) return null;
    index -= 2;
  } else {
    return null;
  }

  index += 2;

  // Find: 0x31 0x85
  for (; index < searchLength - 2; index += 2) {
    if (bytes[index] === 0x31 && bytes[index + 1] === 0x85) break;
  }
  if (index >= searchLength - 2) return null;

  index += 4;

  // Determine instrument format version
  if (index >= searchLength - 16) return null;

  if (bytes[index] === 0x13 && bytes[index + 1] === 0xb5 && bytes[index + 2] === 0x50 && bytes[index + 3] === 0x02 &&
      bytes[index + 6] === 0x13 && bytes[index + 7] === 0xb5 && bytes[index + 8] === 0x50 && bytes[index + 9] === 0x07 &&
      bytes[index + 12] === 0x13 && bytes[index + 13] === 0xb5 && bytes[index + 14] === 0x50 && bytes[index + 15] === 0x0f) {
    instrumentFormatVersion = 1;
  } else if (
      bytes[index] === 0x11 && bytes[index + 1] === 0xb5 && bytes[index + 2] === 0x50 && bytes[index + 3] === 0x01 &&
      bytes[index + 6] === 0x13 && bytes[index + 7] === 0xb5 && bytes[index + 8] === 0x50 && bytes[index + 9] === 0x02 &&
      bytes[index + 12] === 0x13 && bytes[index + 13] === 0xb5 && bytes[index + 14] === 0x50 && bytes[index + 15] === 0x07 &&
      bytes[index + 18] === 0x13 && bytes[index + 19] === 0xb5 && bytes[index + 20] === 0x50 && bytes[index + 21] === 0x0f) {
    instrumentFormatVersion = 2;
  } else if (
      bytes[index] === 0x11 && bytes[index + 1] === 0xb5 && bytes[index + 2] === 0x50 && bytes[index + 3] === 0x01 &&
      bytes[index + 6] === 0x13 && bytes[index + 7] === 0xb5 && bytes[index + 8] === 0x50 && bytes[index + 9] === 0x02 &&
      bytes[index + 12] === 0x13 && bytes[index + 13] === 0xb5 && bytes[index + 14] === 0x50 && bytes[index + 15] === 0x03 &&
      bytes[index + 18] === 0x31 && bytes[index + 19] === 0xb5 && bytes[index + 20] === 0x50 && bytes[index + 21] === 0x04 &&
      bytes[index + 24] === 0x33 && bytes[index + 25] === 0x75 && bytes[index + 26] === 0x50 && bytes[index + 27] === 0x06 &&
      bytes[index + 30] === 0x13 && bytes[index + 31] === 0xb5 && bytes[index + 32] === 0x50 && bytes[index + 33] === 0x08 &&
      bytes[index + 36] === 0x13 && bytes[index + 37] === 0xb5 && bytes[index + 38] === 0x50 && bytes[index + 39] === 0x0f) {
    instrumentFormatVersion = 3;
  } else {
    return null;
  }

  // Find: 0xe5 0x45 0x45 0xfa
  for (; index < searchLength - 14; index += 2) {
    if (bytes[index] === 0xe5 && bytes[index + 1] === 0x45 && bytes[index + 2] === 0x45 && bytes[index + 3] === 0xfa) break;
  }
  if (index >= searchLength - 14) return null;

  sampleStartOffsetsOffset = s16BE(bytes, index + 4) + index + 4;
  if (bytes[index + 10] !== 0x45 || bytes[index + 11] !== 0xfa) return null;
  sampleDataOffset = s16BE(bytes, index + 12) + index + 12;

  index += 14;

  // Check for separate sample info
  if (index < searchLength - 20 &&
      bytes[index + 12] === 0xca && bytes[index + 13] === 0xfc &&
      bytes[index + 16] === 0x45 && bytes[index + 17] === 0xfa) {
    haveSeparateSampleInfo = true;
    sampleInfoOffset = s16BE(bytes, index + 18) + index + 18;
    index += 18;
  }

  // Find portamento/vibrato type: look for 0x6b 0x00 … 0x4a 0x31
  for (; index < searchLength - 12; index += 2) {
    if (bytes[index] === 0x6b && bytes[index + 1] === 0x00 && bytes[index + 4] === 0x4a && bytes[index + 5] === 0x31) break;
  }
  if (index >= searchLength - 12) return null;

  index += 10;

  // Find vibrato version: look for 0x9b 0x70
  for (; index < searchLength - 10; index += 2) {
    if (bytes[index] === 0xda && bytes[index + 1] === 0x45) { index += 2; break; }
  }
  for (; index < searchLength - 10; index += 2) {
    if (bytes[index] === 0x9b && bytes[index + 1] === 0x70) break;
  }
  if (index >= searchLength - 10) return null;

  if (bytes[index + 4] === 0x53 && bytes[index + 5] === 0x31) {
    vibratoVersion = 1;
  } else if (bytes[index + 8] === 0x8a && bytes[index + 9] === 0xf1) {
    vibratoVersion = 2;
  } else {
    return null;
  }

  // Skip effects scan (FindEnabledEffects) — we don't need the effect feature flags for parsing

  // Find envelope flag: look for 0x6b 0x00 and 0x4a 0x31 further ahead
  index += 10;
  haveEnvelope = false;
  if (index < searchLength - 8 && bytes[index + 4] === 0x6b && bytes[index + 6] === 0x4a && bytes[index + 7] === 0x31) {
    haveEnvelope = true;
    index += 8;
    // Find envelope offset: 0xe9 0x44 … 0x45 0xfa
    for (; index < searchLength - 10; index += 2) {
      if ((bytes[index] === 0xe9 && bytes[index + 1] === 0x44) &&
          ((bytes[index + 2] === 0x31 || bytes[index + 2] === 0x11) && bytes[index + 3] === 0x84) &&
          bytes[index + 6] === 0x45 && bytes[index + 7] === 0xfa) {
        envelopesOffset = s16BE(bytes, index + 8) + index + 8;
        break;
      }
    }
  }

  if (subSongListOffset < 0 || positionListsOffset < 0 || trackOffsetsOffset < 0 ||
      tracksOffset < 0 || instrumentsOffset < 0 ||
      sampleStartOffsetsOffset < 0 || sampleDataOffset < 0) {
    return null;
  }

  return {
    subSongListOffset,
    positionListsOffset,
    trackOffsetsOffset,
    tracksOffset,
    envelopesOffset: haveEnvelope ? envelopesOffset : -1,
    instrumentsOffset,
    sampleStartOffsetsOffset,
    sampleDataOffset,
    sampleInfoOffset: haveSeparateSampleInfo ? sampleInfoOffset : -1,
    instrumentFormatVersion,
    parseTrackVersion,
    speedVariationVersion,
    speedVariationSpeedIncrementOffset,
    haveSeparateSampleInfo,
    haveEnvelope,
    vibratoVersion,
  };
}

// ── Main Parser ────────────────────────────────────────────────────────────

export function parseActivisionProFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (bytes.length < 1024) return null;

  try {
    return parseInternal(bytes, filename);
  } catch (e) {
    console.warn('[ActivisionProParser] Parse failed:', e);
    return null;
  }
}

function parseInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  const info = extractPlayerInfo(bytes);
  if (!info) return null;

  const len = bytes.length;

  // ── Speed variation speed init ─────────────────────────────────────────
  let speedVariationSpeedInit = 0;
  if (info.speedVariationVersion === 2 && info.speedVariationSpeedIncrementOffset >= 0 &&
      info.speedVariationSpeedIncrementOffset < len) {
    speedVariationSpeedInit = bytes[info.speedVariationSpeedIncrementOffset];
  }

  // ── Sub-song list and position lists ──────────────────────────────────
  const subSongListOffset = info.subSongListOffset;
  const positionListsOffset = info.positionListsOffset;

  if (subSongListOffset < 0 || positionListsOffset <= subSongListOffset) return null;

  const numberOfSubSongs = Math.floor((positionListsOffset - subSongListOffset) / 16);
  if (numberOfSubSongs <= 0) return null;

  const songInfoList: AvpSongInfo[] = [];

  for (let i = 0; i < numberOfSubSongs; i++) {
    const base = subSongListOffset + i * 16;
    if (base + 16 > len) break;

    const posListOffsets: number[] = [
      u16BE(bytes, base),
      u16BE(bytes, base + 2),
      u16BE(bytes, base + 4),
      u16BE(bytes, base + 6),
    ];

    const speedVariation = new Int8Array(8);
    for (let j = 0; j < 8; j++) {
      speedVariation[j] = s8(bytes[base + 8 + j]);
    }

    const positionLists: Uint8Array[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const listOff = positionListsOffset + posListOffsets[ch];
      if (listOff >= len) {
        positionLists.push(new Uint8Array([0xff]));
        continue;
      }
      const list = loadPositionList(bytes, listOff);
      positionLists.push(list);
    }

    songInfoList.push({ positionLists, speedVariation });
  }

  if (songInfoList.length === 0) return null;

  // ── Tracks ─────────────────────────────────────────────────────────────
  const trackOffsetsOffset = info.trackOffsetsOffset;
  const tracksOffset = info.tracksOffset;

  if (trackOffsetsOffset < 0 || tracksOffset < 0 || tracksOffset <= trackOffsetsOffset) return null;

  const numberOfTracks = Math.floor((tracksOffset - trackOffsetsOffset) / 2);
  const trackOffsets: number[] = [];
  for (let i = 0; i < numberOfTracks; i++) {
    const off = trackOffsetsOffset + i * 2;
    if (off + 2 > len) break;
    trackOffsets.push(s16BE(bytes, off));
  }

  const tracks: (Uint8Array | null)[] = new Array(numberOfTracks).fill(null);
  for (let i = 0; i < trackOffsets.length; i++) {
    if (trackOffsets[i] < 0) continue;
    const trackOff = tracksOffset + trackOffsets[i];
    if (trackOff >= len) continue;
    tracks[i] = loadSingleTrack(bytes, trackOff, info.parseTrackVersion);
  }

  // ── Envelopes ──────────────────────────────────────────────────────────
  // (loaded but not used for static pattern extraction)
  // envelopesOffset → instrumentsOffset; each 16 bytes (5×3 + 1 extra = 16)

  // ── Instruments ────────────────────────────────────────────────────────
  const instrumentsOffset = info.instrumentsOffset;
  const trackOffsetsOffset2 = info.trackOffsetsOffset;

  if (instrumentsOffset < 0 || trackOffsetsOffset2 <= instrumentsOffset) return null;

  const numberOfInstruments = Math.floor((trackOffsetsOffset2 - instrumentsOffset) / 16);
  const instruments: AvpInstrument[] = [];

  for (let i = 0; i < numberOfInstruments; i++) {
    const base = instrumentsOffset + i * 16;
    if (base + 16 > len) break;

    const instr = loadInstrument(bytes, base, info.instrumentFormatVersion);
    if (instr) instruments.push(instr);
  }

  // ── Sample info and data ────────────────────────────────────────────────
  const samples: AvpSample[] = Array.from({ length: MAX_SAMPLES }, () => ({
    length: 0, loopStart: 0, loopLength: 1, pcm: null,
  }));

  // Load separate sample info if present
  if (info.haveSeparateSampleInfo && info.sampleInfoOffset >= 0) {
    let siOff = info.sampleInfoOffset;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      if (siOff + 6 > len) break;
      samples[i].length    = u16BE(bytes, siOff);
      samples[i].loopStart = u16BE(bytes, siOff + 2);
      samples[i].loopLength = u16BE(bytes, siOff + 4);
      siOff += 6;
    }
  }

  // Load sample data via start offsets table
  const sampleStartOffsetsOffset = info.sampleStartOffsetsOffset;
  const sampleDataOffset = info.sampleDataOffset;

  if (sampleStartOffsetsOffset >= 0 && sampleDataOffset >= 0 &&
      sampleStartOffsetsOffset + (MAX_SAMPLES + 1) * 4 <= len) {
    const startOffsets: number[] = [];
    for (let i = 0; i <= MAX_SAMPLES; i++) {
      startOffsets.push(u32BE(bytes, sampleStartOffsetsOffset + i * 4));
    }

    for (let i = 0; i < MAX_SAMPLES; i++) {
      const chunkLen = startOffsets[i + 1] - startOffsets[i];
      if (chunkLen === 0) {
        samples[i].length = 0;
        samples[i].loopStart = 0;
        samples[i].loopLength = 1;
        continue;
      }

      const dataOff = sampleDataOffset + startOffsets[i];
      if (dataOff >= len) continue;

      let pcmOff = dataOff;
      let pcmLen = chunkLen;

      if (!info.haveSeparateSampleInfo) {
        // Sample header is embedded: length(2) loopStart(2) loopLength(2) = 6 bytes
        if (dataOff + 6 > len) continue;
        samples[i].length    = u16BE(bytes, dataOff);
        samples[i].loopStart = u16BE(bytes, dataOff + 2);
        samples[i].loopLength = u16BE(bytes, dataOff + 4);
        pcmOff += 6;
        pcmLen  = chunkLen - 6;
      }

      if (pcmLen <= 0 || pcmOff + pcmLen > len) continue;

      const pcm = new Int8Array(pcmLen);
      for (let j = 0; j < pcmLen; j++) {
        pcm[j] = s8(bytes[pcmOff + j]);
      }
      samples[i].pcm = pcm;
    }
  }

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;
    const sampleIdx = instr.sampleNumber;

    if (sampleIdx >= 0 && sampleIdx < MAX_SAMPLES) {
      const s = samples[sampleIdx];
      if (s.pcm && s.pcm.length > 0) {
        const pcm = new Uint8Array(s.pcm.buffer);
        const sampleRate = periodToRate(AVP_REF_PERIOD);
        const hasLoop = s.loopLength > 1;
        const loopStart = hasLoop ? s.loopStart : 0;
        const loopEnd   = hasLoop ? s.loopStart + s.loopLength : 0;

        instrumentConfigs.push(
          createSamplerInstrument(id, `Sample ${sampleIdx}`, pcm, instr.volume || 64, sampleRate, loopStart, loopEnd)
        );
        continue;
      }
    }

    instrumentConfigs.push({
      id,
      name: `Instrument ${id}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────
  // Use sub-song 0 (primary). Each position list is decoded into track indices.
  // Each position number references a track in the tracks array.

  const primarySong = songInfoList[0];
  const trackerPatterns: Pattern[] = [];

  // Determine max position count across all 4 channels
  const maxPositions = Math.max(...primarySong.positionLists.map(pl => countPositions(pl)));

  for (let posIdx = 0; posIdx < maxPositions; posIdx++) {
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let ch = 0; ch < 4; ch++) {
      const positionList = primarySong.positionLists[ch];
      const trackNum = getPositionTrackNumber(positionList, posIdx);

      const trackData = (trackNum >= 0 && trackNum < tracks.length) ? tracks[trackNum] : null;
      const rows = decodeAvpTrack(trackData, instruments, info.parseTrackVersion);

      // Pad to 64 rows
      while (rows.length < 64) rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      channelRows[ch] = rows.slice(0, 64);
    }

    trackerPatterns.push({
      id:     `pattern-${posIdx}`,
      name:   `Position ${posIdx}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id:          `channel-${ch}`,
        name:        `Channel ${ch + 1}`,
        muted:       false,
        solo:        false,
        collapsed:   false,
        volume:      100,
        pan:         ([-50, 50, 50, -50] as const)[ch] ?? 0,
        instrumentId: null,
        color:       null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'AVP',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    4,
        originalPatternCount:    tracks.length,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, instruments.length));
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            moduleName,
    format:          'AVP' as TrackerFormat,
    patterns:        trackerPatterns,
    instruments:     instrumentConfigs,
    songPositions:   trackerPatterns.map((_, i) => i),
    songLength:      trackerPatterns.length,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}

// ── Position list helpers ──────────────────────────────────────────────────

/**
 * Load a position list from the buffer. Format:
 *   Each entry: if byte >= 0xfd or (byte & 0x40) == 0: byte + extra_byte
 *               if byte == 0xfe or 0xff: end
 */
function loadPositionList(bytes: Uint8Array, off: number): Uint8Array {
  const result: number[] = [];
  const len = bytes.length;
  let pos = off;

  while (pos < len) {
    const dat = bytes[pos++];
    result.push(dat);

    if (dat >= 0xfd || (dat & 0x40) === 0) {
      if (pos < len) result.push(bytes[pos++]);
    }

    if (dat === 0xfe || dat === 0xff) break;
  }

  return new Uint8Array(result);
}

/** Count the number of track positions in a position list (excluding end marker) */
function countPositions(list: Uint8Array): number {
  let count = 0;
  let i = 0;
  while (i < list.length) {
    const dat = list[i++];
    if (dat === 0xfe || dat === 0xff) break;
    if (dat >= 0xfd || (dat & 0x40) === 0) {
      i++; // skip extra byte
    } else {
      count++;
    }
  }
  return count;
}

/** Get the track number for position posIdx in a position list */
function getPositionTrackNumber(list: Uint8Array, posIdx: number): number {
  let count = 0;
  let i = 0;
  while (i < list.length) {
    const dat = list[i++];
    if (dat === 0xfe || dat === 0xff) return -1;
    if (dat >= 0xfd || (dat & 0x40) === 0) {
      i++; // skip extra byte
    } else {
      if (count === posIdx) return dat;
      count++;
    }
  }
  return -1;
}

// ── Track loading ─────────────────────────────────────────────────────────

/**
 * Load a single track from the buffer, terminated by 0xff.
 * Track encoding varies by parseTrackVersion (1-5):
 *   v1/2: byte; if 0x80 set → extra byte (v2: extra extra byte); then row byte
 *   v3:   byte; while 0x80 set → extra byte, byte; then row byte
 *   v4/5: byte; if not 0x81 and 0x80 set → same multi-byte loop; then row byte
 */
function loadSingleTrack(bytes: Uint8Array, off: number, parseTrackVersion: number): Uint8Array {
  const result: number[] = [];
  const len = bytes.length;
  let pos = off;

  while (pos < len) {
    let dat = bytes[pos++];
    result.push(dat);

    if (dat === 0xff) break;

    if (parseTrackVersion === 3) {
      while ((dat & 0x80) !== 0 && pos < len) {
        result.push(bytes[pos++]);
        if (pos >= len) break;
        dat = bytes[pos++];
        result.push(dat);
      }
    } else if (parseTrackVersion === 4 || parseTrackVersion === 5) {
      if (dat !== 0x81) {
        while ((dat & 0x80) !== 0 && pos < len) {
          result.push(bytes[pos++]);
          if (pos >= len) break;
          dat = bytes[pos++];
          result.push(dat);
        }
      }
    } else {
      if ((dat & 0x80) !== 0 && pos < len) {
        result.push(bytes[pos++]);
        if (parseTrackVersion === 2 && pos < len) {
          result.push(bytes[pos++]);
        }
      }
    }

    if (pos < len) result.push(bytes[pos++]);
  }

  return new Uint8Array(result);
}

// ── Instrument loading ────────────────────────────────────────────────────

function loadInstrument(bytes: Uint8Array, base: number, version: number): AvpInstrument | null {
  if (base + 16 > bytes.length) return null;

  const instr: AvpInstrument = {
    sampleNumber: 0, envelopeNumber: 0, volume: 64, enabledEffectFlags: 0,
    portamentoAdd: 0, fineTune: 0, stopResetEffectDelay: 0, sampleNumber2: 0,
    sampleStartOffset: 0, arpeggioTable: [0, 0, 0, 0],
    fixedOrTransposedNote: 0, transpose: 0, vibratoNumber: 0, vibratoDelay: 0,
  };

  if (version === 1) {
    instr.sampleNumber        = bytes[base];
    instr.envelopeNumber      = bytes[base + 1];
    instr.enabledEffectFlags  = bytes[base + 2];
    // base+3 = padding
    instr.portamentoAdd       = bytes[base + 4];
    // base+5, base+6 = padding
    instr.stopResetEffectDelay = bytes[base + 7];
    instr.sampleNumber2       = bytes[base + 8];
    for (let j = 0; j < 4; j++) instr.arpeggioTable[j] = s8(bytes[base + 9 + j]);
    instr.fixedOrTransposedNote = bytes[base + 13];
    instr.vibratoNumber       = bytes[base + 14];
    instr.vibratoDelay        = bytes[base + 15];
  } else if (version === 2) {
    instr.sampleNumber        = bytes[base];
    instr.volume              = bytes[base + 1];
    instr.enabledEffectFlags  = bytes[base + 2];
    // base+3 = padding
    instr.portamentoAdd       = bytes[base + 4];
    // base+5, base+6 = padding
    instr.stopResetEffectDelay = bytes[base + 7];
    instr.sampleNumber2       = bytes[base + 8];
    for (let j = 0; j < 4; j++) instr.arpeggioTable[j] = s8(bytes[base + 9 + j]);
    instr.fixedOrTransposedNote = bytes[base + 13];
    instr.vibratoNumber       = bytes[base + 14];
    instr.vibratoDelay        = bytes[base + 15];
  } else if (version === 3) {
    instr.sampleNumber        = bytes[base];
    instr.volume              = bytes[base + 1];
    instr.enabledEffectFlags  = bytes[base + 2];
    instr.transpose           = s8(bytes[base + 3]);
    instr.fineTune            = s16BE(bytes, base + 4);
    instr.sampleStartOffset   = u16BE(bytes, base + 6);
    instr.stopResetEffectDelay = bytes[base + 8];
    for (let j = 0; j < 4; j++) instr.arpeggioTable[j] = s8(bytes[base + 9 + j]);
    instr.fixedOrTransposedNote = bytes[base + 13];
    instr.vibratoNumber       = bytes[base + 14];
    instr.vibratoDelay        = bytes[base + 15];
  }

  return instr;
}

// ── Track decoding ────────────────────────────────────────────────────────

/**
 * Decode a raw AVP track byte stream into TrackerCell rows.
 *
 * Track format varies by parseTrackVersion. The key point is that each
 * "event" in the track consists of: an encoded byte (note/flags) followed
 * by a row-data byte. We extract note index and instrument number.
 *
 * Due to the highly version-specific encoding we perform a simple extraction:
 * collect all row-data bytes (the second byte of each event pair) and map them.
 */
function decodeAvpTrack(
  data: Uint8Array | null,
  instruments: AvpInstrument[],
  parseTrackVersion: number,
): TrackerCell[] {
  const rows: TrackerCell[] = [];
  if (!data) return rows;

  const len = data.length;
  let pos = 0;

  while (pos < len && rows.length < 64) {
    if (pos >= len) break;
    let dat = data[pos++];

    if (dat === 0xff) break;

    let noteByte = 0;

    if (parseTrackVersion === 3) {
      // Multi-byte note encoding: while high bit set, it's extended data
      // The last byte with high bit clear is the row note byte
      while ((dat & 0x80) !== 0 && pos < len) {
        // extended byte — skip
        pos++; // skip paired byte
        if (pos >= len) break;
        dat = data[pos++];
      }
      noteByte = dat;
    } else if (parseTrackVersion === 4 || parseTrackVersion === 5) {
      if (dat === 0x81) {
        // Special: rest / no note
        noteByte = 0;
      } else {
        while ((dat & 0x80) !== 0 && pos < len) {
          pos++;
          if (pos >= len) break;
          dat = data[pos++];
        }
        noteByte = dat;
      }
    } else {
      // v1/v2: if high bit → skip 1 (v2: skip 2) extra bytes
      if ((dat & 0x80) !== 0) {
        pos++; // skip extra byte
        if (parseTrackVersion === 2 && pos < len) pos++;
      }
      // Next byte is the row note byte
      noteByte = pos < len ? data[pos++] : 0;
    }

    // noteByte encoding: bits 6..0 = note index, or special flags
    // High bit of noteByte can encode instrument / other info.
    // For simplicity we extract note from bits 5..0 (6-bit note field is common in Amiga trackers).
    const noteIdx = noteByte & 0x3f;
    const instrBit = (noteByte >> 6) & 0x01;

    let xmNote = 0;
    let instrId = 0;

    if (noteIdx > 0 && noteIdx < AVP_PERIODS.length) {
      xmNote = avpNoteToXM(noteIdx);
    }

    // Instrument index from the tracking — simple heuristic
    if (instrBit && instruments.length > 0) {
      instrId = 1; // We don't have full instrument encoding here; use 1 as fallback
    }

    rows.push({ note: xmNote, instrument: instrId, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  }

  return rows;
}

// ── Helper ─────────────────────────────────────────────────────────────────

function makeEmptyPattern(filename: string, numInstr: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id:          `channel-${ch}`,
      name:        `Channel ${ch + 1}`,
      muted:       false,
      solo:        false,
      collapsed:   false,
      volume:      100,
      pan:         ([-50, 50, 50, -50] as const)[ch] ?? 0,
      instrumentId: null,
      color:       null,
      rows: Array.from({ length: 64 }, () => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
    importMetadata: {
      sourceFormat: 'AVP',
      sourceFile:   filename,
      importedAt:   new Date().toISOString(),
      originalChannelCount:    4,
      originalPatternCount:    0,
      originalInstrumentCount: numInstr,
    },
  };
}
