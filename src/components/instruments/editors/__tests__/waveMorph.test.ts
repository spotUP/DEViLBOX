import { describe, it, expect } from 'vitest';
import { morphWaves, appendMorphSequence, maxMorphSteps } from '../wavetable/waveMorph';
import { CHIP_TARGETS, WAVE_LIST_MAX } from '../wavetable/chipTargets';

const gb = CHIP_TARGETS.gameboy; // 32 samples x 16 levels
const low = { id: 0, data: new Array(32).fill(0), len: 32, max: 15 };
const high = { id: 3, data: new Array(32).fill(15), len: 32, max: 15 };

describe('morphWaves (Waveform Studio P4)', () => {
  it('runs from A to B inclusive in equal steps at the chip depth', () => {
    const frames = morphWaves(low, high, 4, gb);
    expect(frames).toHaveLength(4);
    expect(frames.map((f) => f[0])).toEqual([0, 5, 10, 15]);
    frames.forEach((f) => expect(f).toHaveLength(32));
  });

  it('quantises a wave of another size to the chip target', () => {
    const big = { id: 1, data: new Array(64).fill(255), len: 64, max: 255 };
    const frames = morphWaves(big, low, 3, gb);
    expect(frames[0]).toEqual(new Array(32).fill(15));
    expect(Math.max(...frames.flat())).toBeLessThanOrEqual(15);
  });
});

describe('appendMorphSequence', () => {
  it('appends only the in-between waves and sequences A, new waves, B by list index', () => {
    const { wavetables, sequence } = appendMorphSequence([low, high], 0, 1, 4, gb);
    expect(wavetables).toHaveLength(4);
    expect(wavetables.slice(2).map((w) => w.id)).toEqual([4, 5]);
    expect(wavetables[2]).toMatchObject({ len: 32, max: 15 });
    expect(sequence).toEqual([0, 2, 3, 1]);
  });
});

describe('morph wave cap', () => {
  it('maxMorphSteps leaves room for exactly the waves that still fit', () => {
    expect(maxMorphSteps(2, 16)).toBe(16); // 14 in-between waves fill a 16-wave Game Boy list
    expect(maxMorphSteps(16, 16)).toBe(2); // full: no in-between wave
    expect(maxMorphSteps(20, 16)).toBe(2);
  });

  it('clamps steps to the Game Boy 16-wave limit and keeps every macro index playable', () => {
    const list = Array.from({ length: 14 }, (_, i) => ({ ...low, id: i }));
    list[13] = { ...high, id: 13 };
    const { wavetables, sequence } = appendMorphSequence(list, 0, 13, 32, gb, 16);
    expect(wavetables).toHaveLength(16);
    expect(Math.max(...sequence)).toBe(15);
  });

  it('adds nothing when the list is already at the limit', () => {
    const list = Array.from({ length: 16 }, (_, i) => ({ ...low, id: i }));
    const { wavetables, sequence } = appendMorphSequence(list, 0, 1, 8, gb, 16);
    expect(wavetables).toHaveLength(16);
    expect(sequence).toEqual([0, 1]);
  });

  it('defaults to the 64-wave list cap', () => {
    const list = Array.from({ length: 60 }, (_, i) => ({ ...low, id: i }));
    expect(appendMorphSequence(list, 0, 1, 32, gb).wavetables).toHaveLength(WAVE_LIST_MAX);
  });
});
