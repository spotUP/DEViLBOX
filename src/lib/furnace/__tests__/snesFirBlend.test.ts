import { describe, it, expect } from 'vitest';
import { interpolateFir, SnesFirBlender, firBlendEffects, SNES_FIR_BLEND_EFFECT } from '../snesFirBlend';

const FLAT = [127, 0, 0, 0, 0, 0, 0, 0];
const T = (i: number, v: number) => ({ cmd: 0x30 + i, val: v & 255 });

describe('interpolateFir', () => {
  it('moves linearly and ends on the target', () => {
    expect(interpolateFir([0, 0, 0, 0, 0, 0, 0, 0], [80, 0, 0, 0, 0, 0, 0, -40], 2, 4)).toEqual([40, 0, 0, 0, 0, 0, 0, -20]);
    expect(interpolateFir(FLAT, [0, 0, 0, 0, 0, 0, 0, 0], 4, 4)[0]).toBe(0);
  });
});

describe('SnesFirBlender', () => {
  it('jumps without 38xx', () => {
    const b = new SnesFirBlender(FLAT);
    expect(b.row('0', [T(0, 0)])).toEqual([[0, 0]]);
    expect(b.row('1', [])).toEqual([]);
  });
  it('steps once per row over N rows, however many channels report the row', () => {
    const b = new SnesFirBlender(FLAT);
    const seen: number[] = [];
    seen.push(b.taps[0]);
    b.row('0', [T(0, 0), { cmd: SNES_FIR_BLEND_EFFECT, val: 4 }]);
    b.row('0', []); // second channel, same row
    seen.push(b.taps[0]);
    for (let r = 1; r < 5; r++) { b.row(String(r), []); seen.push(b.taps[0]); }
    expect(seen).toEqual([127, 95, 64, 32, 0, 0]);
  });
  it('a tap write without 38xx ends a running blend', () => {
    const b = new SnesFirBlender(FLAT);
    b.row('0', [T(0, 0), { cmd: SNES_FIR_BLEND_EFFECT, val: 8 }]);
    b.row('1', [T(0, 50)]);
    expect(b.taps[0]).toBe(50);
    b.row('2', []);
    expect(b.taps[0]).toBe(50);
  });
});

describe('firBlendEffects', () => {
  it('writes changed taps then the blend length, clamped to 2..255', () => {
    const fx = firBlendEffects(FLAT, [0, 127, 0, 0, 0, 0, 0, 0], 1, 8)!;
    expect(fx.at(-1)).toEqual({ effTyp: 0x38, eff: 2 });
    expect(fx.slice(0, 2)).toEqual([{ effTyp: 0x30, eff: 0 }, { effTyp: 0x31, eff: 127 }]);
  });
  it('returns null when the changed taps do not fit', () => {
    expect(firBlendEffects(FLAT, [0, 1, 2, 3, 4, 5, 6, 7], 8, 4)).toBeNull();
  });
});
