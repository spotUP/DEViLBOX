import { describe, it, expect } from 'vitest';
import { adaptEQParams } from '../AutoDub';
import type { EQSnapshot } from '../AutoDub';
import type { AutoDubPersona } from '../AutoDubPersonas';

function makeSnapshot(overrides: Partial<EQSnapshot> = {}): EQSnapshot {
  return {
    genre: 'Reggae',
    energy: 0.7,
    danceability: 0.8,
    bpm: 90,
    beatPhase: 0.25,
    frequencyPeaks: [[2000, 6], [500, 4], [8000, 2]],
    baseline: {
      hp: { enabled: false, freq: 40, q: 0.7 },
      lp: { enabled: false, freq: 20000, q: 0.7 },
      ls: { enabled: false, freq: 80, gain: 0, q: 0.8 },
      hs: { enabled: false, freq: 10000, gain: 0, q: 0.8 },
      p: [
        { enabled: false, freq: 200, bw: 1, gain: 0 },
        { enabled: false, freq: 500, bw: 1, gain: 0 },
        { enabled: false, freq: 2000, bw: 1, gain: 0 },
        { enabled: false, freq: 8000, bw: 1, gain: 0 },
      ],
      masterGain: 1,
    },
    ...overrides,
  };
}

const PERSONA_STUB = {
  improvConfig: { driver: 'beat-sync', liveBands: [0, 2], depth: 8, rate: 1.0 },
} as unknown as AutoDubPersona;

describe('adaptEQParams — eqSweep', () => {
  it('uses dominant spectral peak × 0.5 as startHz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[2000, 6]] });
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    expect(out.startHz).toBeCloseTo(2000 * 0.5);
  });

  it('uses dominant spectral peak × 2.5 as endHz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[2000, 6]] });
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    expect(out.endHz).toBeCloseTo(2000 * 2.5);
  });

  it('sweepSec is tempo-locked to 4 beats', () => {
    const snap = makeSnapshot({ bpm: 120 });
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    // 4 beats at 120 bpm = 4 × 60/120 = 2 seconds
    expect(out.sweepSec).toBeCloseTo(2.0);
  });

  it('gain scales with energy (higher energy = higher gain)', () => {
    const snapLow = makeSnapshot({ energy: 0.0 });
    const snapHigh = makeSnapshot({ energy: 1.0 });
    const raw = { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 };
    const outLow = adaptEQParams('eqSweep', raw, snapLow, PERSONA_STUB);
    const outHigh = adaptEQParams('eqSweep', raw, snapHigh, PERSONA_STUB);
    expect(outHigh.gain).toBeGreaterThan(outLow.gain);
  });

  it('falls back to raw params when snapshot is null', () => {
    const raw = { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 };
    const out = adaptEQParams('eqSweep', raw, null, PERSONA_STUB);
    expect(out).toEqual(raw);
  });

  it('clamps startHz to at least 20 Hz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[30, 10]] }); // 30 × 0.5 = 15 Hz
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    expect(out.startHz).toBeGreaterThanOrEqual(20);
  });

  it('falls back to raw startHz/endHz when frequencyPeaks is empty', () => {
    const snap = makeSnapshot({ frequencyPeaks: [] });
    const raw = { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 };
    const out = adaptEQParams('eqSweep', raw, snap, PERSONA_STUB);
    expect(out.startHz).toBe(300);
    expect(out.endHz).toBe(5000);
  });
});

describe('adaptEQParams — hpfRise', () => {
  it('uses highest peak above 800 Hz as peakHz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[400, 8], [3000, 6], [1500, 4]] });
    const out = adaptEQParams('hpfRise', { peakHz: 3000, holdMs: 800 }, snap, PERSONA_STUB);
    // peaks above 800: [[3000, 6], [1500, 4]]; highest magnitude = 3000
    expect(out.peakHz).toBeCloseTo(3000);
  });

  it('clamps peakHz to [1200, 6000]', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[10000, 10]] }); // above 6000 cap
    const out = adaptEQParams('hpfRise', { peakHz: 3000, holdMs: 800 }, snap, PERSONA_STUB);
    expect(out.peakHz).toBe(6000);
  });

  it('falls back to raw peakHz when no peak above 800 Hz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[100, 10], [200, 8]] });
    const out = adaptEQParams('hpfRise', { peakHz: 3000, holdMs: 800 }, snap, PERSONA_STUB);
    expect(out.peakHz).toBe(3000);
  });

  it('holdMs scales with energy (2 beats worth)', () => {
    const snap = makeSnapshot({ bpm: 90, energy: 1.0 });
    const out = adaptEQParams('hpfRise', { peakHz: 3000, holdMs: 800 }, snap, PERSONA_STUB);
    // 2 beats at 90 bpm × 1.0 energy = 2 × (60000/90) = ~1333 ms
    expect(out.holdMs).toBeCloseTo(2 * (60000 / 90) * 1.0, -2);
  });

  it('falls back to raw params when snapshot is null', () => {
    const raw = { peakHz: 3000, holdMs: 800 };
    const out = adaptEQParams('hpfRise', raw, null, PERSONA_STUB);
    expect(out).toEqual(raw);
  });
});
