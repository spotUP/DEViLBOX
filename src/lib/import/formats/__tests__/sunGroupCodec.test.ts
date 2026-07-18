// sunGroupCodec.test.ts
import { describe, it, expect } from 'vitest';
import { decodeSunGroup } from '../sunGroupCodec';

const W = { arpShift: 4, volSlideRateFromStream: false };

describe('decodeSunGroup', () => {
  it('decodes arp-select + note + terminator into one cell', () => {
    // 0x9c 0x04 = arp select 4 ; 0xC7 = note (~0xC7=0x38) ; 0x00 term
    const h1 = new Uint8Array([0x9c, 0x04, 0xc7, 0x00]);
    const g = decodeSunGroup(h1, 0, 0, 0, 0, W);      // transpose=0, curInstr=0, numSampled=0
    expect(g.nextPos).toBe(4);
    expect(g.cell.note).toBeGreaterThan(0);          // note present
    expect(g.cell.effTyp).not.toBe(0);               // arp effect present
    expect(g.cell.sunRaw).toEqual([0x9c, 0x04, 0xc7, 0x00]);
  });
  it('empty group (0x00 only) = sustain: blank note, no fx, sunRaw=[0]', () => {
    const g = decodeSunGroup(new Uint8Array([0x00]), 0, 0, 0, 0, W);
    expect(g.cell.note).toBe(0);
    expect(g.cell.effTyp).toBe(0);
    expect(g.cell.sunRaw).toEqual([0x00]);
    expect(g.nextPos).toBe(1);
  });
});
