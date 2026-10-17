/**
 * voicing.ts - what the input audio says about a note the pitch model found:
 * is there a voice under it (energy against the take's own noise floor), and
 * which octave is its fundamental in (YIN f0).
 *
 * Basic Pitch cannot answer either question from its own output. Measured on
 * real hummed takes (thoughts/shared/research/2026-10-17-voice-to-notes-debug-report.md):
 * it transcribes a ~65 Hz hum in the mic noise floor as notes with the same
 * confidence as sung ones, and it reads a sung ~233 Hz an octave low with
 * higher amplitude than the correct octave.
 *
 * The YIN here is a TypeScript port of the estimator the AutoTune worklet uses
 * (public/autotune/AutoTune.worklet.js is a plain worklet script and cannot be
 * imported). SampleSpectrum.harmonicity was measured and made octave errors
 * YIN did not, so it is not used.
 */

/** Frame hop the model uses (22050 / 256 annotation frames per second). */
const HOP = 256;
export const YIN_WINDOW = 2048;
const YIN_THRESHOLD = 0.12;
const YIN_MIN_HZ = 70;
const YIN_MAX_HZ = 1000;

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

/**
 * The span one YIN probe averages its pitch over: the difference function
 * runs over the window minus the longest lag. A pitch wobble faster than this
 * span reads shallower by sinc(rate x span); the contour detectors undo that.
 */
export function yinProbeSeconds(sampleRate: number): number {
  return (YIN_WINDOW - Math.ceil(sampleRate / YIN_MIN_HZ)) / sampleRate;
}

/** YIN f0 of the window starting at `start`, in Hz, or null when not periodic enough. */
export function yinHz(audio: Float32Array, start: number, sampleRate: number): number | null {
  const tauMin = Math.floor(sampleRate / YIN_MAX_HZ);
  const tauMax = Math.ceil(sampleRate / YIN_MIN_HZ);
  const n = YIN_WINDOW - tauMax;
  if (start < 0 || start + YIN_WINDOW > audio.length || n <= 0) return null;

  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const diff = audio[start + j] - audio[start + j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (cmnd[tau] >= YIN_THRESHOLD) continue;
    while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
    // Parabolic interpolation around the minimum
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a - 2 * b + c;
    const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    return sampleRate / (tau + (Math.abs(shift) < 1 ? shift : 0));
  }
  return null;
}

/**
 * Median YIN pitch (fractional MIDI) over a note span, or null when fewer
 * than half of the probed windows are periodic.
 */
export function spanF0Midi(
  audio: Float32Array,
  sampleRate: number,
  startSeconds: number,
  durationSeconds: number,
): number | null {
  const s = Math.round(startSeconds * sampleRate);
  const last = Math.round((startSeconds + durationSeconds) * sampleRate) - YIN_WINDOW;
  if (last < s) {
    const hz = yinHz(audio, s, sampleRate);
    return hz === null ? null : 69 + 12 * Math.log2(hz / 440);
  }
  const probes = Math.min(8, 1 + Math.floor((last - s) / 512));
  const found: number[] = [];
  for (let i = 0; i < probes; i++) {
    const at = probes === 1 ? s : Math.round(s + ((last - s) * i) / (probes - 1));
    const hz = yinHz(audio, at, sampleRate);
    if (hz !== null) found.push(69 + 12 * Math.log2(hz / 440));
  }
  if (found.length * 2 < probes) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
}

/**
 * The model's pitch class in the octave the audio's fundamental is in. Kept
 * as is when YIN is not confident or names a different pitch class.
 */
export function octaveFromAudio(modelMidi: number, f0Midi: number | null): number {
  if (f0Midi === null) return modelMidi;
  const candidate = modelMidi + 12 * Math.round((f0Midi - modelMidi) / 12);
  return Math.abs(candidate - f0Midi) <= 1 ? candidate : modelMidi;
}
