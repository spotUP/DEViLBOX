/**
 * Swedish Chainsaw: an HM-2 with every setting at max, without aliasing fizz.
 *
 * The port had capped the HM-2 gain at 24 dB (upstream: 20-40) and the amp at
 * 18 dB (upstream: 0-30), and ran both tanh clippers at the base rate where
 * upstream oversamples 4x: at full drive the clipped harmonics above Nyquist
 * folded back as inharmonic fizz (2026-09-29). Runs the real WASM build.
 */
import { describe, it, expect } from 'vitest';
import { loadWasmEffect } from './wasmEffectHarness';

const SR = 48000;
const N = 16384;

async function render(params: number[], input: (i: number) => number): Promise<Float32Array> {
  const { m, heap } = await loadWasmEffect('swedishchainsaw', 'SwedishChainsaw');
  const fx = new (m as unknown as Record<string, new () => {
    initialize(sr: number): void; setParameter(id: number, v: number): void;
    process(a: number, b: number, c: number, d: number, n: number): void;
  }>).SwedishChainsaw();
  fx.initialize(SR);
  params.forEach((v, i) => fx.setParameter(i, v));
  const B = 128, iL = m._malloc(B * 4), iR = m._malloc(B * 4), oL = m._malloc(B * 4), oR = m._malloc(B * 4);
  const settle = SR, total = settle + N;
  const out = new Float32Array(N);
  const blk = new Float32Array(B);
  for (let off = 0; off < total; off += B) {
    for (let i = 0; i < B; i++) blk[i] = input(off + i);
    heap().set(blk, iL >> 2); heap().set(blk, iR >> 2);
    fx.process(iL, iR, oL, oR, B);
    if (off >= settle) out.set(heap().subarray(oL >> 2, (oL >> 2) + B), off - settle);
  }
  return out;
}

/** Power spectrum (Hann window), radix-2. */
function power(x: Float32Array): Float64Array {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
      }
    }
  }
  const p = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i];
  return p;
}

// Tight 0, HM-2 gain max, amp gain max, tone centred, volume centred.
const ALL_MAX = [0, 1, 1, 0.5, 0.5, 0.5, 0.5];

describe('Swedish Chainsaw', () => {
  it('keeps aliasing 30 dB under the clipped harmonics at full drive', async () => {
    // A 1234 Hz sine: its harmonics (and nothing else) belong in the output.
    const f0 = 1234;
    const y = await render(ALL_MAX, (i) => 0.125 * Math.sin((2 * Math.PI * f0 * i) / SR));
    const p = power(y);
    const hz = SR / N;
    let harmonic = 0, other = 0;
    for (let b = Math.round(100 / hz); b < N / 2; b++) {
      const f = b * hz;
      const nearest = Math.round(f / f0) * f0;
      if (Math.abs(f - nearest) <= 4 * hz) harmonic += p[b]; else other += p[b];
    }
    const db = 10 * Math.log10(other / harmonic);
    expect(db, `inharmonic energy ${db.toFixed(1)} dB re harmonics`).toBeLessThan(-30);
  }, 60000);

  it('HM-2 at max: the chainsaw peaks near 100 Hz and 1-1.5 kHz stand over 400 Hz', async () => {
    // Quiet input keeps the clippers near-linear, so the EQ shape shows.
    let seed = 1;
    const y = await render([0, 0, 0, 0.5, 0.5, 0.5, 0.5], () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return 1e-4 * ((seed / 2 ** 32) * 2 - 1);
    });
    const p = power(y);
    const hz = SR / N;
    const band = (lo: number, hi: number) => {
      let s = 0; let n = 0;
      for (let b = Math.round(lo / hz); b <= Math.round(hi / hz); b++) { s += p[b]; n++; }
      return 10 * Math.log10(s / n);
    };
    const mid = band(350, 450);
    expect(band(1000, 1500) - mid).toBeGreaterThan(8);
  }, 60000);
});
