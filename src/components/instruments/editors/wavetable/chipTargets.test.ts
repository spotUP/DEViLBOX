import { describe, it, expect } from 'vitest';
import { CHIP_TARGETS, CHIP_TARGET_ORDER } from './chipTargets';

// Width x height from third-party/furnace-master/src/engine/sysDef.cpp (waveWid, waveHei).
const FURNACE: Record<string, [number, number]> = {
  pce: [32, 32], 'namco-wsg': [32, 16], scc: [32, 256], wonderswan: [32, 16], virtualboy: [32, 64],
};

describe('chip targets', () => {
  it('lists every target in the order table', () => {
    expect([...CHIP_TARGET_ORDER].sort()).toEqual(Object.keys(CHIP_TARGETS).sort());
  });
  it.each(Object.entries(FURNACE))('%s matches Furnace', (id, [w, h]) => {
    const t = CHIP_TARGETS[id as keyof typeof CHIP_TARGETS];
    expect([t.defaultLen, t.maxLen, t.maxValue + 1]).toEqual([w, w, h]);
    expect(2 ** t.bitDepth).toBe(h);
  });
});
