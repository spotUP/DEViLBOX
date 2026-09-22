import { describe, it, expect } from 'vitest';
import { lowBandWeightFor, LOW_BAND_MAX_DRIVE, LOW_BAND_MAX_GAIN } from '../lowBandWeight';

/**
 * The BASS control's low-band weight stage.
 *
 * "at 90% it sounds heavier than at 100%" (2026-09-22): the linear stages ran
 * into the clipper at the top of the control. The band adds harmonics instead
 * of level, so heaviness keeps rising to the end of the travel.
 */
describe('lowBandWeightFor', () => {
  it('is silent and clean at rest, and for any cut', () => {
    for (const db of [0, -0.5, -6, -12]) {
      const w = lowBandWeightFor(db);
      expect(w.gain, `gain at ${db}`).toBe(0);
      expect(w.drive, `drive at ${db}`).toBe(1);
    }
  });

  it('rises monotonically across the whole boost range — no choke at the top', () => {
    let prev = lowBandWeightFor(0);
    for (let db = 0.5; db <= 12; db += 0.5) {
      const w = lowBandWeightFor(db);
      expect(w.gain, `gain at ${db}`).toBeGreaterThan(prev.gain);
      expect(w.drive, `drive at ${db}`).toBeGreaterThan(prev.drive);
      prev = w;
    }
  });

  it('reaches its maxima exactly at the top of the control', () => {
    const top = lowBandWeightFor(12);
    expect(top.drive).toBe(LOW_BAND_MAX_DRIVE);
    expect(top.gain).toBe(LOW_BAND_MAX_GAIN);
  });

  it('is bounded — a request past the range asks for no more', () => {
    expect(lowBandWeightFor(40)).toEqual(lowBandWeightFor(12));
  });

  it('never adds enough on its own to reach the clipper', () => {
    // The curve is normalised to ±1, so the band's peak is at most `gain`.
    expect(LOW_BAND_MAX_GAIN).toBeLessThan(0.9);
  });

  it('treats a non-number as rest, not as maximum', () => {
    expect(lowBandWeightFor(NaN)).toEqual(lowBandWeightFor(0));
  });
});
