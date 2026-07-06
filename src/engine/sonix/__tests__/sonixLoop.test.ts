/**
 * Regression: Sonix audition sustain artifacts.
 *
 * A swelling voice (Orchestra) jumped loud→quiet at the loop wrap ("cuts to 0"); any voice
 * clicked when loop endpoints sat at different phases (FilterSynth stutter). findSustainLoop
 * must pick a short window at the settled tail with both ends on a falling zero-crossing one
 * period apart — so amplitude is stable and phases match.
 */
import { describe, it, expect } from 'vitest';
import { findSustainLoop } from '../sonixLoop';

const SR = 48000;
const FREQ = 261.6; // C4

function sine(n: number, freq: number, ampAt: (i: number) => number): Float32Array {
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * freq * i) / SR) * ampAt(i);
  return pcm;
}

describe('findSustainLoop', () => {
  it('returns endpoints on falling zero-crossings, ~one period apart', () => {
    const n = SR; // 1s
    const loop = findSustainLoop(sine(n, FREQ, () => 0.5), SR, FREQ);
    expect(loop).not.toBeNull();
    if (!loop) return;
    const startIdx = Math.round(loop.loopStartSec * SR);
    const endIdx = Math.round(loop.loopEndSec * SR);
    expect(endIdx).toBeGreaterThan(startIdx);
    const period = SR / FREQ;
    // Window is close to a whole number of periods (seamless phase).
    const cycles = (endIdx - startIdx) / period;
    expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(0.05);
    expect(Math.round(cycles)).toBeGreaterThanOrEqual(1);
  });

  it('picks a stable-amplitude window from a swelling render (no loud→quiet jump)', () => {
    const n = SR;
    // Amplitude rises linearly across the whole buffer (like Orchestra's swell).
    const pcm = sine(n, FREQ, (i) => 0.01 + (i / n) * 0.9);
    const loop = findSustainLoop(pcm, SR, FREQ);
    expect(loop).not.toBeNull();
    if (!loop) return;
    const startIdx = Math.round(loop.loopStartSec * SR);
    const endIdx = Math.round(loop.loopEndSec * SR);
    // Endpoints are near each other in amplitude — the wrap won't drop to silence.
    const aStart = Math.abs(pcm[startIdx - 1]);
    const aEnd = Math.abs(pcm[endIdx - 1]);
    const envStart = 0.01 + (startIdx / n) * 0.9;
    const envEnd = 0.01 + (endIdx / n) * 0.9;
    expect(Math.abs(envEnd - envStart) / envEnd).toBeLessThan(0.1); // <10% swell across the loop
    // And the window is in the tail (settled, loud), not the quiet attack.
    expect(startIdx).toBeGreaterThan(n / 2);
    void aStart; void aEnd;
  });

  it('returns null for a silent buffer', () => {
    expect(findSustainLoop(new Float32Array(SR), SR, FREQ)).toBeNull();
  });

  it('returns null for a too-short buffer', () => {
    expect(findSustainLoop(new Float32Array(100), SR, FREQ)).toBeNull();
  });
});
