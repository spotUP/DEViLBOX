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
import type { Pattern, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import { decodeActivisionProModule } from './ActivisionProModule';
import { walkActivisionPro, avpPatternCells, AVP_ROWS_PER_PATTERN } from './activisionProGrid';

// ── Constants ─────────────────────────────────────────────────────────────

const PAL_CLOCK = 3546895;
const MAX_SAMPLES = 27;

// Reference: period 424 = ProTracker C-2 ≈ XM note 37 (C-3). Index of 424 in table = 60.
const AVP_REF_PERIOD = 424;

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

export interface AvpPlayerInfo {
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

// ── Heuristic player info extraction ──────────────────────────────────────

/**
 * Scan the first 4096 bytes for the M68k init pattern and extract all
 * necessary offsets. Returns null if the format is not recognised.
 * Faithfully mirrors NostalgicPlayer's TestModule → FindStartOffset →
 * ExtractInfoFromInitFunction → ExtractInfoFromPlayFunction chain.
 */
export function extractPlayerInfo(bytes: Uint8Array): AvpPlayerInfo | null {
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

  // The song as the replayer walks it (activisionProGrid.ts), from the module model.
  const module = decodeActivisionProModule(bytes);
  if (!module) return null;
  const walk = walkActivisionPro(module, 0);

  // ── Instruments ────────────────────────────────────────────────────────
  const instrumentsOffset = info.instrumentsOffset;

  if (instrumentsOffset < 0) return null;

  // Find the next section after instruments to determine table size.
  // Section order varies by format version — use the nearest section boundary.
  const instrEndCandidates = [
    info.trackOffsetsOffset,
    info.tracksOffset,
    info.subSongListOffset,
    info.sampleStartOffsetsOffset,
  ].filter(off => off > instrumentsOffset);
  const instrEnd = instrEndCandidates.length > 0 ? Math.min(...instrEndCandidates) : len;
  const numberOfInstruments = Math.floor((instrEnd - instrumentsOffset) / 16);
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
      synthType: 'ActivisionProWasmSynth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────
  // Sub-song 0; one grid row per replayer step, 64-row patterns.
  const cells = avpPatternCells(walk);
  const trackerPatterns: Pattern[] = cells.map((voices, posIdx) => ({
    id:     `pattern-${posIdx}`,
    name:   `Steps ${posIdx * AVP_ROWS_PER_PATTERN}`,
    length: voices[0].length,
    channels: voices.map((rows, ch) => ({
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
      originalPatternCount:    module.tracks.length,
      originalInstrumentCount: instruments.length,
    },
  }));

  const moduleName = filename.replace(/\.[^/.]+$/, '');
  const copy = (): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

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
    activisionProFileData: copy(),
  };
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

