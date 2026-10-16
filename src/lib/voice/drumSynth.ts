/**
 * drumSynth.ts - deterministic synthetic beatbox hits with the defining
 * features of each class. Used by tests (and as a stand-in until real beatbox
 * clips exist); not shipped UI.
 */
import { PITCH_SAMPLE_RATE } from './pitchNotes';
import type { DrumClass } from './drumHits';

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

function onePole(x: Float32Array, hz: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / PITCH_SAMPLE_RATE);
  const y = new Float32Array(x.length);
  let z = 0;
  for (let i = 0; i < x.length; i++) { z += a * (x[i] - z); y[i] = z; }
  return y;
}

function noise(n: number, seed: number): Float32Array {
  const r = prng(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r();
  return x;
}

export function synthHit(drum: DrumClass, seed = 1, seconds = 0.15): Float32Array {
  const n = Math.round(seconds * PITCH_SAMPLE_RATE);
  const out = new Float32Array(n);
  const t = (i: number) => i / PITCH_SAMPLE_RATE;
  if (drum === 'kick') {
    // Low sine burst with a quick pitch drop and a slow decay
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = 50 + 70 * Math.exp(-t(i) / 0.02);
      phase += (2 * Math.PI * f) / PITCH_SAMPLE_RATE;
      out[i] = 0.9 * Math.sin(phase) * Math.exp(-t(i) / 0.07);
    }
  } else if (drum === 'snare') {
    // Mid-band noise plus a body tone, medium decay
    const band = noise(n, seed);
    const lo = onePole(band, 300);
    const hi = onePole(band, 4500);
    for (let i = 0; i < n; i++) {
      out[i] = (3 * (hi[i] - lo[i]) + 0.25 * Math.sin(2 * Math.PI * 190 * t(i))) * Math.exp(-t(i) / 0.06);
    }
  } else if (drum === 'hat') {
    // Short high-passed noise
    const x = noise(n, seed);
    for (let i = 1; i < n; i++) out[i] = 0.7 * (x[i] - x[i - 1]) * Math.exp(-t(i) / 0.012);
  } else {
    // Clap: three short mid-band noise bursts 10 ms apart, then a tail
    const band = noise(n, seed);
    const lo = onePole(band, 600);
    const hi = onePole(band, 3500);
    for (let i = 0; i < n; i++) {
      const ms = t(i) * 1000;
      const burst = [0, 10, 20].reduce((m, start) => (ms >= start && ms < start + 5 ? 1 : m), 0);
      const tail = ms >= 20 ? Math.exp(-(ms - 20) / 25) * 0.6 : 0;
      out[i] = 3 * (hi[i] - lo[i]) * Math.max(burst, tail);
    }
  }
  return out;
}

/** Hits placed at the given times (seconds) in a take of `seconds`. */
export function synthTake(hits: readonly { drum: DrumClass; at: number }[], seconds: number, seed = 1): Float32Array {
  const take = new Float32Array(Math.round(seconds * PITCH_SAMPLE_RATE));
  hits.forEach((h, i) => {
    const hit = synthHit(h.drum, seed + i * 7);
    take.set(hit, Math.round(h.at * PITCH_SAMPLE_RATE));
  });
  return take;
}
