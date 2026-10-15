/**
 * Offline rendering helpers for the Tone knob tests: real Tone on a real OfflineAudioContext (node-web-audio-api).
 * Nothing here opens an output device: installRealWebAudio turns every realtime AudioContext into one that renders
 * nothing, and the audio under test is only ever produced by Tone.Offline.
 */
import type * as ToneNS from 'tone';

export const SAMPLE_RATE = 44100;

export interface Rendered { samples: Float32Array; sampleRate: number }

/** Render what `build` makes in an offline context of `seconds`; mono. `build` runs with Tone's context set to the offline one. */
export async function renderOffline(Tone: typeof ToneNS, seconds: number, build: () => void | Promise<void>): Promise<Rendered> {
  const buffer = await Tone.Offline(async ({ transport }) => {
    void transport;
    await build();
  }, seconds, 1, SAMPLE_RATE);
  return { samples: buffer.getChannelData(0), sampleRate: SAMPLE_RATE };
}

/** Magnitude of the component at `hz` over [from, to) seconds (Goertzel), normalised so a unit sine reads 1. */
export function toneAmplitude(r: Rendered, hz: number, from: number, to: number): number {
  const a = Math.floor(from * r.sampleRate);
  const b = Math.min(r.samples.length, Math.floor(to * r.sampleRate));
  const n = b - a;
  const w = (2 * Math.PI * hz) / r.sampleRate;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); // Hann: no leakage from a neighbouring line
    const v = r.samples[a + i] * win;
    re += v * Math.cos(w * i);
    im -= v * Math.sin(w * i);
  }
  return (2 * Math.hypot(re, im)) / (n * 0.5);
}

/** The frequency (Hz) of the strongest component in [lo, hi] over [from, to) seconds, by scanning in `step` Hz. */
export function peakHz(r: Rendered, lo: number, hi: number, from: number, to: number, step = 1): number {
  let best = lo;
  let bestAmp = -1;
  for (let hz = lo; hz <= hi; hz += step) {
    const amp = toneAmplitude(r, hz, from, to);
    if (amp > bestAmp) { bestAmp = amp; best = hz; }
  }
  return best;
}

export function rms(r: Rendered, from: number, to: number): number {
  const a = Math.floor(from * r.sampleRate);
  const b = Math.min(r.samples.length, Math.floor(to * r.sampleRate));
  let sum = 0;
  for (let i = a; i < b; i++) sum += r.samples[i] * r.samples[i];
  return Math.sqrt(sum / Math.max(1, b - a));
}

export function peakAbs(r: Rendered, from: number, to: number): number {
  const a = Math.floor(from * r.sampleRate);
  const b = Math.min(r.samples.length, Math.floor(to * r.sampleRate));
  let m = 0;
  for (let i = a; i < b; i++) m = Math.max(m, Math.abs(r.samples[i]));
  return m;
}

/** Frequency (Hz) of a near-sinusoidal signal over [from, to) seconds, from its rising zero crossings (interpolated). */
export function zeroCrossHz(r: Rendered, from: number, to: number): number {
  const a = Math.floor(from * r.sampleRate);
  const b = Math.min(r.samples.length - 1, Math.floor(to * r.sampleRate));
  const times: number[] = [];
  for (let i = a; i < b; i++) {
    const x0 = r.samples[i];
    const x1 = r.samples[i + 1];
    if (x0 < 0 && x1 >= 0) times.push((i + x0 / (x0 - x1)) / r.sampleRate);
  }
  if (times.length < 2) return 0;
  return (times.length - 1) / (times[times.length - 1] - times[0]);
}

/** The per-window values of `measure` over [from, to) in windows of `windowS` seconds. */
export function windows(r: Rendered, from: number, to: number, windowS: number, measure: (r: Rendered, a: number, b: number) => number): number[] {
  const out: number[] = [];
  for (let t = from; t + windowS <= to + 1e-9; t += windowS) out.push(measure(r, t, t + windowS));
  return out;
}
