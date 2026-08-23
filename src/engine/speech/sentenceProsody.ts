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