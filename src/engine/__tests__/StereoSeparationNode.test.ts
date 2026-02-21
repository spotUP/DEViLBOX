import { describe, it, expect } from 'vitest';
import { computeStereoGains } from '../StereoSeparationNode';

describe('computeStereoGains', () => {
  it('0% → mono (gainLL=gainRR=0.5, gainLR=gainRL=0.5)', () => {
    const g = computeStereoGains(0);
    expect(g.gainLL).toBeCloseTo(0.5);
    expect(g.gainRR).toBeCloseTo(0.5);
    expect(g.gainLR).toBeCloseTo(0.5);
    expect(g.gainRL).toBeCloseTo(0.5);
  });

  it('100% → identity (gainLL=gainRR=1, gainLR=gainRL=0)', () => {
    const g = computeStereoGains(100);
    expect(g.gainLL).toBeCloseTo(1);
    expect(g.gainRR).toBeCloseTo(1);
    expect(g.gainLR).toBeCloseTo(0);
    expect(g.gainRL).toBeCloseTo(0);
  });

  it('200% → enhanced (gainLL=gainRR=1.5, gainLR=gainRL=-0.5)', () => {
    const g = computeStereoGains(200);
    expect(g.gainLL).toBeCloseTo(1.5);
    expect(g.gainRR).toBeCloseTo(1.5);
    expect(g.gainLR).toBeCloseTo(-0.5);
    expect(g.gainRL).toBeCloseTo(-0.5);
  });

  it('clamps values below 0 to 0%', () => {
    const g = computeStereoGains(-50);
    expect(g.gainLL).toBeCloseTo(0.5);
  });

  it('clamps values above 200 to 200%', () => {
    const g = computeStereoGains(300);
    expect(g.gainLL).toBeCloseTo(1.5);
  });
});
