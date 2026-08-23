/**
 * ROM-Based Phoneme Extraction for TMS5220 TTS
 *
 * Extracts authentic LPC frames from A-Z letter recordings in the Speak & Spell ROM,
 * maps them to SAM phoneme codes, and provides them for phoneme TTS — making
 * synthesized speech sound closer to the original hardware.
 *
 * Each letter name has a known phonemic structure (e.g. "B" = B* + IY),
 * so we can segment the ROM frames and extract individual phonemes with
 * authentic TI-recorded LPC parameters.
 *
 * buildFramesFromROMLibrary() renders a phoneme sequence. Mined runs are the
 * primary source (see the precedence note there); the static table answers for
 * codes with no usable run. Per segment:
 * 1. Stress-based duration scaling (both sources)
 * 2. Class minimum frame count (both sources)
 * 3. Static source only: stress energy/pitch accent, 65% tempo compression,
 *    energy envelope and micro-pitch contour — the shaping a single curated
 *    frame needs to read as speech. Mined runs already carry all of it.
 * 4. Coarticulation transitions between phoneme boundaries
 */

import type { LPCFrame, VSMWord } from './VSMROMParser';
import type { TMS5220Frame } from './tms5220PhonemeMap';
import { textToPhonemes, parsePhonemeString } from './Reciter';
import {
  alignPhonemesToFrames,
  getPhonemeClass,
  kIndexDistance,
  resolveRepeatFrames,
  trimSilence,
  K_MAX,
  type PhonemeClass,
} from './ROMWordAligner';

// resolveRepeatFrames was this module's public API before the aligner existed —
// keep the name importable from here.
export { resolveRepeatFrames } from './ROMWordAligner';

// ============================================================================
// Letter → Phoneme Decomposition
// ============================================================================

/** Segment type for letter decomposition */
type SegmentType = 'V' | 'CV' | 'VC' | 'CVC' | 'GV' | 'SKIP';

interface LetterDecomposition {
  segments: string[];    // Phoneme codes in order (e.g. ['B*', 'IY'])
  type: SegmentType;     // How to segment the frames
}

/**
 * Defines each letter's phonemic structure and which phonemes to extract.
 * Based on standard American English letter name pronunciations.
 */
export const LETTER_PHONEME_MAP: Record<string, LetterDecomposition> = {
  A: { segments: ['EY'],       type: 'V' },
  B: { segments: ['B*', 'IY'], type: 'CV' },
  C: { segments: ['S*', 'IY'], type: 'CV' },
  D: { segments: ['D*', 'IY'], type: 'CV' },
  E: { segments: ['IY'],       type: 'V' },
  F: { segments: ['EH', 'F*'], type: 'VC' },
  G: { segments: ['J*', 'IY'], type: 'CV' },
  H: { segments: ['EY', 'CH'], type: 'VC' },
  I: { segments: ['AY'],       type: 'V' },
  J: { segments: ['J*', 'EY'], type: 'CV' },
  K: { segments: ['K*', 'EY'], type: 'CV' },
  L: { segments: ['EH', 'L*'], type: 'VC' },
  M: { segments: ['EH', 'M*'], type: 'VC' },
  N: { segments: ['EH', 'N*'], type: 'VC' },
  O: { segments: ['OW'],       type: 'V' },
  P: { segments: ['P*', 'IY'], type: 'CV' },
  Q: { segments: ['K*', 'UW'], type: 'CVC' },   // K* + Y* + UW — extract K*, UW
  R: { segments: ['AA', 'R*'], type: 'VC' },
  S: { segments: ['EH', 'S*'], type: 'VC' },
  T: { segments: ['T*', 'IY'], type: 'CV' },
  U: { segments: ['Y*', 'UW'], type: 'GV' },     // "yoo" — glide + vowel
  V: { segments: ['V*', 'IY'], type: 'CV' },
  W: { segments: [],           type: 'SKIP' },    // "double-u" — too complex
  X: { segments: [],           type: 'SKIP' },    // EH + K* + S* — complex cluster
  Y: { segments: ['W*', 'AY'], type: 'GV' },     // "why" — W* glide + AY
  Z: { segments: ['Z*', 'IY'], type: 'CV' },
};

// ============================================================================
// Frame Processing
// ============================================================================

/**
 * Find the boundary between consonant and vowel in a CV (consonant-vowel) sequence.
 * Returns the index of the first frame that is voiced with energy above threshold.
 */
function findCVBoundary(frames: LPCFrame[]): number {
  // Energy threshold: frames with energy >= 6 and voiced are likely vowel
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i].unvoiced && frames[i].energy >= 6 && frames[i].pitch > 0) {
      return i;
    }
  }
  // Fallback: split at 30% mark
  return Math.floor(frames.length * 0.3);
}

/**
 * Find the boundary between vowel and consonant in a VC (vowel-consonant) sequence.
 * Returns the index of the last voiced frame with energy above threshold.
 */
function findVCBoundary(frames: LPCFrame[], nextPhonemeCode?: string): number {
  // For liquids/glides (R*, L*, W*, Y*), the consonant maintains voicing
  // but formants shift. Detect spectral change instead of just voiced/energy.
  const isLiquidOrGlide = nextPhonemeCode && ['R*', 'RX', 'L*', 'LX', 'W*', 'WX', 'Y*', 'YX'].includes(nextPhonemeCode);

  if (isLiquidOrGlide) {
    // Scan from middle toward end: find where K1/K2 shift significantly
    // (vowel -> liquid formant transition)
    const mid = Math.floor(frames.length * 0.5);
    for (let i = mid; i < frames.length - 1; i++) {
      if (frames[i].energy === 0 || frames[i + 1].energy === 0) continue;
      const kDist = kIndexDistance(frames[i].k, frames[i + 1].k);
      if (kDist > 0.15) { // Significant formant shift
        return i + 1;
      }
    }
    // Fallback: last third
    return Math.floor(frames.length * 0.67);
  }

  // Standard VC: scan from end for last voiced frame with good energy
  for (let i = frames.length - 1; i >= 0; i--) {
    if (!frames[i].unvoiced && frames[i].energy >= 6 && frames[i].pitch > 0) {
      return i + 1; // Boundary is AFTER this frame
    }
  }
  // Fallback: split at 70% mark
  return Math.floor(frames.length * 0.7);
}

/**
 * Extract the middle portion of a frame segment, skipping coarticulation
 * at the edges. Takes roughly the middle 60% of frames.
 */
function extractMiddle(frames: LPCFrame[]): LPCFrame[] {
  if (frames.length <= 2) return frames;
  const skip = Math.max(1, Math.floor(frames.length * 0.2));
  return frames.slice(skip, frames.length - skip);
}

// ============================================================================
// Frame Interpolation & Manipulation
// ============================================================================

/** K index clamping ranges live in ROMWordAligner (imported as K_MAX). */

function clampK(k: number[], i: number): number {
  return Math.min(Math.max(Math.round(k[i] ?? 0), 0), K_MAX[i]);
}

/**
 * Linear interpolation between two TMS5220 frames.
 * Interpolates K1-K10, energy, pitch with proper clamping.
 * Voicing follows source for t<0.5, target for t>=0.5.
 */
function interpolateFrames(a: TMS5220Frame, b: TMS5220Frame, t: number): TMS5220Frame {
  const k: number[] = [];
  for (let i = 0; i < 10; i++) {
    const val = (a.k[i] ?? 0) * (1 - t) + (b.k[i] ?? 0) * t;
    k.push(Math.min(Math.max(Math.round(val), 0), K_MAX[i]));
  }

  const energy = Math.min(Math.max(Math.round(a.energy * (1 - t) + b.energy * t), 0), 14);
  const pitch = Math.min(Math.max(Math.round(a.pitch * (1 - t) + b.pitch * t), 0), 31);
  const unvoiced = t < 0.5 ? a.unvoiced : b.unvoiced;

  return { k, energy, pitch, unvoiced, durationMs: 25 };
}

/**
 * Convert a single static fallback frame into a multi-frame sequence (3-6 frames)
 * with subtle K1/K2 oscillation to give the MAME interpolation engine natural
 * variation instead of identical repeated frames.
 */
function generateStaticFrames(baseFrame: TMS5220Frame, pClass: PhonemeClass): TMS5220Frame[] {
  // Determine frame count based on phoneme class
  let count: number;
  switch (pClass) {
    case 'vowel': case 'diphthong': count = 6; break;
    case 'nasal': case 'liquid': count = 5; break;
    case 'fricative': count = 4; break;
    case 'glide': count = 4; break;
    case 'stop': case 'affricate': count = 3; break;
    default: count = 3; break;
  }

  const frames: TMS5220Frame[] = [];
  for (let i = 0; i < count; i++) {
    const phase = (i / count) * Math.PI * 2;
    const k = [...baseFrame.k];
    // Subtle ±1 oscillation on K1 and K2 (sine/cosine pattern)
    k[0] = clampK(k, 0) + Math.round(Math.sin(phase));
    k[0] = Math.min(Math.max(k[0], 0), K_MAX[0]);
    k[1] = clampK(k, 1) + Math.round(Math.cos(phase));
    k[1] = Math.min(Math.max(k[1], 0), K_MAX[1]);

    frames.push({
      k,
      energy: baseFrame.energy,
      pitch: baseFrame.pitch,
      unvoiced: baseFrame.unvoiced,
      durationMs: 25,
    });
  }
  return frames;
}

/**
 * Resample frames to a target count via linear interpolation.
 * Used for ROM compression and stress-based duration scaling.
 * Minimum 1 frame output.
 */
function resampleFrames(frames: TMS5220Frame[], targetCount: number): TMS5220Frame[] {
  const target = Math.max(1, Math.round(targetCount));
  if (frames.length === 0) return [];
  if (frames.length === 1 || target === 1) {
    return [{ ...frames[0], k: [...frames[0].k], durationMs: 25 }];
  }
  if (target === frames.length) {
    return frames.map(f => ({ ...f, k: [...f.k], durationMs: 25 }));
  }

  const result: TMS5220Frame[] = [];
  for (let i = 0; i < target; i++) {
    const srcPos = (i / (target - 1)) * (frames.length - 1);
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    if (srcIdx >= frames.length - 1) {
      const last = frames[frames.length - 1];
      result.push({ ...last, k: [...last.k], durationMs: 25 });
    } else {
      result.push(interpolateFrames(frames[srcIdx], frames[srcIdx + 1], frac));
    }
  }
  return result;
}

/**
 * Compress ROM-extracted frames to ~65% of original count.
 * Letter recordings are deliberately enunciated; this brings them to conversational pace.
 */
function compressROMFrames(frames: TMS5220Frame[], ratio = 0.65): TMS5220Frame[] {
  if (frames.length <= 2) return frames.map(f => ({ ...f, k: [...f.k] }));
  return resampleFrames(frames, frames.length * ratio);
}

/**
 * Scale frame count by a stress-based duration multiplier.
 */
function scaleFrameCount(frames: TMS5220Frame[], scale: number): TMS5220Frame[] {
  if (frames.length <= 1 || scale === 1.0) {
    return frames.map(f => ({ ...f, k: [...f.k] }));
  }
  return resampleFrames(frames, frames.length * scale);
}

/**
 * Minimum frame count per phoneme class — the floor the static path already
 * targets (vowels 6, consonants 3-5). ROM extractions occasionally come back
 * 1-2 frames (25-50ms): a sub-audible click, not a phoneme. Hold/stretch them
 * to the class minimum so vowels stay audible.
 */
/**
 * Tempo for mined runs at synthesis: fraction of the recording's own frame
 * count. The static path has always compressed to 0.65; mined runs read
 * slightly clearer, so they keep a bit more.
 */
export const MINED_TEMPO = 0.7;

/**
 * Shortest mined run that may outrank the curated static table. Below this a
 * run is a single snapshot rather than a formant trajectory, which is the one
 * case the static table does better (see buildFramesFromROMLibrary).
 */
export const MIN_MINED_RUN_FRAMES = 2;

const MIN_FRAMES_BY_CLASS: Record<PhonemeClass, number> = {
  vowel: 4,
  diphthong: 4,
  nasal: 3,
  liquid: 3,
  glide: 3,
  fricative: 3,
  stop: 3,
  affricate: 3,
  pause: 2,
  other: 3,
};

function enforceMinFrames(frames: TMS5220Frame[], pClass: PhonemeClass): TMS5220Frame[] {
  const min = MIN_FRAMES_BY_CLASS[pClass] ?? 3;
  if (frames.length >= min) return frames;
  // A run carrying closure silence (mined stops) must not be resampled:
  // interpolating silence into the burst manufactures half-loud "closure"
  // frames, which un-does the closure. Lengthen the closure itself instead.
  if (frames.some(f => f.energy === 0)) {
    const padded = frames.map(f => ({ ...f, k: [...f.k] }));
    while (padded.length < min) {
      padded.unshift({ ...frames[0], k: [...frames[0].k] });
    }
    return padded;
  }
  if (frames.length === 1) {
    // Single frame: hold it as identical copies — interpolation has no
    // second point to work with.
    const copies: TMS5220Frame[] = [];
    for (let i = 0; i < min; i++) {
      copies.push({ ...frames[0], k: [...frames[0].k] });
    }
    return copies;
  }
  return resampleFrames(frames, min);
}

/**
 * Map SAM stress level (0-8) to duration multiplier.
 */
function getStressDurationScale(stress: number): number {
  if (stress <= 0) return 0.80;
  if (stress <= 2) return 0.90;
  if (stress <= 4) return 1.00;
  if (stress <= 6) return 1.15;
  return 1.30;
}

/**
 * Shape energy contour per phoneme type for natural attack/sustain/release.
 * Energy minimum clamped to 1 (never creates silence mid-phoneme).
 */
function applyEnergyEnvelope(frames: TMS5220Frame[], pClass: PhonemeClass): TMS5220Frame[] {
  if (frames.length <= 1) return frames;

  return frames.map((f, i) => {
    const pos = i / (frames.length - 1); // 0.0 → 1.0
    let scale = 1.0;

    switch (pClass) {
      case 'vowel':
      case 'diphthong':
        // Gentle onset (0.6→1.0 over first 20%), sustain, gentle offset (1.0→0.6 over last 25%)
        if (pos < 0.2) {
          scale = 0.6 + (pos / 0.2) * 0.4;
        } else if (pos > 0.75) {
          scale = 0.6 + ((1.0 - pos) / 0.25) * 0.4;
        }
        break;

      case 'stop':
        // Sharp attack, gradual decay
        if (pos < 0.1) {
          scale = 0.8 + (pos / 0.1) * 0.2;
        } else {
          scale = 1.0 - (pos - 0.1) * 0.3;
        }
        break;

      case 'fricative':
        // Gradual onset (30%), sustain, gradual offset
        if (pos < 0.3) {
          scale = 0.5 + (pos / 0.3) * 0.5;
        } else if (pos > 0.75) {
          scale = 0.5 + ((1.0 - pos) / 0.25) * 0.5;
        }
        break;

      case 'affricate':
        // Like stop but slightly slower attack
        if (pos < 0.15) {
          scale = 0.7 + (pos / 0.15) * 0.3;
        } else {
          scale = 1.0 - (pos - 0.15) * 0.25;
        }
        break;

      case 'nasal':
      case 'liquid':
      case 'glide':
        // Very gradual onset/offset
        if (pos < 0.25) {
          scale = 0.7 + (pos / 0.25) * 0.3;
        } else if (pos > 0.8) {
          scale = 0.7 + ((1.0 - pos) / 0.2) * 0.3;
        }
        break;
    }

    const scaledEnergy = Math.max(1, Math.min(14, Math.round(f.energy * scale)));
    return { ...f, k: [...f.k], energy: scaledEnergy };
  });
}

/**
 * Apply subtle ±1 pitch index declination for voiced frames.
 * Creates natural falling intonation within each phoneme.
 */
function applyPitchContour(frames: TMS5220Frame[], pClass: PhonemeClass): TMS5220Frame[] {
  if (frames.length <= 2) return frames.map(f => ({ ...f, k: [...f.k] }));

  return frames.map((f, i) => {
    // Don't touch unvoiced frames or zero-pitch frames
    if (f.unvoiced || f.pitch === 0) {
      return { ...f, k: [...f.k] };
    }

    const pos = i / (frames.length - 1);
    let pitchOffset = 0;

    switch (pClass) {
      case 'vowel':
      case 'diphthong':
        // +1 at start → -1 at end (natural falling intonation)
        pitchOffset = Math.round(1 - pos * 2);
        break;
      case 'nasal':
      case 'liquid':
        // Flat then -1 at end
        if (pos > 0.7) pitchOffset = -1;
        break;
    }

    const newPitch = Math.min(31, Math.max(1, f.pitch + pitchOffset));
    return { ...f, k: [...f.k], pitch: newPitch };
  });
}

// ============================================================================
// Coarticulation Transitions
// ============================================================================

/** Processed segment for transition insertion */
interface PhonemeSegment {
  code: string;
  pClass: PhonemeClass;
  frames: TMS5220Frame[];
  /** True when frames came from the ROM library (authentic, no synthetic shaping). */
  romSourced: boolean;
}

/**
 * Determine how many transition frames to insert between two phoneme segments.
 */
function getTransitionCount(prev: PhonemeSegment, next: PhonemeSegment): number {
  const pc = prev.pClass;
  const nc = next.pClass;

  // Pause boundaries: no transitions
  if (pc === 'pause' || nc === 'pause') return 0;

  // Two authentic ROM segments abut at a splice between recordings — there is
  // no natural transition there (each segment carries its own recording's
  // context). A light bridge smooths the discontinuity instead of letting it
  // click; the class rules below decide how heavy it should be.

  // Stop → anything: no transitions (stops have natural bursts)
  if (pc === 'stop') return 0;

  // Anything → stop: 1 transition (brief closure)
  if (nc === 'stop') return 1;

  // Voiced ↔ unvoiced: 1 bridge frame with reduced energy
  const prevVoiced = prev.frames.length > 0 && !prev.frames[prev.frames.length - 1].unvoiced;
  const nextVoiced = next.frames.length > 0 && !next.frames[0].unvoiced;
  if (prevVoiced !== nextVoiced) return 1;

  // Sonorant ↔ sonorant (vowel, nasal, liquid, glide, diphthong): 2 transitions
  const sonorants: PhonemeClass[] = ['vowel', 'diphthong', 'nasal', 'liquid', 'glide'];
  if (sonorants.includes(pc) && sonorants.includes(nc)) return 2;

  // Default: 1 transition
  return 1;
}

/**
 * Insert interpolated transition frames between phoneme boundaries.
 * This eliminates hard discontinuities that cause clicks.
 */
function insertTransitions(segments: PhonemeSegment[]): TMS5220Frame[] {
  if (segments.length === 0) return [];

  const result: TMS5220Frame[] = [];

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    if (seg.frames.length === 0) continue;

    // Add this segment's frames
    for (const f of seg.frames) {
      result.push({ ...f, k: [...f.k] });
    }

    // Insert transition to next segment
    if (s < segments.length - 1) {
      const next = segments[s + 1];
      if (next.frames.length === 0) continue;

      // Stop/affricate closure: a plosive is closure silence followed by a
      // burst. The old code interpolated an audible frame here and called it a
      // "brief closure" — at energy >= 1 there is no closure, which is why
      // P/T/K/B/D/G came out mushy. Insert real silence (the packer and the
      // MAME core both handle mid-utterance energy 0) unless the segment
      // already begins with its own mined closure. Pauses provide the gap
      // themselves.
      const nextClass = next.pClass;
      if ((nextClass === 'stop' || nextClass === 'affricate')
          && seg.pClass !== 'pause'
          && next.frames[0].energy > 0) {
        result.push({
          k: [...next.frames[0].k], // irrelevant during silence; preps the burst
          energy: 0,
          pitch: 0,
          unvoiced: true,
          durationMs: 25,
        });
        continue;
      }

      const count = getTransitionCount(seg, next);
      if (count === 0) continue;

      const lastFrame = seg.frames[seg.frames.length - 1];
      const firstFrame = next.frames[0];

      for (let t = 0; t < count; t++) {
        const frac = (t + 1) / (count + 1);
        const interp = interpolateFrames(lastFrame, firstFrame, frac);

        // For voiced↔unvoiced bridges, reduce energy to mask the switch
        if (lastFrame.unvoiced !== firstFrame.unvoiced) {
          interp.energy = Math.max(1, Math.round(interp.energy * 0.6));
        }

        result.push(interp);
      }
    }
  }

  return result;
}

// ============================================================================
// Segmentation
// ============================================================================

/**
 * Segment one letter's ROM frames into individual phoneme segments.
 *
 * @param letter - The letter (A-Z)
 * @param frames - Raw LPC frames from the ROM recording of this letter
 * @returns Map of phoneme code → extracted LPC frames
 */
export function segmentLetterFrames(
  letter: string,
  frames: LPCFrame[]
): Map<string, LPCFrame[]> {
  const result = new Map<string, LPCFrame[]>();

  const decomp = LETTER_PHONEME_MAP[letter.toUpperCase()];
  if (!decomp || decomp.type === 'SKIP' || decomp.segments.length === 0) {
    return result;
  }

  // Resolve repeats and trim silence
  const resolved = resolveRepeatFrames(frames);
  const trimmed = trimSilence(resolved);
  if (trimmed.length < 2) return result;

  switch (decomp.type) {
    case 'V': {
      // Pure vowel — all frames are the vowel
      const middle = extractMiddle(trimmed);
      if (middle.length > 0) {
        result.set(decomp.segments[0], middle);
      }
      break;
    }

    case 'CV': {
      // Consonant-vowel (e.g. B=B*+IY, D=D*+IY)
      const boundary = findCVBoundary(trimmed);
      const consonantFrames = trimmed.slice(0, boundary);
      const vowelFrames = trimmed.slice(boundary);

      if (consonantFrames.length > 0) {
        // For stops/affricates, take all consonant frames (they're short)
        result.set(decomp.segments[0], consonantFrames);
      }
      if (vowelFrames.length > 0) {
        const middle = extractMiddle(vowelFrames);
        if (middle.length > 0) {
          result.set(decomp.segments[1], middle);
        }
      }
      break;
    }

    case 'VC': {
      // Vowel-consonant (e.g. F=EH+F*, L=EH+L*, R=AA+R*)
      const boundary = findVCBoundary(trimmed, decomp.segments[1]);
      const vowelFrames = trimmed.slice(0, boundary);
      const consonantFrames = trimmed.slice(boundary);

      if (vowelFrames.length > 0) {
        const middle = extractMiddle(vowelFrames);
        if (middle.length > 0) {
          result.set(decomp.segments[0], middle);
        }
      }
      if (consonantFrames.length > 0) {
        result.set(decomp.segments[1], consonantFrames);
      }
      break;
    }

    case 'CVC': {
      // Q = K* + (Y*) + UW — extract first consonant and final vowel
      const cvBound = findCVBoundary(trimmed);
      const consonantFrames = trimmed.slice(0, cvBound);
      // For UW, take the latter half of the voiced section
      const voicedSection = trimmed.slice(cvBound);
      const midpoint = Math.floor(voicedSection.length / 2);
      const vowelFrames = voicedSection.slice(midpoint);

      if (consonantFrames.length > 0) {
        result.set(decomp.segments[0], consonantFrames);
      }
      if (vowelFrames.length > 0) {
        const middle = extractMiddle(vowelFrames);
        if (middle.length > 0) {
          result.set(decomp.segments[1], middle);
        }
      }
      break;
    }

    case 'GV': {
      // Glide + vowel (U=Y*+UW, Y=W*+AY)
      // Glides transition smoothly, so split roughly 30/70
      const boundary = Math.max(1, Math.floor(trimmed.length * 0.3));
      const glideFrames = trimmed.slice(0, boundary);
      const vowelFrames = trimmed.slice(boundary);

      if (glideFrames.length > 0) {
        result.set(decomp.segments[0], glideFrames);
      }
      if (vowelFrames.length > 0) {
        const middle = extractMiddle(vowelFrames);
        if (middle.length > 0) {
          result.set(decomp.segments[1], middle);
        }
      }
      break;
    }
  }

  return result;
}

// ============================================================================
// Phoneme Library Extraction
// ============================================================================

/**
 * Convert LPCFrame[] (ROM format) to TMS5220Frame[] (synth format).
 * Adds durationMs=25 per frame and drops the repeat field.
 *
 * Silent frames (energy 0) are dropped by default — for vowels and other
 * continuants they are dead air between recordings. Stop and affricate
 * segments pass keepSilence=true: their closure silence IS the consonant
 * (a /p/ with no closure is just a puff), so it must survive mining.
 */
export function lpcToTMS5220Frames(lpcFrames: LPCFrame[], keepSilence = false): TMS5220Frame[] {
  return lpcFrames
    .filter(f => keepSilence || f.energy > 0)
    .map(f => ({
      k: f.k.length >= 10 ? [...f.k] : [...f.k, ...Array(10 - f.k.length).fill(0)],
      energy: f.energy,
      pitch: f.pitch,
      unvoiced: f.unvoiced,
      durationMs: 25,
    }));
}

/**
 * Process all 26 letter recordings from the ROM and extract a phoneme library.
 *
 * @param romWords - The first 26 VSMWord entries (A-Z letter recordings)
 * @returns Map of SAM phoneme code → TMS5220Frame[] with authentic ROM LPC data
 */
export function extractPhonemeLibrary(
  romWords: VSMWord[]
): Map<string, TMS5220Frame[]> {
  const library = new Map<string, TMS5220Frame[]>();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < Math.min(26, romWords.length); i++) {
    const letter = letters[i];
    const word = romWords[i];

    // Verify the word name matches the expected letter
    if (word.name.toUpperCase() !== letter) {
      console.warn(`[ROMPhonemeExtractor] Expected letter "${letter}" but got "${word.name}" at index ${i}, skipping`);
      continue;
    }

    const segments = segmentLetterFrames(letter, word.frames);

    for (const [phonemeCode, lpcFrames] of segments) {
      // Only store if we got meaningful frames (at least 1)
      if (lpcFrames.length === 0) continue;

      const tmsFrames = lpcToTMS5220Frames(lpcFrames);
      if (tmsFrames.length === 0) continue;

      // If we already have this phoneme, keep the one with more frames
      // (more frames = more stable extraction, less coarticulation noise)
      const existing = library.get(phonemeCode);
      if (!existing || tmsFrames.length > existing.length) {
        library.set(phonemeCode, tmsFrames);
      }
    }
  }

  return library;
}

/**
 * Build TMS5220 frames for a phoneme token sequence, using ROM-extracted frames
 * when available and falling back to static approximations.
 *
 * Pipeline per phoneme:
 *   1. Take the mined run, or generate a multi-frame static sequence
 *   2. Scale frame count by stress-based duration
 *   3. Floor the segment to its class minimum
 *   4. Static only: stress energy boost (+2 for stress >= 4) and pitch accent
 *   5. Static only: 65% tempo compression, energy envelope, micro-pitch contour
 *
 * Then across all segments:
 *   7. Insert coarticulation transitions between phoneme pairs
 *
 * @param tokens - Phoneme tokens from SAM/Reciter
 * @param romLibrary - ROM-extracted phoneme library (may be null for full fallback)
 * @param staticFallback - Function to get static approximation for a SAM code
 * @returns TMS5220Frame[] ready for the MAME frame buffer
 */
export function buildFramesFromROMLibrary(
  tokens: Array<{ code: string; stress: number }>,
  romLibrary: Map<string, TMS5220Frame[]>,
  staticFallback: (code: string) => TMS5220Frame | null
): TMS5220Frame[] {
  // SAM emits a pause token for every word boundary and punctuation mark, so a
  // single space in the input becomes two or three consecutive ' ' tokens.
  // Collapse those into one word-boundary pause and drop leading/trailing ones —
  // otherwise every inter-word gap and the sentence lead-in drag on for 100ms+.
  const collapsed: typeof tokens = [];
  for (const token of tokens) {
    if (token.code === ' ') {
      if (collapsed.length > 0 && collapsed[collapsed.length - 1].code !== ' ') collapsed.push(token);
    } else {
      collapsed.push(token);
    }
  }
  while (collapsed.length > 0 && collapsed[0].code === ' ') collapsed.shift();
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].code === ' ') collapsed.pop();

  const segments: PhonemeSegment[] = [];

  // Phrase-final lengthening (Klatt): the last syllable before a pause or the
  // end of the utterance stretches — the final vowel most, its coda a little.
  // Flat rhythm with a hard stop is one of the strongest "machine" tells.
  const finalScale = buildFinalLengthening(collapsed.map(t => t.code));

  for (let ti = 0; ti < collapsed.length; ti++) {
    const token = collapsed[ti];
    const pClass = getPhonemeClass(token.code);
    const romFrames = romLibrary.get(token.code);

    let frames: TMS5220Frame[];
    let romSourced = false;

    // ROM-mined runs first, static table as the fallback for codes the library
    // lacks. Decided by leave-one-out measurement, not by preference: for each
    // of 128 vocabulary words, mine the library from every recording EXCEPT that
    // word, rebuild the word from its G2P phonemes under both precedences and
    // compare each against the word's real ROM frames by DTW
    // (tools/tms5220-audit/holdoutReconstruction.ts). Library-first is closer on
    // 126 of 128 unseen words: mean 0.1199 against 0.1706.
    //
    // Both earlier oracles said the opposite for the same circular reason. The
    // in-sample reconstruction mines from the words it rebuilds, so the library
    // cannot lose; the letter oracle compares against the letter recordings the
    // static table was calibrated from (4d501b6db), so static cannot lose. The
    // hold-out removes the word being rebuilt from the training set.
    //
    // A single static frame cannot represent a phoneme that IS a trajectory —
    // diphthongs and stop bursts are defined by their movement — which is what
    // the mined multi-frame runs carry and generateStaticFrames only imitates.
    // One exception, and it is the reason the old precedence existed: a
    // single-frame mined run carries no trajectory at all, so it is a snapshot —
    // exactly what the curated table already provides, and better. The mined R*
    // is one 25 ms frame at k2=28, an /i/-fronted shape that renders as a hollow
    // whistle; IH, IX and RX are the same shape of accident. Those fall through.
    const staticFrame = staticFallback(token.code);
    if (romFrames && romFrames.length >= MIN_MINED_RUN_FRAMES) {
      frames = romFrames.map(f => ({ ...f, k: [...f.k] }));
      romSourced = true;
      // Conversational tempo: the recordings are the toy's deliberate
      // teaching voice — a single mined vowel runs up to 13 frames (325 ms),
      // so unshaped playback talks in slow motion. Resampling changes tempo
      // only (shape and endpoints survive); the class-minimum floor below
      // still guarantees audibility. Closure-bearing stop runs stay untouched
      // — resampling would interpolate the silence into the burst, and stops
      // are short anyway.
      if (!frames.some(f => f.energy === 0)) {
        frames = compressROMFrames(frames, MINED_TEMPO);
      }
    } else if (staticFrame) {
      // No mined run for this code: synthesise from the curated table.
      frames = generateStaticFrames(staticFrame, pClass);
    } else {
      continue;
    }

    // Step 3: Scale duration by stress and phrase-final position. Runs
    // carrying closure silence (mined stops) are exempt — resampling would
    // interpolate the silence into the burst, and a stop's duration does not
    // stretch with stress anyway.
    const durationScale = getStressDurationScale(token.stress) * finalScale[ti];
    if (durationScale !== 1.0 && !frames.some(f => f.energy === 0)) {
      frames = scaleFrameCount(frames, durationScale);
    }

    // Some extractions (and stress-shrunk segments) come back 1-2 frames
    // (25-50ms) — a sub-audible click, not a phoneme. Floor every segment to
    // the class minimum so "is"/"iss" keep a real vowel. Pauses are deliberate
    // gaps and must stay short.
    if (token.code !== ' ') frames = enforceMinFrames(frames, pClass);

    if (!romSourced) {
      // Static frames: apply stress boosts and synthetic prosody
      // Step 4: Apply stress energy boost
      if (token.stress >= 4) {
        frames = frames.map(f => ({
          ...f,
          k: [...f.k],
          energy: Math.min(14, f.energy + 2),
        }));
      }

      // Step 4b: Stress pitch accent — SAM stress >= 4 also lifts pitch, the
      // melodic counterpart to the energy boost above. Voiced frames only.
      if (token.stress >= 4) {
        const accent = token.stress >= 6 ? 3 : 2;
        frames = frames.map(f => {
          if (f.pitch <= 0) return f;
          return { ...f, pitch: Math.max(1, Math.min(31, f.pitch + accent)) };
        });
      }

      // Static frames: compensate for the flat table so they read as speech.
      frames = compressROMFrames(frames);
      frames = applyEnergyEnvelope(frames, pClass);
      frames = applyPitchContour(frames, pClass);
    }
    // romSourced frames: keep authentic prosody — no stress boosts, no synthetic envelope/contour

    segments.push({ code: token.code, pClass, frames, romSourced });
  }

  // Step 7: Insert coarticulation transitions between phoneme pairs. Only
  // bridge pairs that involve a static-sourced segment — authentic ROM frames
  // already contain the real transition into their neighbours.
  return insertTransitions(segments);
}

// ============================================================================
// Word & Phrase Mining (aligner-based, 2026-08-20)
// ============================================================================
//
// The letter recordings alone cover 16 phonemes. The VSM's 117 spelled words, 11
// digits and 16 phrases cover the rest — but only if each recording's frames are
// assigned to its phonemes correctly. The reverted attempt (d3beb83f9) split
// proportionally and produced alien chatter; this pipeline force-aligns the G2P
// phoneme sequence onto frame-domain evidence (ROMWordAligner) and drops any
// recording whose best alignment is unconvincing.

export interface PhonemeProvenance {
  source: 'letter' | 'word' | 'phrase' | 'derived';
  /** Recordings the exemplar was mined from, or a derivation note. */
  words: string[];
}

export interface PhonemeLibraryResult {
  library: Map<string, TMS5220Frame[]>;
  provenance: Map<string, PhonemeProvenance>;
  /** Speakable recordings whose alignment was rejected by the cost ceiling. */
  droppedWords: string[];
}

interface MinedCandidate {
  frames: TMS5220Frame[];
  word: string;
  cost: number;
}

/** Cluster compactness gate: mean run-distance to the medoid above which a
 *  mined cluster is coarticulation mush, not a phoneme. */
export const CLUSTER_TOLERANCE = 0.35;

/** Strip the phrase-table quoting and decide whether a name is speakable text. */
function speakableText(name: string): string | null {
  const cleaned = name.replace(/"/g, '').toUpperCase().trim();
  return cleaned.length > 0 && /^[A-Z' ]+$/.test(cleaned) ? cleaned : null;
}

/**
 * Distance between two exemplar frame runs: resampled to a common length, then
 * mean per-frame K distance with energy and voicing disagreement folded in.
 *
 * Silence frames (energy 0) are excluded from both sides first: a closure
 * carries no spectrum, so comparing a closure-bearing stop against a burst-only
 * cut of the same phoneme must not read as a spectral mismatch.
 */
export function runDistance(rawA: TMS5220Frame[], rawB: TMS5220Frame[]): number {
  const a = rawA.filter(f => f.energy > 0);
  const b = rawB.filter(f => f.energy > 0);
  const len = Math.min(a.length, b.length);
  if (len === 0) return 1;
  const ra = resampleFrames(a, len);
  const rb = resampleFrames(b, len);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += kIndexDistance(ra[i].k, rb[i].k)
      + 0.5 * Math.abs(ra[i].energy - rb[i].energy) / 14
      + (ra[i].unvoiced !== rb[i].unvoiced ? 0.5 : 0);
  }
  return sum / len;
}

/** The candidate minimizing total distance to all others — a real recorded
 *  frame run, never an average. */
function pickMedoid(candidates: MinedCandidate[]): MinedCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  let best: MinedCandidate | null = null;
  let bestSum = Infinity;
  for (const c of candidates) {
    let sum = 0;
    for (const o of candidates) {
      if (o !== c) sum += runDistance(c.frames, o.frames);
    }
    if (sum < bestSum) { bestSum = sum; best = c; }
  }
  return best;
}

/**
 * Mine every speakable ROM recording through the forced aligner.
 * Letters are included — their aligner-mined segments feed the oracle
 * cross-check against the hand-verified letter path.
 */
export function extractWordPhonemeLibrary(
  romWords: VSMWord[],
): { candidates: Map<string, MinedCandidate[]>; dropped: string[] } {
  const candidates = new Map<string, MinedCandidate[]>();
  const dropped: string[] = [];

  for (const word of romWords) {
    const text = speakableText(word.name);
    if (!text) continue;

    const phonemeStr = textToPhonemes(text);
    if (!phonemeStr) { dropped.push(text); continue; }

    const tokens = parsePhonemeString(phonemeStr);
    const alignment = alignPhonemesToFrames(tokens, word.frames);
    if (!alignment) { dropped.push(text); continue; }

    for (const seg of alignment.segments) {
      if (seg.code === ' ') continue;
      const segFrames = alignment.frames.slice(seg.start, seg.end);
      // Sonorants keep their steady-state middle; stops/fricatives keep the
      // whole (short) segment, burst included.
      const cls = getPhonemeClass(seg.code);
      const steady = cls === 'vowel' || cls === 'diphthong' || cls === 'nasal'
        || cls === 'liquid' || cls === 'glide';
      const use = steady ? extractMiddle(segFrames) : segFrames;
      // Stops/affricates keep their closure silence — it is part of the sound.
      const keepSilence = cls === 'stop' || cls === 'affricate';
      let tmsFrames = lpcToTMS5220Frames(use, keepSilence);
      // Trailing silence is the join to the next phoneme, not the consonant.
      while (tmsFrames.length > 0 && tmsFrames[tmsFrames.length - 1].energy === 0) tmsFrames.pop();
      if (tmsFrames.length === 0 || tmsFrames.every(f => f.energy === 0)) continue;

      const list = candidates.get(seg.code) ?? [];
      list.push({ frames: tmsFrames, word: text, cost: alignment.perPhonemeCost });
      candidates.set(seg.code, list);
    }
  }

  return { candidates, dropped };
}

/**
 * Fill the codes no recording exercises (13 for the snspell ROM) from mined
 * bases. A transformed real frame beats an invented one; anything still open
 * after this falls back to the static table at synthesis time.
 */
export function completeLibrary(
  library: Map<string, TMS5220Frame[]>,
  provenance: Map<string, PhonemeProvenance>,
): void {
  const cloneRun = (frames: TMS5220Frame[]): TMS5220Frame[] =>
    frames.map(f => ({ ...f, k: [...f.k] }));

  // Allophone aliases — acoustically near-identical to their base phoneme.
  const ALIAS: Record<string, string> = {
    'IX': 'IH', 'UX': 'UW', 'RX': 'R*', 'LX': 'L*', 'WX': 'W*', 'YX': 'Y*',
    'KX': 'K*', '/X': '/H',
  };
  for (const [dst, src] of Object.entries(ALIAS)) {
    if (library.has(dst) || !library.has(src)) continue;
    library.set(dst, cloneRun(library.get(src)!));
    provenance.set(dst, { source: 'derived', words: [`alias of ${src}`] });
  }

  // DX (flap) — a truncated voiced stop.
  if (!library.has('DX') && library.has('D*')) {
    library.set('DX', cloneRun(library.get('D*')!).slice(0, 2));
    provenance.set('DX', { source: 'derived', words: ['truncated D*'] });
  }

  // WH — unvoiced W (SAM's /hw/).
  if (!library.has('WH') && library.has('W*')) {
    library.set('WH', library.get('W*')!.map(f => ({
      ...f, k: [...f.k], pitch: 0, unvoiced: true, energy: Math.max(1, f.energy - 3),
    })));
    provenance.set('WH', { source: 'derived', words: ['unvoiced W*'] });
  }

  // OY — the one diphthong no recording holds; glide mined AO into mined IY.
  if (!library.has('OY') && library.has('AO') && library.has('IY')) {
    library.set('OY', [...cloneRun(library.get('AO')!), ...cloneRun(library.get('IY')!)]);
    provenance.set('OY', { source: 'derived', words: ['AO+IY glide'] });
  }

  // Q* (glottal stop) — a brief closure, not a spectrum. Real silence: the
  // packer passes energy 0 through (the old energy-1 was the packer's floor).
  if (!library.has('Q*')) {
    library.set('Q*', [
      { k: [8, 8, 8, 8, 8, 8, 8, 4, 4, 4], energy: 0, pitch: 0, unvoiced: true, durationMs: 25 },
      { k: [8, 8, 8, 8, 8, 8, 8, 4, 4, 4], energy: 0, pitch: 0, unvoiced: true, durationMs: 25 },
    ]);
    provenance.set('Q*', { source: 'derived', words: ['closure silence'] });
  }

  // Pause token — used by phrase alignment and synthesis transitions. Real
  // silence, not the quiet hum the old packer floor turned it into. A pause
  // also serves as the closure for a following word-initial stop.
  if (!library.has(' ')) {
    library.set(' ', [
      { k: [8, 8, 8, 8, 8, 8, 8, 4, 4, 4], energy: 0, pitch: 0, unvoiced: false, durationMs: 25 },
      { k: [8, 8, 8, 8, 8, 8, 8, 4, 4, 4], energy: 0, pitch: 0, unvoiced: false, durationMs: 25 },
    ]);
    provenance.set(' ', { source: 'derived', words: ['pause silence'] });
  }

  // G* (voiced velar stop) — no recording holds it; derive from mined K* (unvoiced velar).
  if (!library.has('G*') && library.has('K*')) {
    library.set('G*', library.get('K*')!.map(f => ({
      ...f, k: [...f.k], pitch: Math.max(1, f.pitch), unvoiced: false, energy: Math.min(14, f.energy + 1),
    })));
    provenance.set('G*', { source: 'derived', words: ['voiced K*'] });
  }
  // GX is the allophone of G*; the static table gives both identical coefficients.
  if (!library.has('GX') && library.has('G*')) {
    library.set('GX', library.get('G*')!.map(f => ({ ...f, k: [...f.k] })));
    provenance.set('GX', { source: 'derived', words: ['G* allophone'] });
  }

  // J* (voiced affricate) — no recording holds it; derive from mined CH (unvoiced affricate).
  if (!library.has('J*') && library.has('CH')) {
    library.set('J*', library.get('CH')!.map(f => ({
      ...f, k: [...f.k], pitch: Math.max(1, f.pitch), unvoiced: false, energy: Math.min(14, f.energy + 1),
    })));
    provenance.set('J*', { source: 'derived', words: ['voiced CH'] });
  }
}

/**
 * Build the full phoneme library for a parsed VSM: hand-verified letter
 * extraction first (authoritative), then aligner-mined words/phrases for
 * everything the letters don't cover, then derivations for the rest.
 */
export function buildCompletePhonemeLibrary(romWords: VSMWord[]): PhonemeLibraryResult {
  const library = new Map<string, TMS5220Frame[]>();
  const provenance = new Map<string, PhonemeProvenance>();

  // 1. Letters via the hand-verified decomposition path.
  const letterLib = extractPhonemeLibrary(romWords.slice(0, 26));
  const letterSources = new Map<string, string[]>();
  for (const [letter, decomp] of Object.entries(LETTER_PHONEME_MAP)) {
    for (const code of decomp.segments) {
      const list = letterSources.get(code) ?? [];
      list.push(letter);
      letterSources.set(code, list);
    }
  }
  for (const [code, frames] of letterLib) {
    library.set(code, frames);
    provenance.set(code, { source: 'letter', words: letterSources.get(code) ?? [] });
  }

  // 2. Aligner-mined words, digits and phrases fill the gaps — and REPLACE the
  // letter cuts for stops and affricates. A letter name puts its consonant
  // before one fixed front vowel ("pee", "tee", "kay"), and a stop's burst and
  // aspiration are filtered through the FOLLOWING vowel's tract shape, so the
  // letter cut is maximally context-coloured: the letter P* glides k2 16->21
  // toward /i/ (typed PETER read as "pweeter"), K* sits at k2=27 (the "kay"
  // palatal), B* is closure murmur with no burst at all. The medoid over
  // 17-44 word contexts is the context-neutral exemplar. Vowels, nasals and
  // liquids keep the letter cuts — their steady states are clean.
  const { candidates, dropped } = extractWordPhonemeLibrary(romWords);
  const preferWordMined = (code: string): boolean => {
    const cls = getPhonemeClass(code);
    return cls === 'stop' || cls === 'affricate';
  };
  for (const [code, cand] of candidates) {
    if (library.has(code) && !(preferWordMined(code) && cand.length >= 3)) continue;
    const medoid = pickMedoid(cand);
    if (!medoid) continue;
    if (cand.length >= 3) {
      const meanDist = cand.reduce((s, c) => s + runDistance(c.frames, medoid.frames), 0) / cand.length;
      if (meanDist > CLUSTER_TOLERANCE) continue; // mush cluster — fall through to derived/static
    }
    library.set(code, medoid.frames);
    const isPhrase = medoid.word.includes(' ');
    provenance.set(code, {
      source: isPhrase ? 'phrase' : 'word',
      words: cand.map(c => c.word).slice(0, 6),
    });
  }

  // 3. Derivations for codes no recording exercises.
  completeLibrary(library, provenance);

  return { library, provenance, droppedWords: dropped };
}

// ============================================================================
// Phrase-final lengthening (Q5 of the 2026-08-23 phoneme-quality plan)
// ============================================================================

/** Stretch on the last vowel/diphthong before a pause or the utterance end. */
export const FINAL_VOWEL_SCALE = 1.3;
/** Stretch on the consonants between that vowel and the boundary. */
export const FINAL_CODA_SCALE = 1.15;

/**
 * Per-token duration multipliers implementing phrase-final lengthening: for
 * each pause (and the end of the stream), the last vowel/diphthong before it
 * takes FINAL_VOWEL_SCALE and the tokens after that vowel up to the boundary
 * take FINAL_CODA_SCALE. Everything else stays 1.
 */
export function buildFinalLengthening(codes: string[]): number[] {
  const scales = codes.map(() => 1);
  for (let i = codes.length; i >= 0; i--) {
    const atBoundary = i === codes.length || codes[i] === ' ';
    if (!atBoundary) continue;
    // Scan back from the boundary to the last vowel of the word before it.
    for (let j = i - 1; j >= 0 && codes[j] !== ' '; j--) {
      const cls = getPhonemeClass(codes[j]);
      if (cls === 'vowel' || cls === 'diphthong') {
        scales[j] = FINAL_VOWEL_SCALE;
        for (let c = j + 1; c < i; c++) scales[c] = FINAL_CODA_SCALE;
        break;
      }
    }
  }
  return scales;
}
