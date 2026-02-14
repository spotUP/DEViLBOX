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
 * The buildFramesFromROMLibrary() pipeline applies 6 composable improvements:
 * 1. ROM frame compression (65% tempo for conversational pace)
 * 2. Stress-based duration scaling
 * 3. Stress energy boost
 * 4. Energy envelope shaping (attack/sustain/release per phoneme class)
 * 5. Micro-pitch contour (natural intonation)
 * 6. Coarticulation transitions between phoneme boundaries
 */

import type { LPCFrame, VSMWord } from './VSMROMParser';
import type { TMS5220Frame } from './tms5220PhonemeMap';

// ============================================================================
// Phoneme Classification
// ============================================================================

type PhonemeClass = 'vowel' | 'diphthong' | 'stop' | 'fricative' | 'affricate' | 'nasal' | 'liquid' | 'glide' | 'pause' | 'other';

const PHONEME_CLASS: Record<string, PhonemeClass> = {
  // Vowels
  'IY': 'vowel', 'IH': 'vowel', 'EH': 'vowel', 'AE': 'vowel',
  'AA': 'vowel', 'AH': 'vowel', 'AO': 'vowel', 'UH': 'vowel',
  'AX': 'vowel', 'IX': 'vowel', 'ER': 'vowel', 'UX': 'vowel', 'OH': 'vowel',
  // Diphthongs
  'EY': 'diphthong', 'AY': 'diphthong', 'OY': 'diphthong',
  'AW': 'diphthong', 'OW': 'diphthong', 'UW': 'diphthong',
  // Liquids
  'R*': 'liquid', 'RX': 'liquid', 'L*': 'liquid', 'LX': 'liquid',
  // Glides
  'W*': 'glide', 'WX': 'glide', 'WH': 'glide', 'Y*': 'glide', 'YX': 'glide',
  // Nasals
  'M*': 'nasal', 'N*': 'nasal', 'NX': 'nasal',
  // Fricatives (unvoiced)
  'S*': 'fricative', 'SH': 'fricative', 'F*': 'fricative', 'TH': 'fricative',
  '/H': 'fricative', '/X': 'fricative',
  // Fricatives (voiced)
  'Z*': 'fricative', 'ZH': 'fricative', 'V*': 'fricative', 'DH': 'fricative',
  // Affricates
  'CH': 'affricate', 'J*': 'affricate',
  // Stops (unvoiced)
  'P*': 'stop', 'T*': 'stop', 'K*': 'stop', 'KX': 'stop',
  // Stops (voiced)
  'B*': 'stop', 'D*': 'stop', 'G*': 'stop', 'GX': 'stop',
  // Flap
  'DX': 'stop',
  // Glottal stop
  'Q*': 'stop',
  // Pause
  ' ': 'pause',
};

function getPhonemeClass(code: string): PhonemeClass {
  return PHONEME_CLASS[code] ?? 'other';
}

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
 * Resolve repeat frames by carrying forward K coefficients from the previous
 * non-repeat frame. This makes every frame self-contained for extraction.
 */
export function resolveRepeatFrames(frames: LPCFrame[]): LPCFrame[] {
  const resolved: LPCFrame[] = [];
  let lastK: number[] = [8, 8, 8, 8, 8, 8, 8, 4, 4, 4]; // Default middle values
  let lastUnvoiced = false;

  for (const frame of frames) {
    if (frame.energy === 0) {
      // Silent frame — pass through as-is
      resolved.push({ ...frame });
      continue;
    }

    if (frame.repeat) {
      // Repeat frame — carry forward K values from last non-repeat frame
      resolved.push({
        energy: frame.energy,
        repeat: false,
        pitch: frame.pitch,
        k: [...lastK],
        unvoiced: lastUnvoiced,
      });
    } else {
      // Full frame — update last K values
      lastK = [...frame.k];
      lastUnvoiced = frame.unvoiced;
      resolved.push({ ...frame, k: [...frame.k] });
    }
  }

  return resolved;
}

/**
 * Trim leading/trailing silent frames (energy=0) from a frame array.
 */
function trimSilence(frames: LPCFrame[]): LPCFrame[] {
  let start = 0;
  while (start < frames.length && frames[start].energy === 0) start++;
  let end = frames.length - 1;
  while (end >= start && frames[end].energy === 0) end--;
  return frames.slice(start, end + 1);
}

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
function findVCBoundary(frames: LPCFrame[]): number {
  // Scan from end to find where voiced frames stop
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

/** K index clamping ranges: K1-K2 (0-31), K3-K7 (0-15), K8-K10 (0-7) */
const K_MAX = [31, 31, 15, 15, 15, 15, 15, 7, 7, 7];

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
}

/**
 * Determine how many transition frames to insert between two phoneme segments.
 */
function getTransitionCount(prev: PhonemeSegment, next: PhonemeSegment): number {
  const pc = prev.pClass;
  const nc = next.pClass;

  // Pause boundaries: no transitions
  if (pc === 'pause' || nc === 'pause') return 0;

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
      const boundary = findVCBoundary(trimmed);
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
 */
export function lpcToTMS5220Frames(lpcFrames: LPCFrame[]): TMS5220Frame[] {
  return lpcFrames
    .filter(f => f.energy > 0) // Skip silent frames
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

  console.log(
    `[ROMPhonemeExtractor] Extracted ${library.size} phonemes from ROM: [${[...library.keys()].sort().join(', ')}]`
  );

  return library;
}

/**
 * Build TMS5220 frames for a phoneme token sequence, using ROM-extracted frames
 * when available and falling back to static approximations.
 *
 * Pipeline per phoneme:
 *   1. Get ROM frames OR generate multi-frame static sequence
 *   2. Compress ROM frames to 65% tempo
 *   3. Scale frame count by stress-based duration
 *   4. Apply stress energy boost (+2 for stress >= 4)
 *   5. Apply energy envelope shaping
 *   6. Apply micro-pitch contour
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
  const segments: PhonemeSegment[] = [];

  for (const token of tokens) {
    const pClass = getPhonemeClass(token.code);
    const romFrames = romLibrary.get(token.code);

    let frames: TMS5220Frame[];

    if (romFrames && romFrames.length > 0) {
      // Step 1a: Use ROM-extracted frames (authentic LPC data)
      frames = romFrames.map(f => ({ ...f, k: [...f.k] }));
      // Step 2: Compress ROM frames to conversational pace
      frames = compressROMFrames(frames);
    } else {
      // Step 1b: Generate multi-frame static sequence
      const staticFrame = staticFallback(token.code);
      if (!staticFrame) continue;
      frames = generateStaticFrames(staticFrame, pClass);
    }

    // Step 3: Scale duration by stress
    const durationScale = getStressDurationScale(token.stress);
    if (durationScale !== 1.0) {
      frames = scaleFrameCount(frames, durationScale);
    }

    // Step 4: Apply stress energy boost
    if (token.stress >= 4) {
      frames = frames.map(f => ({
        ...f,
        k: [...f.k],
        energy: Math.min(14, f.energy + 2),
      }));
    }

    // Step 5: Apply energy envelope
    frames = applyEnergyEnvelope(frames, pClass);

    // Step 6: Apply pitch contour
    frames = applyPitchContour(frames, pClass);

    segments.push({ code: token.code, pClass, frames });
  }

  // Step 7: Insert coarticulation transitions between phoneme pairs
  return insertTransitions(segments);
}
