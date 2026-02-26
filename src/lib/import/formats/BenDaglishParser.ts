/**
 * BenDaglishParser.ts — Ben Daglish native parser
 *
 * Ben Daglish is a 4-channel Amiga synth-music format used for Commodore 64
 * and Amiga game music. The format is a self-contained player + data binary
 * with no magic bytes — it is identified by scanning for characteristic
 * Motorola 68000 assembler sequences in the player code.
 *
 * The player uses a table-driven architecture with:
 *   - Sub-songs (multiple tunes in one file, each with 4 per-channel position lists)
 *   - Position lists: sequences of track indices with position commands
 *   - Tracks: sequences of note+tick events and effect commands
 *   - Samples: PCM data with volume/finetune/vibrato/portamento parameters
 *
 * Reference: NostalgicPlayer BenDaglishWorker.cs (authoritative loader/replayer)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/Ben Daglish/
 *
 * Identification (from BenDaglishWorker.cs TestModule):
 *   1. File length >= 0x1600
 *   2. bytes[0]==0x60 && bytes[1]==0x00 && bytes[4]==0x60 && bytes[5]==0x00
 *      && bytes[10]==0x60 && bytes[11]==0x00
 *      (Three BRA.W instructions at the start of the player's jump table)
 *   3. startOfInit = (sbyte(bytes[2])<<8 | bytes[3]) + 2
 *      Check characteristic opcodes in init function
 *   4. startOfPlay = (sbyte(bytes[6])<<8 | bytes[7]) + 4 + 2
 *      Check characteristic opcodes in play function
 *   5. Extract offsets: subSongListOffset, trackOffsetTableOffset, tracksOffset,
 *      sampleInfoOffsetTableOffset from opcodes via relative addressing
 *   6. Determine features: EnableCounter, EnablePortamento, EnableVolumeFade,
 *      MaxTrackValue, EnableC0TrackLoop, EnableF0TrackLoop, SetSampleMappingVersion,
 *      various other feature flags
 *
 * File structure (all offsets are relative to file start = 0):
 *   Player code (M68k executable binary)
 *   ├── Jump table at offset 0 with BRA.W instructions
 *   └── Init/play functions referenced by the jump table
 *   Data (interspersed within player binary):
 *   ├── Sub-song list: N × [4 × uint16 BE] position-list-offsets
 *   ├── Position lists: variable-length byte sequences (0xFF-terminated)
 *   ├── Track offset table: N × uint16 BE
 *   ├── Tracks: variable-length byte sequences (0xFF-terminated)
 *   ├── Sample info offset table: N × uint32 BE
 *   └── Sample info + PCM data
 *
 * Sample info layout (per entry, relative to sampleInfoOffsetTableOffset):
 *   sampleDataOffset(4 BE) + loopOffset(4 BE) + length(2 BE) + loopLength(2 BE)
 *   + volume(2 BE) + volumeFadeSpeed(2 BE signed) + portamentoDuration(2 BE signed)
 *   + portamentoAddValue(2 BE signed) + vibratoDepth(2 BE) + vibratoAddValue(2 BE)
 *   + noteTranspose(2 BE signed) + fineTunePeriod(2 BE)
 *
 * FineTune formula (from NostalgicPlayer Samples getter):
 *   period = ((Tables.FineTune[j] & 0xffff) * sample.FineTunePeriod) >> 16)
 *          + ((Tables.FineTune[j] >> 16) * sample.FineTunePeriod)
 *   This is a 32-bit fixed-point multiply to adjust the base period.
 *   For our purposes we use the standard Amiga period table and treat
 *   FineTunePeriod as a scale factor: if it equals 0x10000 (65536) the
 *   sample is tuned to standard Amiga pitch.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────

/** PAL Amiga clock frequency */
const PAL_CLOCK = 3546895;

/** Minimum file size for a Ben Daglish module */
const BD_MIN_SIZE = 0x1600;


// ── Utility ────────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

// ── Features detection ─────────────────────────────────────────────────────

interface BDFeatures {
  enableCounter: boolean;
  enablePortamento: boolean;
  enableVolumeFade: boolean;
  maxTrackValue: number;
  enableC0TrackLoop: boolean;
  enableF0TrackLoop: boolean;
  setSampleMappingVersion: number;
  getSampleMappingVersion: number;
  maxSampleMappingValue: number;
  uses9xTrackEffects: boolean;
  usesCxTrackEffects: boolean;
  checkForTicks: boolean;
  extraTickArg: boolean;
  enableSampleEffects: boolean;
  enableFinalVolumeSlide: boolean;
  setDmaInSampleHandlers: boolean;
  masterVolumeFadeVersion: number;
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Ben Daglish identification state extracted during detection.
 * If isBenDaglishFormat() returns true, these offsets are valid.
 */
interface BDIdent {
  subSongListOffset: number;
  trackOffsetTableOffset: number;
  tracksOffset: number;
  sampleInfoOffsetTableOffset: number;
  features: BDFeatures;
}

/**
 * Returns true if `bytes` appears to be a Ben Daglish module.
 * Also extracts the internal offsets needed for loading.
 * Returns null if not identified.
 */
function testBenDaglishModule(bytes: Uint8Array): BDIdent | null {
  if (bytes.length < BD_MIN_SIZE) return null;

  // Read into a buffer limited to 0x3000 bytes (matching NostalgicPlayer)
  const bufLen = Math.min(bytes.length, 0x3000);

  // Check jump table BRA.W instructions
  if (bytes[0] !== 0x60 || bytes[1] !== 0x00) return null;
  if (bytes[4] !== 0x60 || bytes[5] !== 0x00) return null;
  if (bytes[10] !== 0x60 || bytes[11] !== 0x00) return null;

  // Find startOfInit from first BRA.W
  const startOfInit = (s8(bytes[2]) << 8 | bytes[3]) + 2;
  if (startOfInit >= bufLen - 14) return null;

  // Validate init function opcodes
  if (bytes[startOfInit] !== 0x3f || bytes[startOfInit + 1] !== 0x00 ||
      bytes[startOfInit + 2] !== 0x61 || bytes[startOfInit + 3] !== 0x00 ||
      bytes[startOfInit + 6] !== 0x3d || bytes[startOfInit + 7] !== 0x7c ||
      bytes[startOfInit + 12] !== 0x41 || bytes[startOfInit + 13] !== 0xfa) {
    return null;
  }

  // Find startOfPlay from second BRA.W (at offset 4)
  const startOfPlay = (s8(bytes[6]) << 8 | bytes[7]) + 4 + 2;
  if (startOfPlay >= bufLen) return null;

  // Extract subSongListOffset from init function
  let idx = startOfInit;
  let subSongListOffset = -1;
  let sampleInfoOffsetTableOffset = -1;

  // Find 0x41FA + next word (LEA rel,A0) followed by 0x2208 (MOVE.L (A0),D1)
  for (idx = startOfInit; idx < bufLen - 6; idx += 2) {
    if (bytes[idx] === 0x41 && bytes[idx + 1] === 0xfa &&
        bytes[idx + 4] === 0x22 && bytes[idx + 5] === 0x08) {
      subSongListOffset = (s8(bytes[idx + 2]) << 8 | bytes[idx + 3]) + idx + 2;
      idx += 4;
      break;
    }
  }
  if (subSongListOffset < 0 || subSongListOffset >= bytes.length) return null;

  // Find 0x41FA followed by 0x2348 (MOVE.L D1,(A1)) for sampleInfoOffsetTableOffset
  for (; idx < bufLen - 6; idx += 2) {
    if (bytes[idx] === 0x41 && bytes[idx + 1] === 0xfa &&
        bytes[idx + 4] === 0x23 && bytes[idx + 5] === 0x48) {
      sampleInfoOffsetTableOffset = (s8(bytes[idx + 2]) << 8 | bytes[idx + 3]) + idx + 2;
      break;
    }
  }
  if (sampleInfoOffsetTableOffset < 0 || sampleInfoOffsetTableOffset >= bytes.length) return null;

  // Extract trackOffsetTableOffset and tracksOffset from play function
  let trackOffsetTableOffset = -1;
  let tracksOffset = -1;

  // Find 0x47FA followed by (0x4880 or 0xD040) for trackOffsetTableOffset
  for (idx = startOfPlay; idx < bufLen - 6; idx += 2) {
    if (bytes[idx] === 0x47 && bytes[idx + 1] === 0xfa &&
        ((bytes[idx + 4] === 0x48 && bytes[idx + 5] === 0x80) ||
         (bytes[idx + 4] === 0xd0 && bytes[idx + 5] === 0x40))) {
      trackOffsetTableOffset = (s8(bytes[idx + 2]) << 8 | bytes[idx + 3]) + idx + 2;
      idx += 4;
      break;
    }
  }
  if (trackOffsetTableOffset < 0 || trackOffsetTableOffset >= bytes.length) return null;

  // Find 0x47FA followed by 0xD6C0 for tracksOffset
  for (; idx < bufLen - 6; idx += 2) {
    if (bytes[idx] === 0x47 && bytes[idx + 1] === 0xfa &&
        bytes[idx + 4] === 0xd6 && bytes[idx + 5] === 0xc0) {
      tracksOffset = (s8(bytes[idx + 2]) << 8 | bytes[idx + 3]) + idx + 2;
      break;
    }
  }
  if (tracksOffset < 0 || tracksOffset >= bytes.length) return null;

  // Detect features
  const features = detectFeatures(bytes, bufLen, startOfPlay);
  if (!features) return null;

  return {
    subSongListOffset,
    trackOffsetTableOffset,
    tracksOffset,
    sampleInfoOffsetTableOffset,
    features,
  };
}

/**
 * Detect player features from the play function machine code.
 * Translated faithfully from NostalgicPlayer FindFeatures* methods.
 */
function detectFeatures(bytes: Uint8Array, bufLen: number, startOfPlay: number): BDFeatures | null {
  const features: BDFeatures = {
    enableCounter: false,
    enablePortamento: false,
    enableVolumeFade: false,
    maxTrackValue: 0x80,
    enableC0TrackLoop: false,
    enableF0TrackLoop: false,
    setSampleMappingVersion: 0,
    getSampleMappingVersion: 0,
    maxSampleMappingValue: 0,
    uses9xTrackEffects: false,
    usesCxTrackEffects: false,
    checkForTicks: false,
    extraTickArg: false,
    enableSampleEffects: false,
    enableFinalVolumeSlide: false,
    setDmaInSampleHandlers: true,
    masterVolumeFadeVersion: -1,
  };

  if (!findFeaturesInPlayMethod(bytes, bufLen, startOfPlay, features)) return null;
  if (!findFeaturesInHandleEffectsMethod(bytes, bufLen, startOfPlay, features)) return null;
  if (!findFeaturesInParseTrackMethod(bytes, bufLen, startOfPlay, features)) return null;

  return features;
}

function findFeaturesInPlayMethod(
  buf: Uint8Array, bufLen: number, startOfPlay: number,
  features: BDFeatures
): boolean {
  // Check for counter feature (bytes at startOfPlay+4..15)
  if (startOfPlay + 16 > bufLen) return false;

  if (buf[startOfPlay + 4] === 0x10 && buf[startOfPlay + 5] === 0x3a &&
      buf[startOfPlay + 8] === 0x67 && buf[startOfPlay + 14] === 0x53 &&
      buf[startOfPlay + 15] === 0x50) {
    const counterIdx = (s8(buf[startOfPlay + 6]) << 8 | buf[startOfPlay + 7]) + startOfPlay + 6;
    if (counterIdx >= bufLen) return false;
    features.enableCounter = buf[counterIdx] !== 0;
  }

  // Find effect method calls (look for 0x532C = SUBQ.W #1,(A4))
  let idx: number;
  for (idx = startOfPlay; idx < bufLen - 2; idx += 2) {
    if (buf[idx] === 0x53 && buf[idx + 1] === 0x2c) break;
  }
  if (idx >= bufLen - 2) return false;

  for (; idx >= startOfPlay; idx -= 2) {
    if (buf[idx] === 0x49 && buf[idx + 1] === 0xfa) break;

    if (buf[idx] === 0x61 && buf[idx + 1] === 0x00) {
      const methodIdx = (s8(buf[idx + 2]) << 8 | buf[idx + 3]) + idx + 2;
      if (methodIdx >= bufLen - 14) return false;

      if (buf[methodIdx] === 0x4a && buf[methodIdx + 1] === 0x2c &&
          buf[methodIdx + 4] === 0x67 && buf[methodIdx + 6] === 0x6a &&
          buf[methodIdx + 8] === 0x30 && buf[methodIdx + 9] === 0x29) {
        features.enablePortamento = true;
      } else if (buf[methodIdx] === 0x4a && buf[methodIdx + 1] === 0x2c &&
                 buf[methodIdx + 4] === 0x67 && buf[methodIdx + 6] === 0x4a &&
                 buf[methodIdx + 7] === 0x2c && buf[methodIdx + 10] === 0x67) {
        features.enableVolumeFade = true;
      } else {
        return false;
      }
    }
  }

  // Find MaxTrackValue and loop enable flags
  features.maxTrackValue = 0x80;
  for (idx = startOfPlay; idx < bufLen - 6; idx += 2) {
    if (buf[idx] === 0x10 && buf[idx + 1] === 0x1b) break;
  }
  if (idx >= bufLen - 6) return false;

  if ((buf[idx + 2] === 0xb0 && buf[idx + 3] === 0x3c) ||
      (buf[idx + 2] === 0x0c && buf[idx + 3] === 0x00)) {
    features.maxTrackValue = buf[idx + 5];
  }

  for (idx += 4; idx < bufLen - 6; idx += 2) {
    if (((buf[idx] === 0xb0 && buf[idx + 1] === 0x3c) ||
         (buf[idx] === 0x0c && buf[idx + 1] === 0x00)) &&
        buf[idx + 4] === 0x6c) {
      break;
    }
  }
  if (idx >= bufLen - 6) return false;

  const effectVal = (buf[idx + 2] << 8) | buf[idx + 3];
  features.enableC0TrackLoop = effectVal === 0x00c0;
  features.enableF0TrackLoop = effectVal === 0x00f0;

  idx = buf[idx + 5] + idx + 6;
  if (buf[idx] === 0x02 && buf[idx + 1] === 0x40) {
    features.setSampleMappingVersion = 1;
  } else if (buf[idx] === 0x04 && buf[idx + 1] === 0x00) {
    features.setSampleMappingVersion = 2;
  } else {
    return false;
  }

  return true;
}

function findFeaturesInHandleEffectsMethod(
  buf: Uint8Array, bufLen: number, startOfPlay: number,
  features: BDFeatures
): boolean {
  if (buf[startOfPlay] !== 0x61 || buf[startOfPlay + 1] !== 0x00) return false;

  const startOfHandleEffects = (s8(buf[startOfPlay + 2]) << 8 | buf[startOfPlay + 3]) + startOfPlay + 2;

  // Find 0x4E90 (JSR (A0)) — callback
  let idx: number;
  for (idx = startOfHandleEffects; idx < bufLen - 2; idx += 2) {
    if (buf[idx] === 0x4e && buf[idx + 1] === 0x90) break;
  }
  if (idx >= bufLen - 2) return false;
  const callBackIndex = idx;

  // Scan back for method calls
  for (; idx >= startOfHandleEffects; idx -= 2) {
    if (buf[idx] === 0x4e && buf[idx + 1] === 0x75) break;

    if (buf[idx] === 0x61 && buf[idx + 1] === 0x00) {
      const methodIdx = (s8(buf[idx + 2]) << 8 | buf[idx + 3]) + idx + 2;
      if (methodIdx >= bufLen - 14) return false;

      if (buf[methodIdx] === 0x30 && buf[methodIdx + 1] === 0x2b &&
          buf[methodIdx + 4] === 0x67 &&
          ((buf[methodIdx + 6] === 0xb0 && buf[methodIdx + 7] === 0x7c) ||
           (buf[methodIdx + 6] === 0x0c && buf[methodIdx + 7] === 0x40)) &&
          buf[methodIdx + 8] === 0xff && buf[methodIdx + 9] === 0xff) {
        features.enableSampleEffects = true;
      } else if (buf[methodIdx] === 0x30 && buf[methodIdx + 1] === 0x2b &&
                 buf[methodIdx + 4] === 0x67 && buf[methodIdx + 6] === 0x53 &&
                 buf[methodIdx + 7] === 0x6b) {
        features.enableFinalVolumeSlide = true;
      } else {
        return false;
      }
    }
  }

  // Check callback branch
  if (buf[callBackIndex + 6] !== 0x6e && buf[callBackIndex + 6] !== 0x66) return false;

  let afterCallback = buf[callBackIndex + 7] + callBackIndex + 8;
  if (afterCallback >= bufLen - 6) return false;

  // Check for DMA flag
  features.setDmaInSampleHandlers = true;
  for (; afterCallback < bufLen; afterCallback++) {
    if (buf[afterCallback] === 0x4e && buf[afterCallback + 1] === 0x75) break;
  }
  if (afterCallback >= bufLen) return false;
  if (buf[afterCallback - 2] === 0x00 && buf[afterCallback - 1] === 0x96) {
    features.setDmaInSampleHandlers = false;
  }

  // Check for master volume fade
  if (buf[startOfHandleEffects] === 0x61 && buf[startOfHandleEffects + 1] === 0x00) {
    const masterIdx = (s8(buf[startOfHandleEffects + 2]) << 8 | buf[startOfHandleEffects + 3]) + startOfHandleEffects + 2;
    if (masterIdx >= bufLen - 24) return false;

    features.masterVolumeFadeVersion = -1;
    if (buf[masterIdx] === 0x30 && buf[masterIdx + 1] === 0x3a && buf[masterIdx + 4] === 0x67 &&
        buf[masterIdx + 5] === 0x00 && buf[masterIdx + 8] === 0x41 && buf[masterIdx + 9] === 0xfa &&
        buf[masterIdx + 18] === 0x30 && buf[masterIdx + 19] === 0x80) {
      features.masterVolumeFadeVersion = 1;
    } else if (buf[masterIdx] === 0x30 && buf[masterIdx + 1] === 0x39 && buf[masterIdx + 6] === 0x67 &&
               buf[masterIdx + 7] === 0x00 && buf[masterIdx + 10] === 0x41 && buf[masterIdx + 11] === 0xf9 &&
               buf[masterIdx + 22] === 0x30 && buf[masterIdx + 23] === 0x80) {
      features.masterVolumeFadeVersion = 1;
    } else if (buf[masterIdx] === 0x10 && buf[masterIdx + 1] === 0x3a && buf[masterIdx + 4] === 0x67 &&
               buf[masterIdx + 5] === 0x00 && buf[masterIdx + 8] === 0x41 && buf[masterIdx + 9] === 0xfa &&
               buf[masterIdx + 18] === 0x53 && buf[masterIdx + 19] === 0x00) {
      features.masterVolumeFadeVersion = 2;
    } else {
      return false;
    }
  }

  return true;
}

function findFeaturesInParseTrackMethod(
  buf: Uint8Array, bufLen: number, startOfPlay: number,
  features: BDFeatures
): boolean {
  // Find jump to parse-track function (first BRA.W in play method)
  let idx: number;
  for (idx = startOfPlay; idx < bufLen - 4; idx += 2) {
    if (buf[idx] === 0x60 && buf[idx + 1] === 0x00) break;
  }
  if (idx >= bufLen - 4) return false;

  idx = (s8(buf[idx + 2]) << 8 | buf[idx + 3]) + idx + 2;
  if (idx >= bufLen) return false;

  const startOfParseTrack = idx;

  // Find TST.L (A4) followed by branch for CheckForTicks
  for (; idx < bufLen - 8; idx += 2) {
    if (buf[idx] === 0x4a && buf[idx + 1] === 0x2c && buf[idx + 4] === 0x67) break;
  }
  if (idx >= bufLen - 8) return false;
  features.checkForTicks = buf[idx + 6] === 0x4a && buf[idx + 7] === 0x2c;

  // Find ExtraTickArg: after MOVEQ #0,Dn + MOVE.B (A3)+,Dn
  for (idx += 8; idx < bufLen - 6; idx += 2) {
    if (buf[idx] === 0x72 && buf[idx + 1] === 0x00 &&
        buf[idx + 2] === 0x12 && buf[idx + 3] === 0x1b) {
      break;
    }
  }
  if (idx >= bufLen - 6) return false;
  features.extraTickArg = buf[idx + 4] === 0x66;

  // Find the track-effect parsing function (first BSR.W from ParseTrack)
  for (idx = startOfParseTrack; idx < bufLen - 4; idx += 2) {
    if (buf[idx] === 0x61 && buf[idx + 1] === 0x00) break;
  }
  if (idx >= bufLen - 4) return false;
  idx = (s8(buf[idx + 2]) << 8 | buf[idx + 3]) + idx + 2;
  if (idx >= bufLen) return false;

  return findFeaturesInParseTrackEffectMethod(buf, bufLen, idx, features);
}

function findFeaturesInParseTrackEffectMethod(
  buf: Uint8Array, bufLen: number, startOfMethod: number,
  features: BDFeatures
): boolean {
  if ((buf[startOfMethod + 2] !== 0xb0 || buf[startOfMethod + 3] !== 0x3c) &&
      (buf[startOfMethod + 2] !== 0x0c || buf[startOfMethod + 3] !== 0x00)) {
    return false;
  }

  features.maxSampleMappingValue = buf[startOfMethod + 5];
  let idx = startOfMethod + 8;
  if (idx >= bufLen - 4) return false;

  if (buf[idx] !== 0x02 || buf[idx + 1] !== 0x40 || buf[idx + 2] !== 0x00) return false;

  if (buf[idx + 3] === 0x07) {
    features.getSampleMappingVersion = 1;
  } else if (buf[idx + 3] === 0xff) {
    features.getSampleMappingVersion = 2;
  } else {
    return true;  // no further feature scanning needed
  }

  for (idx += 4; idx < bufLen - 6; idx += 2) {
    if (((buf[idx] === 0xb0 && buf[idx + 1] === 0x3c) ||
         (buf[idx] === 0x0c && buf[idx + 1] === 0x00)) &&
        buf[idx + 4] === 0x6c) {
      break;
    }
  }
  if (idx >= bufLen - 6) return false;

  features.uses9xTrackEffects = (buf[idx + 3] & 0xf0) === 0x90;
  features.usesCxTrackEffects = (buf[idx + 3] & 0xf0) === 0xc0;

  return true;
}

// ── Public identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` appears to be a Ben Daglish module.
 */
export function isBenDaglishFormat(bytes: Uint8Array): boolean {
  return testBenDaglishModule(bytes) !== null;
}

// ── Position list loading ──────────────────────────────────────────────────

function findPositionCommandArgumentCount(cmd: number, features: BDFeatures): number {
  if (cmd < features.maxTrackValue) return 0;

  if (features.enableC0TrackLoop) {
    if (cmd < 0xa0) return 0;
    if (cmd < 0xc8) return 1;
  }

  if (features.enableF0TrackLoop) {
    if (cmd < 0xf0) return 0;
    if (cmd < 0xf8) return 1;
  }

  if (cmd === 0xfd && features.masterVolumeFadeVersion > 0) return 1;
  if (cmd === 0xfe) return 1;
  if (cmd === 0xff) return 0; // end marker handled separately

  return -1;
}

function loadPositionList(bytes: Uint8Array, start: number, features: BDFeatures): number[] | null {
  const result: number[] = [];
  let pos = start;

  while (pos < bytes.length) {
    const cmd = bytes[pos++];
    result.push(cmd);

    if (cmd === 0xff) break; // end of position list

    const argCount = findPositionCommandArgumentCount(cmd, features);
    if (argCount < 0) return null;

    for (let a = 0; a < argCount; a++) {
      if (pos >= bytes.length) return null;
      result.push(bytes[pos++]);
    }
  }

  return result;
}

// ── Track loading ──────────────────────────────────────────────────────────

function findTrackCommandArgumentCount(cmd: number, nextByte: number, features: BDFeatures): number {
  if (cmd < 0x7f) {
    if (features.extraTickArg && nextByte === 0) return 2;
    return 1;
  }

  if (cmd === 0x7f) return 1;

  if (cmd <= features.maxSampleMappingValue) return 0;

  if ((features.usesCxTrackEffects && cmd < 0xc0) ||
      (features.uses9xTrackEffects && cmd < 0x9b)) {
    return 0;
  }

  if (features.usesCxTrackEffects) {
    switch (cmd) {
      case 0xc0: return features.enablePortamento ? 3 : -1;
      case 0xc1: return features.enablePortamento ? 0 : -1;
      case 0xc2: return features.enableVolumeFade ? 3 : -1;
      case 0xc3: return features.enableVolumeFade ? 0 : -1;
      case 0xc4: return features.enablePortamento ? 1 : -1;
      case 0xc5: return features.enablePortamento ? 0 : -1;
      case 0xc6: return features.enableVolumeFade ? (features.enableFinalVolumeSlide ? 3 : 1) : -1;
      case 0xc7: return features.enableFinalVolumeSlide ? 0 : -1;
    }
  }

  if (features.uses9xTrackEffects) {
    switch (cmd) {
      case 0x9b: return features.enablePortamento ? 3 : -1;
      case 0x9c: return features.enablePortamento ? 0 : -1;
      case 0x9d: return features.enableVolumeFade ? 3 : -1;
      case 0x9e: return features.enableVolumeFade ? 0 : -1;
      case 0x9f: return features.enablePortamento ? 1 : -1;
      case 0xa0: return features.enablePortamento ? 0 : -1;
      case 0xa1: return features.enableVolumeFade ? (features.enableFinalVolumeSlide ? 3 : 1) : -1;
      case 0xa2: return features.enableFinalVolumeSlide ? 0 : -1;
    }
  }

  return -1;
}

function loadTrack(bytes: Uint8Array, start: number, features: BDFeatures): number[] | null {
  const result: number[] = [];
  let pos = start;

  while (pos < bytes.length) {
    const cmd = bytes[pos++];
    result.push(cmd);

    if (cmd === 0xff) break; // end of track

    if (pos >= bytes.length) return null;
    const nextByte = bytes[pos];

    const argCount = findTrackCommandArgumentCount(cmd, nextByte, features);
    if (argCount < 0) return null;

    if (argCount > 0) {
      result.push(bytes[pos++]); // push the already-peeked nextByte
      for (let a = 1; a < argCount; a++) {
        if (pos >= bytes.length) return null;
        result.push(bytes[pos++]);
      }
    }
    // if argCount === 0, don't consume nextByte (it stays for the next iteration)
  }

  return result;
}

// ── Position list interpretation ───────────────────────────────────────────

/**
 * Walk a position list once (no looping) and collect (trackIndex, transpose) pairs.
 * Returns null if the position list is malformed.
 */
function walkPositionList(
  positionList: number[],
  features: BDFeatures
): Array<{ trackIndex: number; transpose: number }> {
  const result: Array<{ trackIndex: number; transpose: number }> = [];
  let pos = 0;
  let transpose = 0;

  while (pos < positionList.length) {
    const cmd = positionList[pos++];

    if (cmd === 0xff) break; // end

    if (cmd < features.maxTrackValue) {
      result.push({ trackIndex: cmd, transpose });
      continue;
    }

    // Position commands
    if (cmd === 0xfe) {
      transpose = s8(positionList[pos++] ?? 0);
      continue;
    }

    if (cmd === 0xfd && features.masterVolumeFadeVersion > 0) {
      pos++; // skip master volume fade speed arg
      continue;
    }

    if (features.enableF0TrackLoop) {
      if (cmd >= 0xf0 && cmd < 0xf8) {
        pos++; // skip loop count arg
        continue;
      }
    }

    if (features.enableC0TrackLoop) {
      if (cmd >= 0xa0 && cmd < 0xc8) {
        pos++; // skip loop count arg
        continue;
      }
    }

    // Sample mapping set commands — skip the argument
    if (cmd >= features.maxTrackValue) {
      pos++; // skip the sample index arg
      continue;
    }
  }

  return result;
}

// ── Sample info loading ────────────────────────────────────────────────────

interface BDSample {
  sampleData: Int8Array;
  length: number;     // in words (length in bytes = length × 2)
  loopOffset: number; // in bytes, relative to sample start
  loopLength: number; // in words (loop length in bytes = loopLength × 2)
  volume: number;     // 0–64 range (stored as 0–0x40)
  fineTunePeriod: number; // 16-bit, used for period calculation
  noteTranspose: number;  // signed semitone offset
}

function loadSamples(
  bytes: Uint8Array,
  sampleInfoOffsetTableOffset: number
): BDSample[] | null {
  // Read offset table (N × uint32 BE until minimum offset found)
  const offsetTable: number[] = [];
  let firstOffset = 0xffffffff;
  let pos = sampleInfoOffsetTableOffset;

  while (pos + 4 <= bytes.length) {
    const offset = u32BE(bytes, pos);
    pos += 4;

    firstOffset = Math.min(firstOffset >>> 0, offset >>> 0);
    offsetTable.push(offset);

    if (pos >= sampleInfoOffsetTableOffset + (firstOffset >>> 0)) break;
    if (offsetTable.length > 256) break; // safety
  }

  if (offsetTable.length === 0) return null;

  const samples: BDSample[] = [];
  const sampleDataOffsets: number[] = [];

  // Read sample info structures
  for (let i = 0; i < offsetTable.length; i++) {
    const infoBase = sampleInfoOffsetTableOffset + offsetTable[i];
    if (infoBase + 22 > bytes.length) return null;

    const sampleDataOffset = u32BE(bytes, infoBase);
    let loopOffset         = u32BE(bytes, infoBase + 4);
    if (loopOffset > 0) {
      loopOffset = (loopOffset - sampleDataOffset) >>> 0;
    }
    const length          = u16BE(bytes, infoBase + 8);
    const loopLength      = u16BE(bytes, infoBase + 10);
    const volume          = u16BE(bytes, infoBase + 12);
    // volumeFadeSpeed    = s16BE(bytes, infoBase + 14);
    // portamentoDuration = s16BE(bytes, infoBase + 16);
    // portamentoAddValue = s16BE(bytes, infoBase + 18);
    // vibratoDepth       = u16BE(bytes, infoBase + 20);
    // vibratoAddValue    = u16BE(bytes, infoBase + 22);
    const noteTranspose   = infoBase + 24 < bytes.length ? s16BE(bytes, infoBase + 24) : 0;
    const fineTunePeriod  = infoBase + 26 < bytes.length ? u16BE(bytes, infoBase + 26) : 0x0100;

    sampleDataOffsets.push(sampleDataOffset);
    samples.push({
      sampleData: new Int8Array(0), // filled below
      length,
      loopOffset,
      loopLength,
      volume: Math.min(64, volume),
      fineTunePeriod,
      noteTranspose,
    });
  }

  // Load PCM data
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const dataStart = sampleInfoOffsetTableOffset + sampleDataOffsets[i];

    const sampleEnd1 = sample.length * 2;
    const sampleEnd2 = sample.loopOffset + sample.loopLength * 2;
    const byteLen = Math.max(sampleEnd1, sampleEnd2);

    if (dataStart + byteLen > bytes.length) {
      // Truncated — use what we have
      const available = Math.max(0, bytes.length - dataStart);
      sample.sampleData = new Int8Array(bytes.buffer, bytes.byteOffset + dataStart, available);
    } else {
      sample.sampleData = new Int8Array(bytes.buffer, bytes.byteOffset + dataStart, byteLen);
    }
  }

  return samples;
}

// ── Note conversion ────────────────────────────────────────────────────────

/**
 * Convert a Ben Daglish note index to an XM note number.
 *
 * BD uses 8 octaves × 12 semitones = 96 notes (from the FineTune table).
 * The NostalgicPlayer Samples getter iterates j from 0 to 95 and maps:
 *   frequencies[8*12 - j] = PeriodToFrequency(period)
 * So note j=0 is the highest note and j=95 is the lowest.
 *
 * In BD track data, note values 0x00–0x7E are (note + transpose) pairs.
 * The track note byte directly indexes into the FineTune table.
 *
 * We map BD note j (0-based, 0=lowest in pattern context) to XM:
 *   XM note 1 = C-0 (lowest)
 *   The FineTune table index 0 in the track is the "first" note from the
 *   position (lowest frequency — highest period value in the table).
 *   BD table[0] period ≈ 0x06B0 (very high period = very low pitch).
 *   BD table[47] period ≈ 0x0090 (lower period = higher pitch, ~A-3).
 *
 * The FineTune table has 96 entries covering approximately C-0 to B-7.
 * Index 0 → C-0 (XM note 1), index 95 → B-7 (XM note 96).
 * So: xmNote = bdNoteIndex + 1 (clamped 1-96).
 */
function bdNoteToXM(bdNote: number, noteTranspose: number): number {
  if (bdNote === 0) return 0;
  const idx = (bdNote - 1 + noteTranspose);
  return Math.max(1, Math.min(96, idx + 1));
}

/**
 * Get the approximate sample rate for a Ben Daglish sample using fineTunePeriod.
 * fineTunePeriod is a scale factor: standard period table × (fineTunePeriod / 65536).
 * We use C-3 period (214) scaled by fineTunePeriod as the reference.
 */
function bdSampleRate(fineTunePeriod: number): number {
  // fineTunePeriod ≈ 0x0100 = 256 for normal tune (not a standard 0x10000 value)
  // The BD_FINETUNE_TABLE entries have high periods (0x06B0...) meaning very low pitch.
  // We use a fixed Amiga C-3 rate as the base sample rate.
  const C3_PERIOD = 214;
  if (fineTunePeriod === 0) fineTunePeriod = 0x0100;
  // fineTunePeriod normalizes around 0x0100 (256): values above = lower pitch, below = higher pitch
  const scaledPeriod = Math.max(1, Math.round(C3_PERIOD * fineTunePeriod / 256));
  return Math.round(PAL_CLOCK / (2 * scaledPeriod));
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Ben Daglish (.bd) module file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseBenDaglishFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  const ident = testBenDaglishModule(bytes);
  if (!ident) return null;

  const { subSongListOffset, trackOffsetTableOffset, tracksOffset,
          sampleInfoOffsetTableOffset, features } = ident;

  // ── Load sub-song list ────────────────────────────────────────────────
  // Sub-songs: each is 4 × uint16 BE offsets to per-channel position lists.
  // We read sub-songs until the first position list (= minimum offset) begins.
  const subSongs: number[][] = []; // each is array of 4 position-list-offsets
  {
    let pos = subSongListOffset;
    let firstPositionList = 0x7fffffff;

    while (pos + 8 <= bytes.length) {
      const posLists: number[] = [];
      for (let ch = 0; ch < 4; ch++) {
        posLists.push(u16BE(bytes, pos + ch * 2));
      }
      pos += 8;
      const minPL = Math.min(...posLists);
      firstPositionList = Math.min(firstPositionList, minPL);
      subSongs.push(posLists);

      if (pos >= subSongListOffset + firstPositionList) break;
    }
  }

  if (subSongs.length === 0) return null;

  // ── Load position lists ───────────────────────────────────────────────
  const positionListCache = new Map<number, number[]>();

  for (const song of subSongs) {
    for (const plOffset of song) {
      if (positionListCache.has(plOffset)) continue;
      const pl = loadPositionList(bytes, subSongListOffset + plOffset, features);
      if (pl) positionListCache.set(plOffset, pl);
    }
  }

  // ── Load track offset table ───────────────────────────────────────────
  const numberOfTracks = Math.floor((subSongListOffset - trackOffsetTableOffset) / 2);
  if (numberOfTracks <= 0 || numberOfTracks > 4096) return null;

  const trackOffsets: number[] = [];
  for (let i = 0; i < numberOfTracks; i++) {
    trackOffsets.push(u16BE(bytes, trackOffsetTableOffset + i * 2));
  }

  // ── Load tracks ───────────────────────────────────────────────────────
  const trackCache = new Map<number, number[]>();
  for (let i = 0; i < numberOfTracks; i++) {
    const trackStart = tracksOffset + trackOffsets[i];
    if (trackStart >= bytes.length) continue;
    const track = loadTrack(bytes, trackStart, features);
    if (track) trackCache.set(i, track);
  }

  // ── Load samples ──────────────────────────────────────────────────────
  const samples = loadSamples(bytes, sampleInfoOffsetTableOffset);
  if (!samples) return null;

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const id = i + 1;

    if (sample.sampleData.length > 0 && sample.length > 0) {
      const byteLength = sample.length * 2;
      const pcmLen = Math.min(byteLength, sample.sampleData.length);
      const pcm = new Uint8Array(pcmLen);
      for (let j = 0; j < pcmLen; j++) {
        pcm[j] = sample.sampleData[j] & 0xff;
      }

      const sampleRate = bdSampleRate(sample.fineTunePeriod);

      const hasLoop = sample.loopLength > 0;
      const loopStart = hasLoop ? sample.loopOffset : 0;
      const loopLen   = hasLoop ? sample.loopLength * 2 : 0;
      const loopEnd   = hasLoop ? loopStart + loopLen : 0;

      instrumentConfigs.push(
        createSamplerInstrument(id, `Sample ${i}`, pcm, sample.volume, sampleRate, loopStart, loopEnd)
      );
    } else {
      instrumentConfigs.push({
        id,
        name: `Sample ${i}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────
  // Use the first sub-song. We flatten the 4 per-channel position lists into
  // TrackerSong patterns. Each "position" corresponds to a set of tracks
  // (one track per channel). We walk the position lists in parallel.

  const song0 = subSongs[0];
  const NUM_CHANNELS = 4;

  // Walk each channel's position list to get a sequence of track references
  type TrackRef = { trackIndex: number; transpose: number };
  const channelSequences: TrackRef[][] = [];

  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const plOffset = song0[ch];
    const pl = positionListCache.get(plOffset);
    if (!pl) {
      channelSequences.push([]);
      continue;
    }
    channelSequences.push(walkPositionList(pl, features));
  }

  const maxLen = Math.max(...channelSequences.map(s => s.length), 1);
  const trackerPatterns: Pattern[] = [];

  // Each "pattern" in the TrackerSong corresponds to one step of the position lists.
  // The rows within that pattern are the notes from the track data.
  // We use a fixed pattern length of 16 rows (a common BD track length).
  const PATTERN_ROWS = 16;

  for (let pos = 0; pos < maxLen; pos++) {
    const channelRows: TrackerCell[][] = Array.from({ length: NUM_CHANNELS }, () => []);

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const seq = channelSequences[ch];
      const trackRef = seq[pos] ?? null;

      if (!trackRef) {
        for (let r = 0; r < PATTERN_ROWS; r++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        continue;
      }

      const { trackIndex, transpose } = trackRef;
      const trackData = trackCache.get(trackIndex);

      if (!trackData) {
        for (let r = 0; r < PATTERN_ROWS; r++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        continue;
      }

      // Parse track data into rows
      // Track format: bytes < 0x7F are note bytes followed by tick count (and optionally extra tick).
      //   note=0x7F + tickCount = rest.
      //   bytes >= 0x80 (up to maxSampleMappingValue) = effect/sample commands.
      //   0xFF = end of track.
      const rows: TrackerCell[] = [];
      let tPos = 0;
      let currentSampleIndex = 0; // 1-based (0 = no instrument)

      while (tPos < trackData.length && rows.length < PATTERN_ROWS) {
        const cmd = trackData[tPos++];

        if (cmd === 0xff) break;

        if (cmd < 0x7f) {
          // Note command: note byte + tick count
          const noteRaw = cmd;
          const ticks = tPos < trackData.length ? trackData[tPos++] : 1;
          const extraTick = (features.extraTickArg && ticks === 0 && tPos < trackData.length)
            ? trackData[tPos++]
            : 0;
          void extraTick;

          const sampleInfo = currentSampleIndex > 0 && currentSampleIndex - 1 < samples.length
            ? samples[currentSampleIndex - 1]
            : null;
          const noteTranspose = (sampleInfo?.noteTranspose ?? 0) + transpose;
          const xmNote = bdNoteToXM(noteRaw, noteTranspose);

          // First row of this note: emit note + instrument
          rows.push({
            note:       xmNote,
            instrument: currentSampleIndex,
            volume:     0,
            effTyp:     0,
            eff:        0,
            effTyp2:    0,
            eff2:       0,
          });

          // Remaining ticks: empty rows (held note)
          const holdRows = Math.max(0, Math.min(ticks - 1, PATTERN_ROWS - rows.length));
          for (let t = 0; t < holdRows; t++) {
            rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          }
        } else if (cmd === 0x7f) {
          // Rest: just advance ticks
          const ticks = tPos < trackData.length ? trackData[tPos++] : 1;
          const holdRows = Math.min(ticks, PATTERN_ROWS - rows.length);
          for (let t = 0; t < holdRows; t++) {
            rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          }
        } else if (cmd <= features.maxSampleMappingValue) {
          // Sample select command: sets the current sample
          if (features.getSampleMappingVersion === 1) {
            currentSampleIndex = (cmd & 0x07) + 1;
          } else if (features.getSampleMappingVersion === 2) {
            currentSampleIndex = (cmd & 0xff) + 1;
          } else {
            currentSampleIndex = (cmd & 0x07) + 1;
          }
          // Sample select doesn't emit a row directly
        } else {
          // Effect command — skip (portamento, volume fade, etc.)
          // We don't emit rows for these
        }
      }

      // Pad to PATTERN_ROWS
      while (rows.length < PATTERN_ROWS) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }

      channelRows[ch] = rows.slice(0, PATTERN_ROWS);
    }

    trackerPatterns.push({
      id:     `pattern-${pos}`,
      name:   `Position ${pos}`,
      length: PATTERN_ROWS,
      channels: channelRows.map((rows, ch) => ({
        id:          `channel-${ch}`,
        name:        `Channel ${ch + 1}`,
        muted:       false,
        solo:        false,
        collapsed:   false,
        volume:      100,
        // Amiga LRRL panning
        pan: ([-50, 50, 50, -50] as number[])[ch] ?? 0,
        instrumentId: null,
        color:        null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'BD',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    maxLen,
        originalInstrumentCount: samples.length,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: PATTERN_ROWS,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100,
        pan: ([-50, 50, 50, -50] as number[])[ch] ?? 0,
        instrumentId: null, color: null,
        rows: Array.from({ length: PATTERN_ROWS }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'BD',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 0,
        originalInstrumentCount: samples.length,
      },
    });
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            moduleName,
    format:          'BD' as TrackerFormat,
    patterns:        trackerPatterns,
    instruments:     instrumentConfigs,
    songPositions:   trackerPatterns.map((_, i) => i),
    songLength:      trackerPatterns.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
