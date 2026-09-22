import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { makeSoftClipCurve } from '../softClipCurve';

/**
 * Regression, reported 2026-09-18: "the dub bus clipping and disting most of
 * the time". The master insert's "safety clipper" was `tanh(1.2x)/tanh(1.2)`,
 * documented as linear below ±0.9 but in fact 1.43x at 0.1 and 1.29x at 0.5 —
 * roughly +3 dB of makeup plus third-harmonic distortion applied to the whole
 * mix (dry and wet) whenever the bus was enabled, which also pushed the result
 * into the master limiter.
 */

/** Read the curve at an input value the way a WaveShaper does (linear interp). */
function sample(curve: Float32Array, x: number): number {
  const pos = ((x + 1) / 2) * (curve.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = curve[Math.max(0, Math.min(curve.length - 1, i))];
  const b = curve[Math.max(0, Math.min(curve.length - 1, i + 1))];
  return a + (b - a) * f;
}

describe('makeSoftClipCurve — a safety clipper, not a saturator', () => {
  const curve = makeSoftClipCurve(8192, 0.9);

  it('passes signal below the threshold through untouched', () => {
    for (const x of [0.01, 0.1, 0.25, 0.5, 0.7, 0.85, 0.89]) {
      expect(sample(curve, x)).toBeCloseTo(x, 3);
      expect(sample(curve, -x)).toBeCloseTo(-x, 3);
    }
  });

  it('adds no makeup gain at low level — the old curve added about 3 dB', () => {
    const gain = sample(curve, 0.1) / 0.1;
    expect(gain).toBeCloseTo(1, 3);
    // What the old curve did, for the record:
    const old = (Math.tanh(0.1 * 1.2) / Math.tanh(1.2)) / 0.1;
    expect(old).toBeGreaterThan(1.4);
  });

  it('saturates above the threshold and never exceeds full scale', () => {
    expect(sample(curve, 0.95)).toBeGreaterThan(0.9);
    expect(sample(curve, 0.95)).toBeLessThan(0.95);
    expect(sample(curve, 1)).toBeLessThanOrEqual(1);
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-1);
  });

  it('is monotonic and odd-symmetric', () => {
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
    for (const x of [0.2, 0.6, 0.95]) {
      expect(sample(curve, -x)).toBeCloseTo(-sample(curve, x), 6);
    }
  });

  it('keeps its slope continuous across the knee (no corner to ring on)', () => {
    const d = 0.002;
    const below = (sample(curve, 0.9) - sample(curve, 0.9 - d)) / d;
    const above = (sample(curve, 0.9 + d) - sample(curve, 0.9)) / d;
    expect(Math.abs(below - above)).toBeLessThan(0.05);
  });
});

describe('master insert gain staging', () => {
  const bus = readFileSync(join(__dirname, '..', '..', '..', 'engine', 'dub', 'DubBus.ts'), 'utf8');

  it('uses the shared soft-clip curve instead of an inline tanh', () => {
    expect(bus).toContain('makeSoftClipCurve(8192, MASTER_CLIP_THRESHOLD)');
    expect(bus).not.toContain('Math.tanh(x * 1.2) / Math.tanh(1.2)');
  });

  it('trims the insert input for what the tone stage actually costs', () => {
    // The trim used to be the full shelf gain, which assumed the whole mix was
    // being lifted when only the low end is — audibly a huge level drop when
    // the bus came on. It now follows the measured share of low-frequency
    // energy in the programme — read BEFORE the insert, so the trim never
    // measures its own boost (see `_programmeBeforeInsert`).
    expect(bus).toContain('? shelfTrimDb(costDb, this._programmeBeforeInsert()) + this._trimRideDb');
    // Written through `_settle`, which cancels pending events and pins the
    // current value before ramping — a bare setTargetAtTime here collided with
    // ramps a held move had already scheduled on the same param.
    expect(bus).toContain('this._settle(this.masterToneTrim.gain, trim, now, 0.02);');
  });

  it('puts the trim ahead of the boosting stages, not after them', () => {
    expect(bus).toContain('this.masterToneTrim.connect(this.masterHpf);');
    expect(bus).toContain('this.masterInsertHead = this.masterToneTrim;');
  });
});
