/**
 * voicing.ts - is there a voice under a note the pitch model found: span
 * energy against the take's own noise floor.
 *
 * Basic Pitch cannot answer this from its own output. Measured on real hummed
 * takes (thoughts/shared/research/2026-10-17-voice-to-notes-debug-report.md):
 * it transcribes a ~65 Hz hum in the mic noise floor as notes with the same
 * confidence as sung ones. AudioToMidiModal uses this gate; Voice to Notes
 * reads SwiftF0 confidence instead.
 */

/** Frame hop the model uses (22050 / 256 annotation frames per second). */
const HOP = 256;

/** A note quieter than min(NOISE_FLOOR_FACTOR x p10, LOUD_FACTOR x p95) frame RMS is not a voice. */
const NOISE_FLOOR_FACTOR = 6;
const LOUD_FACTOR = 0.25;

function rms(x: Float32Array, start: number, end: number): number {
  const s = Math.max(0, start);
  const e = Math.min(x.length, end);
  if (e <= s) return 0;
  let sum = 0;
  for (let i = s; i < e; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (e - s));
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[i];
}

/** Span RMS below which a note is the room, not a voice. */
export function voiceGateLevel(audio: Float32Array): number {
  const frames: number[] = [];
  for (let at = 0; at + HOP <= audio.length; at += HOP) frames.push(rms(audio, at, at + HOP));
  frames.sort((a, b) => a - b);
  return Math.min(NOISE_FLOOR_FACTOR * percentile(frames, 0.1), LOUD_FACTOR * percentile(frames, 0.95));
}

/** RMS of the audio under [startSeconds, startSeconds + durationSeconds). */
export function spanRms(audio: Float32Array, sampleRate: number, startSeconds: number, durationSeconds: number): number {
  const s = Math.round(startSeconds * sampleRate);
  return rms(audio, s, s + Math.round(durationSeconds * sampleRate));
}
