/**
 * Regression: Sonix audition sustain artifacts.
 *
 * findSustainLoop must pick a loop with matched phase (both ends on a falling zero-crossing)
 * and matched amplitude/timbre, with a minimum length so a swept tail can't collapse to a
 * ~one-period buzz. Covers the three real failures: Orchestra swell (loud→quiet jump),
 * Echo2 filter modulation ("beard shaver" buzz), and phase-mismatch clicks.
 */
import { describe, it, expect } from 'vitest';
import { findSustainLoop, applyLoopCrossfade } from '../sonixLoop';

const SR = 48000;
const FREQ = 261.6; // C4
const MIN_LOOP_SAMPLES = 0.05 * SR;

function synth(n: number, freq: number, ampAt: (i: number) => number): Float32Array {
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * freq * i) / SR) * ampAt(i);
  return pcm;
}

describe('findSustainLoop', () => {
  it('endpoints are both on a falling zero-crossing (no click)', () => {
    const pcm = synth(SR, FREQ, () => 0.5);
    const loop = findSustainLoop(pcm, SR, FREQ);
    expect(loop).not.toBeNull();
    if (!loop) return;
    const s = Math.round(loop.loopStartSec * SR);
    const e = Math.round(loop.loopEndSec * SR);
    expect(pcm[s - 1]).toBeGreaterThanOrEqual(0);
    expect(pcm[s]).toBeLessThan(0);
    expect(pcm[e - 1]).toBeGreaterThanOrEqual(0);
    expect(pcm[e]).toBeLessThan(0);
  });

  it('never collapses below the minimum loop length (no buzz)', () => {
    // Filter-swept tail: waveform timbre changes cyclically (like Echo2). A naive 1-period
    // loop would buzz; the finder must keep the loop >= 50ms.
    const pcm = synth(SR, FREQ, (i) => 0.5 * (1 + 0.5 * Math.sin((2 * Math.PI * i) / (0.4 * SR))));
    const loop = findSustainLoop(pcm, SR, FREQ);
    expect(loop).not.toBeNull();
    if (!loop) return;
    const len = Math.round(loop.loopEndSec * SR) - Math.round(loop.loopStartSec * SR);
    expect(len).toBeGreaterThanOrEqual(MIN_LOOP_SAMPLES);
  });

  it('picks matched-amplitude endpoints on a swelling render (no loud→quiet jump)', () => {
    const n = SR;
    const env = (i: number) => 0.01 + (i / n) * 0.9; // linear swell like Orchestra
    const pcm = synth(n, FREQ, env);
    const loop = findSustainLoop(pcm, SR, FREQ);
    expect(loop).not.toBeNull();
    if (!loop) return;
    const s = Math.round(loop.loopStartSec * SR);
    const e = Math.round(loop.loopEndSec * SR);
    // Amplitude at the two ends is close → the wrap won't drop to silence.
    expect(Math.abs(env(e) - env(s)) / env(e)).toBeLessThan(0.12);
    // And the window sits in the settled tail, not the quiet attack.
    expect(s).toBeGreaterThan(n / 2);
  });

  it('matches the modulation cycle on a periodically-modulated tail', () => {
    // Amplitude modulated at 2.5Hz (0.4s period). Best endpoint match is one modulation
    // cycle back, so the loop length should be near a multiple of 0.4s (not the minimum).
    const modSamples = 0.4 * SR;
    const pcm = synth(2 * SR, FREQ, (i) => 0.4 * (1 + 0.6 * Math.sin((2 * Math.PI * i) / modSamples)));
    const loop = findSustainLoop(pcm, SR, FREQ);
    expect(loop).not.toBeNull();
    if (!loop) return;
    const len = Math.round(loop.loopEndSec * SR) - Math.round(loop.loopStartSec * SR);
    const cycles = len / modSamples;
    expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(0.15);
    expect(Math.round(cycles)).toBeGreaterThanOrEqual(1);
  });

  it('returns null for a silent buffer', () => {
    expect(findSustainLoop(new Float32Array(SR), SR, FREQ)).toBeNull();
  });

  it('returns null for a too-short buffer', () => {
    expect(findSustainLoop(new Float32Array(100), SR, FREQ)).toBeNull();
  });

  it('can capture a slow modulation cycle (>0.6s) — Synth1 regression', () => {
    // Synth1 sweeps over ~1.3s; the loop must be able to span a full cycle so the endpoints
    // land at the same modulation phase (a 0.6s cap wrapped mid-sweep and seamed).
    const modSamples = 1.3 * SR;
    const pcm = synth(4 * SR, FREQ, (i) => 0.4 * (1 + 0.6 * Math.sin((2 * Math.PI * i) / modSamples)));
    const loop = findSustainLoop(pcm, SR, FREQ);
    expect(loop).not.toBeNull();
    if (!loop) return;
    const len = Math.round(loop.loopEndSec * SR) - Math.round(loop.loopStartSec * SR);
    expect(len).toBeGreaterThan(0.6 * SR); // spans more than the old cap
    const cycles = len / modSamples;
    expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(0.15);
  });
});

describe('applyLoopCrossfade', () => {
  it('matches the approach-to-end toward the approach-to-start (smooths the seam)', () => {
    const n = SR;
    // Two segments with different local shape so the pre-end and pre-start windows differ.
    const pcm = new Float32Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * FREQ * i) / SR) * (0.3 + 0.001 * i);
    const s = Math.round(0.4 * SR);
    const e = Math.round(0.8 * SR);
    const beforeDiff = Math.abs(pcm[e - 1] - pcm[s - 1]);
    applyLoopCrossfade(pcm, s, e, SR);
    const afterDiff = Math.abs(pcm[e - 1] - pcm[s - 1]);
    // The sample just before loopEnd is pulled almost all the way to the sample just before
    // loopStart (weight (x-1)/x at the final fade sample), collapsing the seam step.
    expect(afterDiff).toBeLessThan(beforeDiff * 0.1);
  });

  it('is a no-op when the loop is too short to fade', () => {
    const pcm = new Float32Array(1000).fill(0.5);
    applyLoopCrossfade(pcm, 10, 14, SR); // 2-sample half-window
    // Nothing throws; values remain finite.
    expect(Number.isFinite(pcm[12])).toBe(true);
  });
});
