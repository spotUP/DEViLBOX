/**
 * A limiter's ceiling is not boosted past.
 *
 * The master chain puts each effect's static gain compensation AFTER it. The
 * ceiling devices had boosts (Maximizer +3.7 dB, Limiter +1.8, MultibandLimiter
 * +12.7) because calibration read them as "quiet" - which is them holding the
 * ceiling. A Maximizer set to -1 dBFS came out at +2.7 dBFS (peak 1.17,
 * measured 2026-09-29).
 */
import { describe, it, expect } from 'vitest';
import { getEffectGainCompensationDb } from '../effectGainCompensation';

describe('ceiling devices', () => {
  it('get no gain after their ceiling', () => {
    for (const type of ['Maximizer', 'Limiter', 'MultibandLimiter', 'SidechainLimiter']) {
      expect(getEffectGainCompensationDb(type), type).toBe(0);
    }
  });

  it('the Exciter gets no static cut (it took 2.2 dB off the lows after the rebuild)', () => {
    expect(getEffectGainCompensationDb('Exciter')).toBe(0);
  });
});
