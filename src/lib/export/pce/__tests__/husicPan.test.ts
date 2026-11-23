import { describe, expect, it } from 'vitest';
import { linearPan } from '../husicSong';

// Furnace playback.cpp 0x80 -> convertPanLinearToSplit(v, 8, 255) -> pce.cpp pan = (L & 0xf0) | (R >> 4)
describe('PCE 80xx pan', () => {
  it('maps linear pan to the reg5 byte Furnace writes', () => {
    expect(linearPan(0x00)).toBe(0xf0);
    expect(linearPan(0x80)).toBe(0xff);
    expect(linearPan(0xff)).toBe(0x0f);
    expect(linearPan(0xc0)).toBe(0x7f);
  });
});
