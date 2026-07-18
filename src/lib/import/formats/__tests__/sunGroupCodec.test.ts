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

  it('0x94 glide does not clobber a preceding effect (setVolume in slot 0)', () => {
    // 0x99 0x40 = setVolume (effTyp 12, param 0x40) goes into slot 0
    // 0x94 0x40 = setPitchNoRetrig — glide (effTyp 3) must land in slot 1
    // 0x00 = terminator
    const h1 = new Uint8Array([0x99, 0x40, 0x94, 0x40, 0x00]);
    const g = decodeSunGroup(h1, 0, 0, 0, 0, W);
    // Slot 0 must still hold setVolume (effTyp 12)
    expect(g.cell.effTyp).toBe(12);
    expect(g.cell.eff).toBe(0x40);
    // Glide (effTyp 3) must appear in a later slot — check slot 1 (effTyp2)
    expect(g.cell.effTyp2).toBe(3);
  });

  it('0x9a two-byte variant emits amount (effTyp 10) AND rate (effTyp 40)', () => {
    // volSlideRateFromStream=true → sunCommandLen gives 0x9a 2 arg bytes
    const W2 = { arpShift: 4, volSlideRateFromStream: true };
    // 0x9a 0x30 0x02 = volSlide amount=0x30, rate=0x02 ; 0x00 = terminator
    const h1 = new Uint8Array([0x9a, 0x30, 0x02, 0x00]);
    const g = decodeSunGroup(h1, 0, 0, 0, 0, W2);
    // Find effTyp 10 and effTyp 40 across all fx columns
    const cols = [
      { typ: g.cell.effTyp,  val: g.cell.eff  },
      { typ: g.cell.effTyp2, val: g.cell.eff2 },
      { typ: g.cell.effTyp3, val: g.cell.eff3 },
      { typ: g.cell.effTyp4, val: g.cell.eff4 },
      { typ: g.cell.effTyp5, val: g.cell.eff5 },
    ];
    const amount = cols.find(c => c.typ === 10);
    const rate   = cols.find(c => c.typ === 40);
    expect(amount).toBeDefined();
    expect(amount?.val).toBe(0x30);
    expect(rate).toBeDefined();
    expect(rate?.val).toBe(0x02);
  });

  it('instrument mapping uses numSampled for synth select (sel >= 0x40)', () => {
    // Note byte 0xb8 = first valid note (0xb8 >= 0xb8), followed by synth select 0x40+3=0x43
    // sunCommandLen for a note with a trailing select gives len=2.
    // numSampled=5: expected instrument = 5 + (0x43 & 0x3f) + 1 = 5 + 3 + 1 = 9
    const h1 = new Uint8Array([0xb8, 0x43, 0x00]);
    const g = decodeSunGroup(h1, 0, 0, 0, 5, W);
    expect(g.cell.note).toBeGreaterThan(0);
    expect(g.cell.instrument).toBe(9); // 5 + (0x43 & 0x3f) + 1
  });
});
