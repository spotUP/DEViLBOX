/**
 * BenDaglishParser.ts — Ben Daglish Amiga music format (bd.*) native parser
 *
 * Ben Daglish composed music for many classic Amiga games including The Last
 * Ninja and Thing on a Spring. The module file is a single-file compiled 68k
 * Amiga executable combining the player code and music data.
 *
 * Detection (from UADE "Benn Daglishv3.asm", DTP_Check2 routine):
 *   1. word[0] == 0x6000  (BRA opcode)
 *   2. word at offset 2 (D1): non-zero, < 0x8000 (non-negative), even
 *   3. word at offset 4 == 0x6000
 *   4. word at offset 6 (D1): non-zero, < 0x8000, even
 *   5. word at offset 8 is skipped (addq.l #2, A0 — no comparison)
 *   6. word at offset 10 == 0x6000
 *   7. word at offset 12 (D1): non-zero, < 0x8000, even
 *   8. BRA target = 2 + u16BE(buf, 2)  (A1 = offset 2; add.w (A1), A1)
 *   9. u32BE(buf, target)      == 0x3F006100
 *  10. u16BE(buf, target + 6)  == 0x3D7C
 *  11. u16BE(buf, target + 12) == 0x41FA
 *
 * UADE eagleplayer.conf: BenDaglish  prefixes=bd
 * MI_MaxSamples: not declared in the InfoBuffer (no dc.l MI_MaxSamples in
 *   the assembly source). 8 placeholder instruments are used as a default.
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/BennDaglish/Benn Daglishv3.asm
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, ChannelData, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import { benDaglishEncoder } from '@/engine/uade/encoders/BenDaglishEncoder';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Default placeholder instrument count.
 *
 * MI_MaxSamples is not declared in the InfoBuffer for this format.
 * 8 is used as a reasonable default to give the TrackerSong some
 * representation without over-allocating.
 */
const DEFAULT_INSTRUMENTS = 8;

const MAX_PATTERNS = 256;
const MAX_POSITION_LIST_LEN = 4096;
const MAX_TRACK_LEN = 4096;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v < 0x8000 ? v : v - 0x10000;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Feature flags (simplified — conservative defaults) ──────────────────────

interface BDFeatures {
  maxTrackValue: number;
  maxSampleMappingValue: number;
  usesCxTrackEffects: boolean;
  uses9xTrackEffects: boolean;
  enablePortamento: boolean;
  enableVolumeFade: boolean;
  enableFinalVolumeSlide: boolean;
  enableC0TrackLoop: boolean;
  enableF0TrackLoop: boolean;
  extraTickArg: boolean;
  masterVolumeFadeVersion: number; // -1 = none
  setSampleMappingVersion: number;
  getSampleMappingVersion: number;
  checkForTicks: boolean;
}

function defaultFeatures(): BDFeatures {
  return {
    maxTrackValue: 0x80,
    maxSampleMappingValue: 0x87,
    usesCxTrackEffects: true,
    uses9xTrackEffects: false,
    enablePortamento: true,
    enableVolumeFade: true,
    enableFinalVolumeSlide: false,
    enableC0TrackLoop: false,
    enableF0TrackLoop: false,
    extraTickArg: false,
    masterVolumeFadeVersion: -1,
    setSampleMappingVersion: 1,
    getSampleMappingVersion: 1,
    checkForTicks: false,
  };
}

// ── Offset extraction (mirrors ben_daglish.c) ──────────────────────────────

interface BDOffsets {
  subSongListOffset: number;
  sampleInfoOffsetTableOffset: number;
  trackOffsetTableOffset: number;
  tracksOffset: number;
  features: BDFeatures;
}

function bdExtractInfoFromInit(
  buf: Uint8Array, startOfInit: number,
): { subSongListOffset: number; sampleInfoOffsetTableOffset: number } | null {
  const searchLen = Math.min(buf.length, 0x3000);

  // Find sub-song info: [0x41, 0xFA, xx, xx, 0x22, 0x08]
  let index = startOfInit;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 0x41 && buf[index + 1] === 0xFA &&
        buf[index + 4] === 0x22 && buf[index + 5] === 0x08) break;
  }
  if (index >= searchLen - 6) return null;

  const subSongListOffset = s16BE(buf, index + 2) + index + 2;
  index += 4;

  // Find sample info offset table: [0x41, 0xFA, xx, xx, 0x23, 0x48]
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 0x41 && buf[index + 1] === 0xFA &&
        buf[index + 4] === 0x23 && buf[index + 5] === 0x48) break;
  }
  if (index >= searchLen - 6) return null;

  const sampleInfoOffsetTableOffset = s16BE(buf, index + 2) + index + 2;
  return { subSongListOffset, sampleInfoOffsetTableOffset };
}

function bdExtractInfoFromPlay(
  buf: Uint8Array, startOfPlay: number,
): { trackOffsetTableOffset: number; tracksOffset: number } | null {
  const searchLen = Math.min(buf.length, 0x3000);

  // Find track offset table: [0x47, 0xFA, xx, xx, {0x48,0x80 or 0xD0,0x40}]
  let index = startOfPlay;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 0x47 && buf[index + 1] === 0xFA &&
        ((buf[index + 4] === 0x48 && buf[index + 5] === 0x80) ||
         (buf[index + 4] === 0xD0 && buf[index + 5] === 0x40))) break;
  }
  if (index >= searchLen - 6) return null;

  const trackOffsetTableOffset = s16BE(buf, index + 2) + index + 2;
  index += 4;

  // Find tracks offset: [0x47, 0xFA, xx, xx, 0xD6, 0xC0]
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 0x47 && buf[index + 1] === 0xFA &&
        buf[index + 4] === 0xD6 && buf[index + 5] === 0xC0) break;
  }
  if (index >= searchLen - 6) return null;

  const tracksOffset = s16BE(buf, index + 2) + index + 2;
  return { trackOffsetTableOffset, tracksOffset };
}

/**
 * Detect feature flags by scanning play routine opcodes.
 * Mirrors bd_find_features_in_play from the C reference.
 * On failure, returns conservative defaults so parsing can still proceed.
 */
function bdFindFeatures(buf: Uint8Array, startOfPlay: number): BDFeatures {
  const f = defaultFeatures();
  const searchLen = Math.min(buf.length, 0x3000);

  // Find max_track_value: scan for [0x10, 0x1B] (move.b (A3)+,D0)
  let index = startOfPlay;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 0x10 && buf[index + 1] === 0x1B) break;
  }
  if (index < searchLen - 6) {
    if ((buf[index + 2] === 0xB0 && buf[index + 3] === 0x3C) ||
        (buf[index + 2] === 0x0C && buf[index + 3] === 0x00)) {
      f.maxTrackValue = buf[index + 5];
    }

    // Find loop control: scan for cmp + bge pattern
    for (index += 4; index < searchLen - 6; index += 2) {
      if (((buf[index] === 0xB0 && buf[index + 1] === 0x3C) ||
           (buf[index] === 0x0C && buf[index + 1] === 0x00)) &&
          buf[index + 4] === 0x6C) break;
    }
    if (index < searchLen - 6) {
      const effect = (buf[index + 2] << 8) | buf[index + 3];
      f.enableC0TrackLoop = effect === 0x00C0;
      f.enableF0TrackLoop = effect === 0x00F0;

      // Determine set_sample_mapping_version
      const jumpTarget = buf[index + 5] + index + 6;
      if (jumpTarget < buf.length - 1) {
        if (buf[jumpTarget] === 0x02 && buf[jumpTarget + 1] === 0x40) {
          f.setSampleMappingVersion = 1;
        } else if (buf[jumpTarget] === 0x04 && buf[jumpTarget + 1] === 0x00) {
          f.setSampleMappingVersion = 2;
        }
      }
    }
  }

  // Find portamento/volume fade checks
  for (index = startOfPlay; index < searchLen - 2; index += 2) {
    if (buf[index] === 0x53 && buf[index + 1] === 0x2C) break;
  }
  if (index < searchLen - 2) {
    for (; index >= startOfPlay; index -= 2) {
      if (buf[index] === 0x49 && buf[index + 1] === 0xFA) break;
      if (buf[index] === 0x61 && buf[index + 1] === 0x00) {
        const methodIdx = s16BE(buf, index + 2) + index + 2;
        if (methodIdx >= 0 && methodIdx < searchLen - 14) {
          if (buf[methodIdx] === 0x4A && buf[methodIdx + 1] === 0x2C &&
              buf[methodIdx + 4] === 0x67 && buf[methodIdx + 6] === 0x6A &&
              buf[methodIdx + 8] === 0x30 && buf[methodIdx + 9] === 0x29) {
            f.enablePortamento = true;
          } else if (buf[methodIdx] === 0x4A && buf[methodIdx + 1] === 0x2C &&
                     buf[methodIdx + 4] === 0x67 && buf[methodIdx + 6] === 0x4A &&
                     buf[methodIdx + 7] === 0x2C && buf[methodIdx + 10] === 0x67) {
            f.enableVolumeFade = true;
          }
        }
      }
    }
  }

  // Find handle_effects to detect final_volume_slide and master_volume_fade
  if (buf[startOfPlay] === 0x61 && buf[startOfPlay + 1] === 0x00) {
    const handleEffectsStart = s16BE(buf, startOfPlay + 2) + startOfPlay + 2;
    if (handleEffectsStart >= 0 && handleEffectsStart < searchLen - 2) {
      // Scan for JSR (A0) callback
      for (index = handleEffectsStart; index < searchLen - 2; index += 2) {
        if (buf[index] === 0x4E && buf[index + 1] === 0x90) break;
      }
      if (index < searchLen - 2) {
        const callbackIdx = index;
        // Search backward for BSR.W calls to find enable_final_volume_slide
        for (; index >= handleEffectsStart; index -= 2) {
          if (buf[index] === 0x4E && buf[index + 1] === 0x75) break;
          if (buf[index] === 0x61 && buf[index + 1] === 0x00) {
            const mi = s16BE(buf, index + 2) + index + 2;
            if (mi >= 0 && mi < searchLen - 14) {
              if (buf[mi] === 0x30 && buf[mi + 1] === 0x2B &&
                  buf[mi + 4] === 0x67 && buf[mi + 6] === 0x53 && buf[mi + 7] === 0x6B) {
                f.enableFinalVolumeSlide = true;
              }
            }
          }
        }
        // Detect master_volume_fade
        if (buf[handleEffectsStart] === 0x61 && buf[handleEffectsStart + 1] === 0x00) {
          const mvfIdx = s16BE(buf, handleEffectsStart + 2) + handleEffectsStart + 2;
          if (mvfIdx >= 0 && mvfIdx < searchLen - 24) {
            if (buf[mvfIdx] === 0x30 && buf[mvfIdx + 1] === 0x3A &&
                buf[mvfIdx + 4] === 0x67 && buf[mvfIdx + 5] === 0x00) {
              f.masterVolumeFadeVersion = 1;
            } else if (buf[mvfIdx] === 0x10 && buf[mvfIdx + 1] === 0x3A &&
                       buf[mvfIdx + 4] === 0x67 && buf[mvfIdx + 5] === 0x00) {
              f.masterVolumeFadeVersion = 2;
            }
          }
        }
        // Detect set_dma_in_sample_handlers (we don't need it for parsing)
        // but we need callback_index to check BNE/BNE offset for
        // post-callback analysis — skip for simplicity.
        void callbackIdx;
      }
    }
  }

  // Detect parse_track features (extra_tick_arg, max_sample_mapping_value, etc.)
  for (index = startOfPlay; index < searchLen - 4; index += 2) {
    if (buf[index] === 0x60 && buf[index + 1] === 0x00) break;
  }
  if (index < searchLen - 4) {
    const parseTrackStart = s16BE(buf, index + 2) + index + 2;
    if (parseTrackStart >= 0 && parseTrackStart < searchLen) {
      // Find extra_tick_arg check
      for (let i2 = parseTrackStart; i2 < searchLen - 8; i2 += 2) {
        if (buf[i2] === 0x72 && buf[i2 + 1] === 0x00 &&
            buf[i2 + 2] === 0x12 && buf[i2 + 3] === 0x1B) {
          f.extraTickArg = buf[i2 + 4] === 0x66;
          break;
        }
      }

      // Find BSR.W to parse_track_effect
      for (let i2 = parseTrackStart; i2 < searchLen - 4; i2 += 2) {
        if (buf[i2] === 0x61 && buf[i2 + 1] === 0x00) {
          const pteStart = s16BE(buf, i2 + 2) + i2 + 2;
          if (pteStart >= 0 && pteStart < searchLen - 12) {
            // Extract max_sample_mapping_value
            if ((buf[pteStart + 2] === 0xB0 && buf[pteStart + 3] === 0x3C) ||
                (buf[pteStart + 2] === 0x0C && buf[pteStart + 3] === 0x00)) {
              f.maxSampleMappingValue = buf[pteStart + 5];

              if (pteStart + 11 < searchLen) {
                if (buf[pteStart + 8] === 0x02 && buf[pteStart + 9] === 0x40 &&
                    buf[pteStart + 10] === 0x00) {
                  if (buf[pteStart + 11] === 0x07) f.getSampleMappingVersion = 1;
                  else if (buf[pteStart + 11] === 0xFF) f.getSampleMappingVersion = 2;
                }
              }

              // Find 9x vs cx track effects
              for (let i3 = pteStart + 12; i3 < searchLen - 6; i3 += 2) {
                if (((buf[i3] === 0xB0 && buf[i3 + 1] === 0x3C) ||
                     (buf[i3] === 0x0C && buf[i3 + 1] === 0x00)) &&
                    buf[i3 + 4] === 0x6C) {
                  f.uses9xTrackEffects = (buf[i3 + 3] & 0xF0) === 0x90;
                  f.usesCxTrackEffects = (buf[i3 + 3] & 0xF0) === 0xC0;
                  break;
                }
              }
            }
          }
          break;
        }
      }
    }
  }

  return f;
}

function bdFindOffsets(buf: Uint8Array): BDOffsets | null {
  const len = buf.length;
  if (len < 0x1600) return null;

  // Verify BRA instructions
  if (buf[0] !== 0x60 || buf[1] !== 0x00 || buf[4] !== 0x60 || buf[5] !== 0x00 ||
      buf[10] !== 0x60 || buf[11] !== 0x00) return null;

  const startOfInit = s16BE(buf, 2) + 2;
  const startOfPlay = s16BE(buf, 6) + 4 + 2;
  const searchLimit = Math.min(len, 0x3000);

  if (startOfInit < 0 || startOfInit >= searchLimit - 14) return null;
  if (startOfPlay < 0 || startOfPlay >= searchLimit) return null;

  // Validate init function signature
  if (buf[startOfInit] !== 0x3F || buf[startOfInit + 1] !== 0x00 ||
      buf[startOfInit + 2] !== 0x61 || buf[startOfInit + 3] !== 0x00 ||
      buf[startOfInit + 6] !== 0x3D || buf[startOfInit + 7] !== 0x7C ||
      buf[startOfInit + 12] !== 0x41 || buf[startOfInit + 13] !== 0xFA) return null;

  const initResult = bdExtractInfoFromInit(buf, startOfInit);
  if (!initResult) return null;

  const playResult = bdExtractInfoFromPlay(buf, startOfPlay);
  if (!playResult) return null;

  const features = bdFindFeatures(buf, startOfPlay);

  return {
    subSongListOffset: initResult.subSongListOffset,
    sampleInfoOffsetTableOffset: initResult.sampleInfoOffsetTableOffset,
    trackOffsetTableOffset: playResult.trackOffsetTableOffset,
    tracksOffset: playResult.tracksOffset,
    features,
  };
}

// ── Track command argument count (mirrors C reference) ──────────────────────

function bdTrackCommandArgCount(cmd: number, nextByte: number, f: BDFeatures): number {
  if (cmd < 0x7F) {
    if (f.extraTickArg && nextByte === 0) return 2;
    return 1;
  }
  if (cmd === 0x7F) return 1;
  if (cmd <= f.maxSampleMappingValue) return 0;
  if ((f.usesCxTrackEffects && cmd < 0xC0) || (f.uses9xTrackEffects && cmd < 0x9B)) return 0;

  // Portamento enable (3 args)
  if ((cmd === 0xC0 && f.usesCxTrackEffects && f.enablePortamento) ||
      (cmd === 0x9B && f.uses9xTrackEffects && f.enablePortamento)) return 3;
  // Portamento disable (0 args)
  if ((cmd === 0xC1 && f.usesCxTrackEffects && f.enablePortamento) ||
      (cmd === 0x9C && f.uses9xTrackEffects && f.enablePortamento)) return 0;
  // Volume fade enable (3 args)
  if ((cmd === 0xC2 && f.usesCxTrackEffects && f.enableVolumeFade) ||
      (cmd === 0x9D && f.uses9xTrackEffects && f.enableVolumeFade)) return 3;
  // Volume fade disable (0 args)
  if ((cmd === 0xC3 && f.usesCxTrackEffects && f.enableVolumeFade) ||
      (cmd === 0x9E && f.uses9xTrackEffects && f.enableVolumeFade)) return 0;
  // Portamento2 enable (1 arg)
  if ((cmd === 0xC4 && f.usesCxTrackEffects && f.enablePortamento) ||
      (cmd === 0x9F && f.uses9xTrackEffects && f.enablePortamento)) return 1;
  // Portamento2 disable (0 args)
  if ((cmd === 0xC5 && f.usesCxTrackEffects && f.enablePortamento) ||
      (cmd === 0xA0 && f.uses9xTrackEffects && f.enablePortamento)) return 0;
  // Channel volume (1 or 3 args)
  if ((cmd === 0xC6 && f.usesCxTrackEffects && f.enableVolumeFade) ||
      (cmd === 0xA1 && f.uses9xTrackEffects && f.enableVolumeFade)) {
    return f.enableFinalVolumeSlide ? 3 : 1;
  }
  // Final volume slide disable (0 args)
  if ((cmd === 0xC7 && f.usesCxTrackEffects && f.enableFinalVolumeSlide) ||
      (cmd === 0xA2 && f.uses9xTrackEffects && f.enableFinalVolumeSlide)) return 0;

  return -1; // unknown
}

// ── Position list command argument count ────────────────────────────────────

function bdPositionCommandArgCount(cmd: number, f: BDFeatures): number {
  if (cmd < f.maxTrackValue) return 0;
  if (f.enableC0TrackLoop) {
    if (cmd < 0xA0) return 0;
    if (cmd < 0xC8) return 1;
  }
  if (f.enableF0TrackLoop) {
    if (cmd < 0xF0) return 0;
    if (cmd < 0xF8) return 1;
  }
  if (cmd === 0xFD && f.masterVolumeFadeVersion > 0) return 1;
  if (cmd === 0xFE) return 1;
  return -1; // end marker or unknown
}

// ── Track loading ──────────────────────────────────────────────────────────

function bdLoadSingleTrack(
  buf: Uint8Array, offset: number, f: BDFeatures,
): Uint8Array | null {
  if (offset < 0 || offset >= buf.length) return null;

  const data: number[] = [];
  let pos = offset;

  while (data.length < MAX_TRACK_LEN) {
    if (pos >= buf.length) return null;
    const cmd = buf[pos++];
    data.push(cmd);
    if (cmd === 0xFF) break;

    if (pos >= buf.length) return null;
    const nextByte = buf[pos];
    const argCount = bdTrackCommandArgCount(cmd, nextByte, f);
    if (argCount === -1) return null;

    for (let i = 0; i < argCount; i++) {
      if (pos >= buf.length) return null;
      data.push(buf[pos++]);
    }
  }

  return new Uint8Array(data);
}

function bdLoadTracks(buf: Uint8Array, offsets: BDOffsets): Uint8Array[] | null {
  const numTracks = (offsets.subSongListOffset - offsets.trackOffsetTableOffset) / 2;
  if (numTracks <= 0 || numTracks > 1024) return null;

  const tablePos = offsets.trackOffsetTableOffset;
  if (tablePos < 0 || tablePos + numTracks * 2 > buf.length) return null;

  const tracks: Uint8Array[] = [];
  for (let i = 0; i < numTracks; i++) {
    const trackOffset = u16BE(buf, tablePos + i * 2);
    const absOffset = offsets.tracksOffset + trackOffset;
    const trackData = bdLoadSingleTrack(buf, absOffset, offsets.features);
    if (!trackData) return null;
    tracks.push(trackData);
  }
  return tracks;
}

// ── Sub-song and position list loading ──────────────────────────────────────

interface BDSubSong {
  positionLists: [number, number, number, number];
}

function bdLoadSubSongs(buf: Uint8Array, subSongListOffset: number): BDSubSong[] | null {
  if (subSongListOffset < 0 || subSongListOffset >= buf.length) return null;

  const songs: BDSubSong[] = [];
  let firstPosListOffset = 0x7FFFFFFF;
  let pos = subSongListOffset;

  do {
    if (pos + 8 > buf.length) return null;
    const pl: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      pl[i] = u16BE(buf, pos);
      pos += 2;
      if (pl[i] < firstPosListOffset) firstPosListOffset = pl[i];
    }
    songs.push({ positionLists: pl });
  } while (pos < subSongListOffset + firstPosListOffset);

  return songs.length > 0 ? songs : null;
}

function bdLoadPositionList(
  buf: Uint8Array, offset: number, f: BDFeatures,
): number[] | null {
  if (offset < 0 || offset >= buf.length) return null;

  const data: number[] = [];
  let pos = offset;

  while (data.length < MAX_POSITION_LIST_LEN) {
    if (pos >= buf.length) return null;
    const cmd = buf[pos++];
    data.push(cmd);
    if (cmd === 0xFF) break;

    const argCount = bdPositionCommandArgCount(cmd, f);
    if (argCount === -1) return null;

    for (let i = 0; i < argCount; i++) {
      if (pos >= buf.length) return null;
      data.push(buf[pos++]);
    }
  }
  return data;
}

// ── Event-based track interpretation ────────────────────────────────────────

interface BDEvent {
  tick: number;
  note: number;       // tracker note 1-96, 0 = none
  instrument: number; // 1-based, 0 = none
  effTyp: number;
  eff: number;
}

/**
 * Convert a BD note value (0-0x7E) to a tracker note (1-96).
 * BD note 0 = C-1 in Amiga convention = tracker note 25.
 */
function bdNoteToTrackerNote(note: number): number {
  const n = note + 25;
  return (n >= 1 && n <= 96) ? n : 0;
}

// (Channel events are now extracted via bdExtractTrackSteps + bdDecodeTrackRows)

/**
 * Parse a single track byte stream, appending events.
 * Returns the tick position after the track ends.
 */
function bdParseTrackEvents(
  track: Uint8Array,
  f: BDFeatures,
  events: BDEvent[],
  startTick: number,
  transpose: number,
  currentInstrument: number,
): number {
  let tick = startTick;
  let pos = 0;
  let instrument = currentInstrument;
  const maxTicks = 65536;

  while (pos < track.length && tick < maxTicks) {
    const cmd = track[pos];

    if (cmd === 0xFF) break; // end of track

    if (cmd < 0x7F) {
      // Note command
      pos++;
      const note = cmd;
      const transposedNote = (note + transpose) & 0x7F;
      const trackerNote = bdNoteToTrackerNote(transposedNote);

      if (pos >= track.length) break;
      let ticks = track[pos++];

      if (f.extraTickArg && ticks === 0) {
        if (pos >= track.length) break;
        ticks = track[pos++];
        // Extended duration: original tick count is 0xFF, extended byte is the actual duration
      }

      if (trackerNote > 0) {
        events.push({
          tick,
          note: trackerNote,
          instrument,
          effTyp: 0,
          eff: 0,
        });
      }
      tick += Math.max(1, ticks);
      continue;
    }

    if (cmd === 0x7F) {
      // Rest/sustain
      pos++;
      if (pos >= track.length) break;
      const ticks = track[pos++];
      tick += Math.max(1, ticks);
      continue;
    }

    // Effect command (>= 0x80)
    if (cmd <= f.maxSampleMappingValue) {
      // Sample mapping change
      pos++;
      const index = (f.getSampleMappingVersion === 1) ? (cmd & 0x07) : (cmd - 0x80);
      if (index === 0) {
        // Direct instrument reference - use the mapping
        instrument = index + 1;
      }
      // For sample mapping, the instrument is set from the mapping table
      // We use cmd itself as a simple instrument tracker
      instrument = (cmd & 0x07) + 1;
      continue;
    }

    // Track effect commands
    pos++;
    if ((f.usesCxTrackEffects && cmd < 0xC0) || (f.uses9xTrackEffects && cmd < 0x9B)) {
      // Control flag — no args
      continue;
    }

    // Portamento enable (3 bytes)
    if ((cmd === 0xC0 && f.usesCxTrackEffects && f.enablePortamento) ||
        (cmd === 0x9B && f.uses9xTrackEffects && f.enablePortamento)) {
      pos += 3;
      continue;
    }
    // Portamento disable (0 bytes)
    if ((cmd === 0xC1 && f.usesCxTrackEffects && f.enablePortamento) ||
        (cmd === 0x9C && f.uses9xTrackEffects && f.enablePortamento)) continue;
    // Volume fade enable (3 bytes)
    if ((cmd === 0xC2 && f.usesCxTrackEffects && f.enableVolumeFade) ||
        (cmd === 0x9D && f.uses9xTrackEffects && f.enableVolumeFade)) {
      pos += 3;
      continue;
    }
    // Volume fade disable (0 bytes)
    if ((cmd === 0xC3 && f.usesCxTrackEffects && f.enableVolumeFade) ||
        (cmd === 0x9E && f.uses9xTrackEffects && f.enableVolumeFade)) continue;
    // Portamento2 enable (1 byte)
    if ((cmd === 0xC4 && f.usesCxTrackEffects && f.enablePortamento) ||
        (cmd === 0x9F && f.uses9xTrackEffects && f.enablePortamento)) {
      pos += 1;
      continue;
    }
    // Portamento2 disable (0 bytes)
    if ((cmd === 0xC5 && f.usesCxTrackEffects && f.enablePortamento) ||
        (cmd === 0xA0 && f.uses9xTrackEffects && f.enablePortamento)) continue;
    // Channel volume (1 or 3 bytes)
    if ((cmd === 0xC6 && f.usesCxTrackEffects && f.enableVolumeFade) ||
        (cmd === 0xA1 && f.uses9xTrackEffects && f.enableVolumeFade)) {
      pos += f.enableFinalVolumeSlide ? 3 : 1;
      continue;
    }
    // Final volume slide disable (0 bytes)
    if ((cmd === 0xC7 && f.usesCxTrackEffects && f.enableFinalVolumeSlide) ||
        (cmd === 0xA2 && f.uses9xTrackEffects && f.enableFinalVolumeSlide)) continue;

    // Unknown command — bail out of this track
    break;
  }

  return tick;
}

// (Track-aligned pattern builder is above — bdBuildTrackAlignedPatterns)

// ── Track-step extraction ──────────────────────────────────────────────────
// Walks a channel's position list and extracts the ordered sequence of track
// references. Each track reference becomes one "step" (= one tracker pattern).

interface BDTrackStep {
  trackIndex: number;
  transpose: number;
  instrument: number; // 1-based, 0 = none
}

/**
 * Extract ordered track references from a position list.
 * Handles transpose, sample mapping, and loop commands.
 */
function bdExtractTrackSteps(posListData: number[], f: BDFeatures): BDTrackStep[] {
  const steps: BDTrackStep[] = [];
  let transpose = 0;
  let currentInstrument = 1;
  let posIdx = 0;

  while (posIdx < posListData.length && steps.length < MAX_PATTERNS) {
    const cmd = posListData[posIdx++];
    if (cmd === 0xFF) break;

    if (cmd < f.maxTrackValue) {
      steps.push({ trackIndex: cmd, transpose, instrument: currentInstrument });
      continue;
    }

    if (cmd === 0xFE) {
      if (posIdx >= posListData.length) break;
      const val = posListData[posIdx++];
      transpose = val < 128 ? val : val - 256;
      continue;
    }

    if (cmd === 0xFD && f.masterVolumeFadeVersion > 0) { posIdx++; continue; }

    // Sample mapping commands
    if (f.enableC0TrackLoop && cmd >= 0xA0 && cmd < 0xC0) continue;
    if (f.enableC0TrackLoop && cmd >= 0xC0 && cmd < 0xC8) {
      if (posIdx >= posListData.length) break;
      const si = Math.floor(posListData[posIdx++] / 4);
      if ((cmd & 0x07) === 0) currentInstrument = si + 1;
      continue;
    }
    if (f.enableF0TrackLoop && cmd >= 0xF0 && cmd < 0xF8) {
      if (posIdx >= posListData.length) break;
      const si = Math.floor(posListData[posIdx++] / 4);
      if ((cmd - 0xF0) === 0) currentInstrument = si + 1;
      continue;
    }
    if (!f.enableC0TrackLoop && !f.enableF0TrackLoop) {
      if (f.setSampleMappingVersion === 1 && cmd >= 0xC0 && cmd < 0xC8) {
        if (posIdx >= posListData.length) break;
        const si = Math.floor(posListData[posIdx++] / 4);
        if ((cmd & 0x07) === 0) currentInstrument = si + 1;
        continue;
      }
      if (f.setSampleMappingVersion === 2 && cmd >= 0xF0 && cmd < 0xF8) {
        if (posIdx >= posListData.length) break;
        const si = Math.floor(posListData[posIdx++] / 4);
        if ((cmd - 0xF0) === 0) currentInstrument = si + 1;
        continue;
      }
    }
  }

  return steps;
}

/**
 * Decode a single track's events into rows (tick-local, 0-based).
 */
function bdDecodeTrackRows(
  track: Uint8Array, f: BDFeatures, transpose: number, instrument: number,
): { rows: TrackerCell[]; rowCount: number } {
  const events: BDEvent[] = [];
  bdParseTrackEvents(track, f, events, 0, transpose, instrument);

  const maxTick = events.reduce((m, e) => Math.max(m, e.tick), 0);
  const rowCount = Math.max(maxTick + 1, 1);
  const rows: TrackerCell[] = Array.from({ length: rowCount }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  for (const ev of events) {
    if (ev.tick < rowCount) {
      rows[ev.tick] = {
        note: ev.note, instrument: ev.instrument, volume: 0,
        effTyp: ev.effTyp, eff: ev.eff, effTyp2: 0, eff2: 0,
      };
    }
  }

  return { rows, rowCount };
}

// ── Track-aligned pattern builder ──────────────────────────────────────────

interface BDExtractResult {
  patterns: Pattern[];
  songPositions: number[];
  /** File offset of each track (index = track number from offset table). */
  trackFileOffsets: number[];
  /** Byte size of each track. */
  trackFileSizes: number[];
  /** trackMap[patternIdx][channel] = file-level track index (or -1 if unused). */
  trackMap: number[][];
}

function bdBuildTrackAlignedPatterns(
  buf: Uint8Array,
  offsets: BDOffsets,
  tracks: Uint8Array[],
  channelSteps: BDTrackStep[][],
): BDExtractResult {
  const numSteps = Math.max(...channelSteps.map(s => s.length), 1);
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const trackMap: number[][] = [];
  const f = offsets.features;

  // Compute track file offsets and sizes
  const tablePos = offsets.trackOffsetTableOffset;
  const trackFileOffsets: number[] = [];
  const trackFileSizes: number[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const trackOffset = u16BE(buf, tablePos + i * 2);
    trackFileOffsets.push(offsets.tracksOffset + trackOffset);
    trackFileSizes.push(tracks[i].length);
  }

  for (let step = 0; step < numSteps && patterns.length < MAX_PATTERNS; step++) {
    const channels: ChannelData[] = [];
    let maxRows = 1;
    const stepTrackMap: number[] = [];

    // First pass: compute max row count
    for (let ch = 0; ch < 4; ch++) {
      const s = channelSteps[ch][step];
      if (s && s.trackIndex < tracks.length) {
        const { rowCount } = bdDecodeTrackRows(tracks[s.trackIndex], f, s.transpose, s.instrument);
        maxRows = Math.max(maxRows, rowCount);
        stepTrackMap.push(s.trackIndex);
      } else {
        stepTrackMap.push(-1);
      }
    }
    // Cap pattern length
    maxRows = Math.min(maxRows, 512);

    // Second pass: build channel data
    for (let ch = 0; ch < 4; ch++) {
      const s = channelSteps[ch][step];
      let rows: TrackerCell[];

      if (s && s.trackIndex < tracks.length) {
        const decoded = bdDecodeTrackRows(tracks[s.trackIndex], f, s.transpose, s.instrument);
        rows = decoded.rows;
        // Pad or truncate to match pattern length
        while (rows.length < maxRows) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        if (rows.length > maxRows) rows = rows.slice(0, maxRows);
      } else {
        rows = Array.from({ length: maxRows }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        }));
      }

      channels.push({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null, rows,
      });
    }

    patterns.push({
      id: `pattern-${step}`, name: `Pattern ${step}`, length: maxRows, channels,
    });
    songPositions.push(step);
    trackMap.push(stepTrackMap);
  }

  return { patterns, songPositions, trackFileOffsets, trackFileSizes, trackMap };
}

// ── Main pattern extraction entry point ─────────────────────────────────────

function extractBDPatterns(
  buf: Uint8Array,
): BDExtractResult | null {
  const offsets = bdFindOffsets(buf);
  if (!offsets) return null;

  const tracks = bdLoadTracks(buf, offsets);
  if (!tracks || tracks.length === 0) return null;

  const subSongs = bdLoadSubSongs(buf, offsets.subSongListOffset);
  if (!subSongs || subSongs.length === 0) return null;

  // Use first sub-song
  const song = subSongs[0];
  const f = offsets.features;

  // Extract track-step sequences per channel
  const channelSteps: BDTrackStep[][] = [];
  for (let ch = 0; ch < 4; ch++) {
    const plOffset = offsets.subSongListOffset + song.positionLists[ch];
    const posListData = bdLoadPositionList(buf, plOffset, f);
    if (!posListData) {
      channelSteps.push([]);
      continue;
    }
    channelSteps.push(bdExtractTrackSteps(posListData, f));
  }

  // Check we have any steps
  const totalSteps = channelSteps.reduce((s, steps) => s + steps.length, 0);
  if (totalSteps === 0) return null;

  return bdBuildTrackAlignedPatterns(buf, offsets, tracks, channelSteps);
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm
 * from Benn Daglishv3.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`bd.`). If a prefix does not match, detection returns false
 * immediately to avoid false positives from unrelated formats. The binary
 * scan is always performed regardless of filename.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isBenDaglishFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Extension check (optional fast-reject) ───────────────────────────────
  // UADE eagleplayer.conf uses "bd." prefix (bd.corporation); modland uses
  // ".bd" suffix (corporation.bd). Accept both conventions.
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.endsWith('.bd') && !base.startsWith('bd.')) return false;
  }

  // Need at least 14 bytes for the header checks (through offset 12 + 2).
  if (buf.length < 14) return false;

  // word[0] == 0x6000 (BRA opcode)
  if (u16BE(buf, 0) !== 0x6000) return false;

  // word at offset 2: non-zero, < 0x8000 (positive), even
  const d1 = u16BE(buf, 2);
  if (d1 === 0 || d1 >= 0x8000 || (d1 & 1) !== 0) return false;

  // word at offset 4 == 0x6000
  if (u16BE(buf, 4) !== 0x6000) return false;

  // word at offset 6: non-zero, < 0x8000, even
  const d2 = u16BE(buf, 6);
  if (d2 === 0 || d2 >= 0x8000 || (d2 & 1) !== 0) return false;

  // offset 8 is skipped (addq.l #2, A0 in the assembly — no comparison)

  // word at offset 10 == 0x6000
  if (u16BE(buf, 10) !== 0x6000) return false;

  // word at offset 12: non-zero, < 0x8000, even
  const d3 = u16BE(buf, 12);
  if (d3 === 0 || d3 >= 0x8000 || (d3 & 1) !== 0) return false;

  // BRA target = 2 + d1
  //   A1 is set to offset 2 (move.l A0, A1 after incrementing A0 to offset 2),
  //   then add.w (A1), A1 adds d1 to give absolute offset 2 + d1.
  const target = 2 + d1;

  // Need 14 bytes at target (offsets target+0 through target+13)
  if (target + 13 >= buf.length) return false;

  if (u32BE(buf, target)      !== 0x3f006100) return false;
  if (u16BE(buf, target + 6)  !== 0x3d7c)     return false;
  if (u16BE(buf, target + 12) !== 0x41fa)      return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Ben Daglish module file into a TrackerSong.
 *
 * The format is a compiled 68k Amiga executable; there is no public
 * specification of the internal layout beyond what the UADE EaglePlayer uses
 * for detection. This parser creates a metadata-only TrackerSong with
 * placeholder instruments. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseBenDaglishFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip ".bd" suffix or "bd." prefix (case-insensitive)
  const moduleName = baseName.replace(/\.bd$/i, '').replace(/^bd\./i, '') || baseName;

  // ── Extract real samples via SampleInfo1 table ────────────────────────────
  //
  // Algorithm from Benn Daglishv3.asm InitPlayer:
  // 1. Follow BRA at offset 0: target = 2 + u16BE(buf, 2)
  // 2. Scan forward for D040 D040 D040 41FA sequence
  // 3. SampleInfo1 = scanPos + 8 + s16(scanPos+8) (PC-relative LEA)
  // 4. Longword offset table → sample descriptors (null-terminated)
  // 5. Descriptor: u32(sampleOff) u32(loopOff) u16(lenWords) u16(loopLenWords)

  const buf = new Uint8Array(buffer);
  const instruments: InstrumentConfig[] = [];

  let samplesExtracted = false;

  {
    // Find SampleInfo1: scan all LEA d16(PC),A0 (0x41FA) instructions.
    // The correct one points to a table of longwords where hi-word=0 (offsets < 0x10000).
    let sampleInfo1Off = -1;
    for (let i = 0; i < Math.min(buf.length - 4, 0x2000); i += 2) {
      if (u16BE(buf, i) !== 0x41FA) continue;
      const disp = u16BE(buf, i + 2);
      const signedDisp = disp < 0x8000 ? disp : disp - 0x10000;
      const target = (i + 2) + signedDisp;
      if (target < 0 || target + 16 > buf.length) continue;
      // Validate: count longword entries with hi-word = 0
      let count = 0;
      for (let j = 0; j < 64; j++) {
        const off = target + j * 4;
        if (off + 4 > buf.length) break;
        const v = u32BE(buf, off);
        if (v === 0 || (v >>> 16) !== 0) break;
        count++;
      }
      if (count >= 3) { sampleInfo1Off = target; break; }
    }

    if (sampleInfo1Off > 0 && sampleInfo1Off < buf.length) {
      // Read entries: longwords with hi-word=0, terminated by 0 or non-zero hi-word
      const sampleDescs: number[] = [];
      for (let i = 0; i < 64; i++) {
        const off = sampleInfo1Off + i * 4;
        if (off + 4 > buf.length) break;
        const v = u32BE(buf, off);
        if (v === 0 || (v >>> 16) !== 0) break;
        sampleDescs.push(v);
      }

      for (let i = 0; i < sampleDescs.length; i++) {
        const descFileOff = sampleInfo1Off + sampleDescs[i];
        if (descFileOff + 12 > buf.length) continue;

        const sampleOff = u32BE(buf, descFileOff);
        const loopOff = u32BE(buf, descFileOff + 4);
        const lenWords = u16BE(buf, descFileOff + 8);
        const loopLenWords = u16BE(buf, descFileOff + 10);
        const pcmFileOff = sampleInfo1Off + sampleOff;
        const lenBytes = lenWords * 2;

        if (lenBytes > 0 && pcmFileOff > 0 && pcmFileOff + lenBytes <= buf.length) {
          const isFORM = pcmFileOff + 4 <= buf.length &&
            buf[pcmFileOff] === 0x46 && buf[pcmFileOff + 1] === 0x4F &&
            buf[pcmFileOff + 2] === 0x52 && buf[pcmFileOff + 3] === 0x4D;

          let pcm: Uint8Array;
          if (isFORM) {
            pcm = new Uint8Array(0);
            for (let j = pcmFileOff + 12; j < pcmFileOff + lenBytes - 8; j += 2) {
              if (buf[j] === 0x42 && buf[j + 1] === 0x4F &&
                  buf[j + 2] === 0x44 && buf[j + 3] === 0x59) {
                const bodyLen = u32BE(buf, j + 4);
                const bodyOff = j + 8;
                pcm = new Uint8Array(Math.min(bodyLen, buf.length - bodyOff));
                for (let k = 0; k < pcm.length; k++) pcm[k] = buf[bodyOff + k];
                break;
              }
            }
            if (pcm.length === 0) {
              pcm = new Uint8Array(lenBytes);
              for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
            }
          } else {
            pcm = new Uint8Array(lenBytes);
            for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
          }

          const hasLoop = sampleOff !== loopOff && loopLenWords > 0;
          const loopStartBytes = hasLoop ? (sampleInfo1Off + loopOff) - pcmFileOff : 0;
          const loopEndBytes = hasLoop ? loopStartBytes + loopLenWords * 2 : 0;

          instruments.push(createSamplerInstrument(
            i + 1, `BD Sample ${i + 1}`, pcm, 64, 8287,
            Math.max(0, loopStartBytes), Math.max(0, loopEndBytes)
          ));
          samplesExtracted = true;
        }
      }
    }
  }

  if (!samplesExtracted || instruments.length === 0) {
    instruments.length = 0;
    for (let i = 0; i < DEFAULT_INSTRUMENTS; i++) {
      instruments.push({
        id: i + 1,
        name: `BD Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Extract patterns from binary ────────────────────────────────────────────

  const patternResult = extractBDPatterns(buf);

  let patterns: Pattern[];
  let songPositions: number[];
  let uadeVariableLayout: UADEVariablePatternLayout | undefined;

  if (patternResult) {
    patterns = patternResult.patterns;
    songPositions = patternResult.songPositions;

    // Build variable layout for chip RAM editing
    uadeVariableLayout = {
      formatId: 'benDaglish',
      numChannels: 4,
      numFilePatterns: patternResult.trackFileOffsets.length,
      rowsPerPattern: patterns.map(p => p.length),
      moduleSize: buf.length,
      encoder: benDaglishEncoder,
      filePatternAddrs: patternResult.trackFileOffsets,
      filePatternSizes: patternResult.trackFileSizes,
      trackMap: patternResult.trackMap,
    };
  } else {
    // Fallback: single empty pattern
    const emptyRows: TrackerCell[] = Array.from({ length: 64 }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));

    patterns = [{
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null, rows: emptyRows,
      })),
    }];
    songPositions = [0];
  }

  // Add import metadata to first pattern
  if (patterns.length > 0) {
    patterns[0].importMetadata = {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: patterns.length,
      originalInstrumentCount: instruments.length,
    };
  }

  const result: TrackerSong = {
    name: `${moduleName} [Ben Daglish]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    bdFileData: buffer.slice(0),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
  if (uadeVariableLayout) {
    (result as any).uadeVariableLayout = uadeVariableLayout;
  }
  return result;
}
