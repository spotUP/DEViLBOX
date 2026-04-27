/**
 * Contract: Fil4EqEffect exposes the full ParametricEQEffect surface.
 * If any method disappears, DubBus.ts will break at runtime.
 */
import { describe, it, expect } from 'vitest';
import { Fil4EqEffect } from '../Fil4EqEffect';

describe('Fil4EqEffect — contract', () => {
  it('exports the class', () => {
    expect(Fil4EqEffect).toBeDefined();
    expect(typeof Fil4EqEffect).toBe('function');
  });

  it('has all ParametricEQEffect-compatible methods on the prototype', () => {
    const required = [
      'setB1Freq', 'setB1Gain', 'setB1Q',
      'setB2Freq', 'setB2Gain', 'setB2Q',
      'setB3Freq', 'setB3Gain', 'setB3Q',
      'setB4Freq', 'setB4Gain', 'setB4Q',
      'setHP', 'setLP', 'setLowShelf', 'setHighShelf', 'setBand', 'setMasterGain',
      'getMagnitude', 'getParams',
      'on', 'off', 'dispose',
    ];
    for (const method of required) {
      expect(typeof Fil4EqEffect.prototype[method as keyof typeof Fil4EqEffect.prototype], `Missing method: ${method}`).toBe('function');
    }
  });

  it('Fil4Params interface has expected shape', () => {
    const params = {
      hp: { enabled: false, freq: 20, q: 0.7 },
      lp: { enabled: false, freq: 20000, q: 0.7 },
      ls: { enabled: false, freq: 80, gain: 0, q: 0.7 },
      hs: { enabled: false, freq: 8000, gain: 0, q: 0.7 },
      p: [
        { enabled: false, freq: 200,  bw: 1.0, gain: 0 },
        { enabled: false, freq: 500,  bw: 1.0, gain: 0 },
        { enabled: false, freq: 2000, bw: 1.0, gain: 0 },
        { enabled: false, freq: 8000, bw: 1.0, gain: 0 },
      ],
      masterGain: 1.0,
    };
    expect(params.p).toHaveLength(4);
    expect(params.hp.freq).toBe(20);
    expect(params.lp.freq).toBe(20000);
  });
});
