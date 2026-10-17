/**
 * A PitchTracker for tests that reads the pitch of synthesised sines straight
 * from the waveform: per 16 ms frame, the mean period between rising zero
 * crossings (linearly interpolated) inside a short window centred on the
 * frame. Frames whose peak is under SILENCE_PEAK are unvoiced. It stands in
 * for SwiftF0 (which needs ONNX and a model file) so panel, handler and
 * effect tests drive the real segmenter and shaping on known pitches.
 */
import { TRACK_HOP_SECONDS, type F0Track, type PitchRange, type PitchTracker } from '../pitchTrack';

const SR = 22050;
/** Half the window one frame reads, in samples (about 11.6 ms). */
const HALF_WINDOW = 256;
/** Half the loudness window (32 ms in all, as SwiftF0 reports it). */
const HALF_LOUDNESS = Math.round(0.016 * SR);
const SILENCE_PEAK = 0.05;
const VOICED_CONFIDENCE = 0.9;

function frameHz(audio: Float32Array, centre: number): number {
  const from = Math.max(1, centre - HALF_WINDOW);
  const to = Math.min(audio.length, centre + HALF_WINDOW);
  let peak = 0;
  const rising: number[] = [];
  for (let i = from; i < to; i++) {
    peak = Math.max(peak, Math.abs(audio[i]));
    const a = audio[i - 1];
    const b = audio[i];
    if (a < 0 && b >= 0) rising.push(i - 1 + -a / (b - a));
  }
  if (peak < SILENCE_PEAK || rising.length < 2) return 0;
  return ((rising.length - 1) / (rising[rising.length - 1] - rising[0])) * SR;
}

function frameDb(audio: Float32Array, centre: number): number {
  const from = Math.max(0, centre - HALF_LOUDNESS);
  const to = Math.min(audio.length, centre + HALF_LOUDNESS);
  let sum = 0;
  for (let i = from; i < to; i++) sum += audio[i] * audio[i];
  const rms = to > from ? Math.sqrt(sum / (to - from)) : 0;
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

export class SineReadingTracker implements PitchTracker {
  calls = 0;
  ranges: (PitchRange | undefined)[] = [];

  async track(samples22050: Float32Array, range?: PitchRange): Promise<F0Track> {
    this.calls++;
    this.ranges.push(range);
    return sineTrack(samples22050);
  }
}

/** The track SineReadingTracker returns, for tests that need it synchronously. */
export function sineTrack(audio: Float32Array): F0Track {
  const frames = Math.floor(audio.length / (TRACK_HOP_SECONDS * SR)) + 1;
  const hz = new Float32Array(frames);
  const confidence = new Float32Array(frames);
  const loudnessDb = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const centre = Math.round(f * TRACK_HOP_SECONDS * SR);
    hz[f] = frameHz(audio, centre);
    confidence[f] = hz[f] > 0 ? VOICED_CONFIDENCE : 0;
    loudnessDb[f] = frameDb(audio, centre);
  }
  return { hz, confidence, loudnessDb, hopSeconds: TRACK_HOP_SECONDS };
}
