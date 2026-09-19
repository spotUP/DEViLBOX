import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adaptEQParams, computeImprovDelta } from '../AutoDub';
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

describe('computeImprovDelta', () => {
  it('beat-sync at beatPhase=0.25 (sin(π/2)=1): delta = 1.0 × depth × energy', () => {
    const delta = computeImprovDelta('beat-sync', 0.25, 0.8, 0.0, 8);
    // sin(0.25 × 2π) = sin(π/2) = 1.0 → 1.0 × 8 × 0.8 = 6.4
    expect(delta).toBeCloseTo(1.0 * 8 * 0.8, 1);
  });

  it('beat-sync at beatPhase=0: delta ≈ 0', () => {
    const delta = computeImprovDelta('beat-sync', 0, 0.8, 0.0, 8);
    expect(Math.abs(delta)).toBeLessThan(0.1);
  });

  it('beat-sync at beatPhase=0.5 (sin(π)=0): delta ≈ 0', () => {
    const delta = computeImprovDelta('beat-sync', 0.5, 0.8, 0.0, 8);
    expect(Math.abs(delta)).toBeLessThan(0.1);
  });

  it('beat-sync: negative at beatPhase=0.75 (sin(3π/2)=-1)', () => {
    const delta = computeImprovDelta('beat-sync', 0.75, 0.8, 0.0, 8);
    expect(delta).toBeLessThan(0);
  });

  it('energy-reactive: positive delta on energy rise', () => {
    const delta = computeImprovDelta('energy-reactive', 0.5, 0.8, 0.4, 8);
    // energyDelta = 0.4 → positive
    expect(delta).toBeGreaterThan(0);
  });

  it('energy-reactive: clamped to [-depth, +depth]', () => {
    const delta = computeImprovDelta('energy-reactive', 0.5, 1.0, 0.0, 6);
    expect(delta).toBeLessThanOrEqual(6);
    expect(delta).toBeGreaterThanOrEqual(-6);
  });

  it('spectral: returns 0 (spectral is per-band, computed in loop)', () => {
    const delta = computeImprovDelta('spectral', 0.5, 0.8, 0.8, 6);
    expect(delta).toBe(0);
  });
});

/**
 * Why the EQ sliders sat still for the whole of a session, reported repeatedly
 * as "eq and bus are dead in the ui" and "i see almost no action here".
 *
 * Two independent faults, either of which alone was enough to freeze it, which
 * is why fixing the first changed nothing visible:
 *
 *  1. The EQ snapshot was built only when the OFFLINE genre classifier had
 *     run. Loading a song does not run it, so `improvTick` hit
 *     `if (!snapshot) return` on every tick of an ordinary session.
 *
 *  2. `beatPhase` came from `computeMusicalPosition(<integer row>, ...)`, so it
 *     could only land on exact row boundaries. At speed 12 a bar is 8 rows,
 *     putting `barPos * 4` on exact halves and `% 1` on 0.0 or 0.5 — and the
 *     `beat-sync` driver is `sin(beatPhase * 2PI) * depth * energy`, which is
 *     ZERO at both. The driver ran, applied, and reported no error while
 *     producing deltas of 2.4e-16.
 *
 * Measured after the fix: bands 0 and 3 (King Tubby's `liveBands`) moving over
 * -0.5..1 and 2..3.5 dB against a live mix.
 */
describe('beat-sync survives the row grid', () => {
  /** What `barPos * 4 % 1` can be when barPos comes from an integer row. */
  const quantizedPhases = (rowsPerBar: number) => {
    const out: number[] = [];
    for (let row = 0; row < rowsPerBar; row++) {
      const barPos = row / rowsPerBar;
      out.push((barPos * 4) % 1);
    }
    return out;
  };

  it('produces nothing but zero when a bar is 8 rows or fewer', () => {
    // The reported case: speed 12 puts a bar at 8 rows, so every reachable
    // phase is a multiple of 0.5 and sin(2*PI*k/2) is zero for every integer k.
    // The driver ran, applied, reported no error, and moved the EQ by 2.4e-16.
    for (const rowsPerBar of [4, 8]) {
      for (const phase of quantizedPhases(rowsPerBar)) {
        const delta = computeImprovDelta('beat-sync', phase, 0.7, 0.7, 4);
        expect(Math.abs(delta), `rowsPerBar=${rowsPerBar} phase=${phase}`).toBeLessThan(1e-9);
      }
    }
  });

  it('is starved even where it is not exactly zero', () => {
    // At 16 rows per bar the grid does reach 0.25 and 0.75, so the fault is
    // less total — but four positions per beat is still a stepped wobble, not
    // a sweep, and half of them are silent. Sub-row resolution is what makes
    // this a continuous gesture at any speed.
    const distinct = new Set(
      quantizedPhases(16).map(p => computeImprovDelta('beat-sync', p, 0.7, 0.7, 4).toFixed(6)),
    );
    expect(distinct.size).toBeLessThanOrEqual(3);
  });

  it('produces real movement once the phase is continuous', () => {
    // Sub-row resolution is what makes the driver able to say anything at all.
    const deltas = [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]
      .map(p => computeImprovDelta('beat-sync', p, 0.7, 0.7, 4));
    expect(deltas.some(d => Math.abs(d) > 0.5)).toBe(true);
    // And it swings both ways across the beat, rather than only boosting.
    expect(deltas.some(d => d > 0.5)).toBe(true);
    expect(deltas.some(d => d < -0.5)).toBe(true);
  });

  it('scales with energy, so a silent mix still moves nothing', () => {
    expect(computeImprovDelta('beat-sync', 0.25, 0, 0, 4)).toBe(0);
    expect(Math.abs(computeImprovDelta('beat-sync', 0.25, 0.7, 0.7, 4))).toBeGreaterThan(0.5);
  });
});

describe('the EQ snapshot does not depend on the offline classifier', () => {
  it('builds from live audio when no analysis has been run', () => {
    // Structural, because the snapshot is assembled inside the tick: the gate
    // must admit a live-audio-only session, and energy must come from the live
    // reading rather than the classifier's single per-song number.
    const src = readFileSync(
      resolve(import.meta.dirname, '..', 'AutoDub.ts'), 'utf8',
    );
    expect(src).toContain('if (analysis || liveAudio) {');
    expect(src).toContain('energy: liveAudio ? liveEnergy(liveAudio.rms) : analysis!.genre.energy');
    expect(src).not.toContain('energy: analysis.genre.energy,');
  });
});
