import { describe, it, expect } from 'vitest';
import { CHIP_TARGETS, CHIP_TARGET_ORDER, chipLimitsLabel, detectChipTarget, fitsChipTarget } from './chipTargets';

// Width x height from third-party/furnace-master/src/engine/sysDef.cpp (waveWid, waveHei).
const FURNACE: Record<string, [number, number]> = {
  gameboy: [32, 16], fds: [64, 64], pce: [32, 32], 'namco-wsg': [32, 16], scc: [32, 256], wonderswan: [32, 16], virtualboy: [32, 64],
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
  it('detects a 64 x 64 wave as FDS and a 32 x 64 wave as Virtual Boy', () => {
    expect(detectChipTarget(64, 63)).toBe('fds');
    expect(detectChipTarget(32, 63)).toBe('virtualboy');
  });
});

describe('chip limits', () => {
  it('labels fixed and variable targets in plain words', () => {
    expect(chipLimitsLabel(CHIP_TARGETS.scc)).toBe('32 samples x 256 levels, 8-bit signed');
    expect(chipLimitsLabel(CHIP_TARGETS.n163)).toBe('4-252 samples (step 4) x 16 levels, 4-bit unsigned');
  });
  it('fits only at the chip length step and depth', () => {
    expect(fitsChipTarget(CHIP_TARGETS.gameboy, 32, 15)).toBe(true);
    expect(fitsChipTarget(CHIP_TARGETS.gameboy, 32, 31)).toBe(false);
    expect(fitsChipTarget(CHIP_TARGETS.n163, 34, 15)).toBe(false);
    expect(fitsChipTarget(CHIP_TARGETS.n163, 36, 15)).toBe(true);
  });
});
