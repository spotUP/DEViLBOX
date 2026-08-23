import type { TMS5220Frame } from './tms5220PhonemeMap';

/**
 * Sentence-level prosody for TTS speech.
 *
 * The TMS5220 speaks 25ms LPC frames, each carrying a pitch index (0 = unvoiced,
 * 1-31 = voiced period). Modulating that index over time is the entire melody
 * toolkit the chip has — exactly what the real TI chips exploited with recorded
 * inflection.
 *
 * Two mechanisms live here:
 *  - buildWordPitchOffsets: a per-word declination line (pitch drifts down
 *    across the sentence) with a final fall for statements and a rise for
 *    questions — the classic TTS intonation model.
 *  - offsetFramesPitch: applies one of those offsets to a frame stream without
 *    mutating the source frames (they may be shared ROM/library frames).
 *
 * Per-token stress accents (SAM stress >= 4 lifts pitch) live in
 * buildFramesFromROMLibrary, next to the existing duration/energy stress handling.
 */

/** Total declination across the sentence, in pitch indices. */
export const PROSODY_DECLINATION = 2;
/** Extra fall on the final word of a statement. */
export const PROSODY_FINAL_FALL = 2;
/** Rise on the final word of a question. */
export const PROSODY_QUESTION_RISE = 4;

/**
 * Per-word pitch offsets for a whole sentence.
 *
 * Statement: starts at 0, drifts down PROSODY_DECLINATION by the last word,
 * which additionally falls PROSODY_FINAL_FALL.
 * Question: same declination, but the last word rises PROSODY_QUESTION_RISE.
 */
export function buildWordPitchOffsets(wordCount: number, isQuestion: boolean): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < wordCount; i++) {
    let offset = -Math.round((PROSODY_DECLINATION * i) / Math.max(1, wordCount - 1));
    if (i === wordCount - 1) {
      offset += isQuestion ? PROSODY_QUESTION_RISE : -PROSODY_FINAL_FALL;
    }
    offsets.push(offset);
  }
  return offsets;
}

/**
 * Apply a pitch-index offset to voiced frames (pitch > 0), clamped to 1-31.
 * Unvoiced frames (pitch 0) are left alone. The input array is not mutated.
 */
export function offsetFramesPitch(frames: TMS5220Frame[], offset: number): TMS5220Frame[] {
  if (offset === 0) return frames;
  return frames.map((f) => {
    if (f.pitch <= 0) return f;
    const pitch = Math.max(1, Math.min(31, f.pitch + offset));
    return pitch === f.pitch ? f : { ...f, pitch };
  });
}
// ============================================================================
// Segment-relative pitch contour (2026-08-23, Q3 of the phoneme-quality plan)
// ============================================================================

/** Micro-prosody band: how far a frame may deviate from its run's median.
 * Tightened 3 -> 2 -> 1 by ear: a contiguous voiced stretch spans several
 * spliced segments, each dragging the pitch toward its own source melody, and
 * at 2 the alternation between them still read as nervous sliding. Pitch
 * micro-contour is naturalness, not intelligibility — vowel identity lives in
 * the K trajectory — so it flattens safely. */
export const CONTOUR_DELTA_CLAMP = 1;
/** Declination inside one word, in pitch indices. */
export const WORD_DECLINATION = 1;

export interface PitchContourOptions {
  /** Whole-stream base shift (the per-word declination offset in the hybrid chain). */
  baseOffset: number;
  /** Total downward drift across this stream, in pitch indices. */
  declination: number;
  /** Extra adjustment applied to the LAST voiced run: negative = final fall, positive = question rise. */
  finalAdjust: number;
}

interface VoicedRun { start: number; end: number; median: number }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function findVoicedRuns(frames: TMS5220Frame[]): VoicedRun[] {
  const runs: VoicedRun[] = [];
  let start = -1;
  for (let i = 0; i <= frames.length; i++) {
    const voiced = i < frames.length && frames[i].pitch > 0 && !frames[i].unvoiced;
    if (voiced && start < 0) start = i;
    if (!voiced && start >= 0) {
      const pitches = frames.slice(start, i).map(f => f.pitch);
      runs.push({ start, end: i, median: median(pitches) });
      start = -1;
    }
  }
  return runs;
}

/**
 * Re-anchor every voiced run to one utterance baseline while preserving each
 * run's own micro-contour.
 *
 * Why: mined phoneme runs keep the ABSOLUTE pitch of whatever recording they
 * came from — one segment sits at index 20, its neighbour at 8 — so spliced
 * speech leaps around arbitrarily. Shifting whole words (offsetFramesPitch)
 * cannot fix jumps INSIDE a word. Here each contiguous voiced run is moved to
 * a shared baseline (the stream's median + baseOffset, drifting down by
 * `declination` across the stream), and a frame keeps only its delta from its
 * own run's median, clamped to ±CONTOUR_DELTA_CLAMP — the recording's melody
 * survives in miniature, the source-word register does not.
 *
 * The last voiced run additionally takes `finalAdjust` — the statement fall or
 * the question rise. Unvoiced and silent frames pass through untouched.
 */
export function applyPitchContour(
  frames: TMS5220Frame[],
  { baseOffset, declination, finalAdjust }: PitchContourOptions,
): TMS5220Frame[] {
  const runs = findVoicedRuns(frames);
  if (runs.length === 0) return frames;

  const streamMedian = median(runs.flatMap(r =>
    frames.slice(r.start, r.end).map(f => f.pitch)));
  const lastRun = runs[runs.length - 1];
  const denom = Math.max(1, frames.length - 1);

  const out = frames.map(f => ({ ...f, k: f.k }));
  for (const run of runs) {
    // Smooth each run's micro-contour before applying it. Every mined run
    // carries its source recording's own frame-to-frame pitch wiggle, and the
    // chip glides between frames, so raw deltas read as a nervous up-down-up
    // slide. A centred 3-frame average keeps the run's slow movement (a rise
    // stays a rise) and removes the per-frame alternation.
    const deltas: number[] = [];
    for (let i = run.start; i < run.end; i++) {
      deltas.push(Math.max(-CONTOUR_DELTA_CLAMP,
        Math.min(CONTOUR_DELTA_CLAMP, out[i].pitch - run.median)));
    }
    const smoothed = deltas.map((_, j) => {
      const a = deltas[Math.max(0, j - 1)];
      const b = deltas[j];
      const c = deltas[Math.min(deltas.length - 1, j + 1)];
      return Math.round((a + b + c) / 3);
    });

    for (let i = run.start; i < run.end; i++) {
      const t = i / denom;
      let base = streamMedian + baseOffset - Math.round(declination * t);
      // The final fall/rise is a glide, not a step: ramp it across the last
      // run so the boundary into that run carries no sudden jump. A whole-run
      // step was heard as an exaggerated bend.
      if (run === lastRun) {
        const runLen = Math.max(1, run.end - run.start - 1);
        base += Math.round(finalAdjust * ((i - run.start) / runLen));
      }
      const pitch = Math.max(1, Math.min(31, base + smoothed[i - run.start]));
      if (pitch !== out[i].pitch) out[i] = { ...out[i], k: [...out[i].k], pitch };
    }
  }
  return out;
}
