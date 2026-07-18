// sunGroupCodec.test.ts
import { describe, it, expect } from 'vitest';
import { decodeSunGroup, encodeSunGroup } from '../sunGroupCodec';
import { sunPitchToNote } from '../SunTronicV13';

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

describe('encodeSunGroup', () => {
  it('noteToSunPitch is the exact inverse of sunPitchToNote for all encodable notes (13..84)', () => {
    // sunPitchToNote(raw) = raw + 13, valid when result is 1..96
    // noteToSunPitch(note) = note - 13
    // Note bytes in the stream are 0xB8..0xFF → raw = (~byte)&0xff = 0..71
    // → valid note round-trip range without transpose: note=13..84 (raw 0..71)
    // Notes 85..96 map to raw 72..83 → byte 0xB0..0xB7 which are NOT note bytes
    // (below the 0xB8 threshold), so only 13..84 round-trips through encodeSunGroup.
    for (let n = 13; n <= 84; n++) {
      // Verify the algebraic inverse: sunPitchToNote(noteToSunPitch(n)) === n
      expect(sunPitchToNote(n - 13)).toBe(n);
      // Verify the byte-level round-trip through encodeSunGroup/decodeSunGroup
      const h1 = new Uint8Array([0xc7, 0x00]); // arbitrary note group (note=69)
      const { cell: base } = decodeSunGroup(h1, 0, 0, 0, 0, W);
      const edited = { ...base, note: n as typeof base.note };
      const bytes = encodeSunGroup(edited, 0, 0, W);
      const back = decodeSunGroup(new Uint8Array(bytes), 0, 0, 0, 0, W);
      expect(back.cell.note).toBe(n);
    }
  });

  it('re-emits unedited group verbatim from sunRaw', () => {
    const h1 = new Uint8Array([0x9c, 0x04, 0xc7, 0x00]);
    const { cell } = decodeSunGroup(h1, 0, 0, 0, 0, W); // transpose=0, curInstr=0, numSampled=0
    expect(encodeSunGroup(cell, 0, 0, W)).toEqual([0x9c, 0x04, 0xc7, 0x00]);
  });

  it('re-encodes when the note is edited (decodes back to the new note)', () => {
    const h1 = new Uint8Array([0xc7, 0x00]);
    const { cell } = decodeSunGroup(h1, 0, 0, 0, 0, W);
    const edited = { ...cell, note: (cell.note + 2) as typeof cell.note };
    const bytes = encodeSunGroup(edited, 0, 0, W);
    const back = decodeSunGroup(new Uint8Array(bytes), 0, 0, 0, 0, W);
    expect(back.cell.note).toBe(edited.note);
  });

  it('re-encodes group with FX when edited (FX survives round-trip)', () => {
    // 0x9c 0x04 = arp select (effTyp 39, param 4); 0xc7 = note; 0x00 = term
    const h1 = new Uint8Array([0x9c, 0x04, 0xc7, 0x00]);
    const { cell } = decodeSunGroup(h1, 0, 0, 0, 0, W);
    // Edit the note so verbatim path is skipped
    const edited = { ...cell, note: (cell.note + 2) as typeof cell.note };
    const bytes = encodeSunGroup(edited, 0, 0, W);
    const back = decodeSunGroup(new Uint8Array(bytes), 0, 0, 0, 0, W);
    expect(back.cell.note).toBe(edited.note);
    expect(back.cell.effTyp).toBe(39); // arp-select effect preserved
    expect(back.cell.eff).toBe(4);
  });

  it('handles empty group (sustain cell) — re-emits verbatim [0x00]', () => {
    const h1 = new Uint8Array([0x00]);
    const { cell } = decodeSunGroup(h1, 0, 0, 0, 0, W);
    expect(encodeSunGroup(cell, 0, 0, W)).toEqual([0x00]);
  });

  it('re-encodes volSlide with rate (effTyp-10 + effTyp-40) → 0x9a two-byte', () => {
    const W2 = { arpShift: 4, volSlideRateFromStream: true };
    // 0x9a 0x30 0x02 = volSlide amount=0x30, rate=0x02; 0x00 = term
    const h1 = new Uint8Array([0x9a, 0x30, 0x02, 0x00]);
    const { cell } = decodeSunGroup(h1, 0, 0, 0, 0, W2);
    // Verbatim path: unedited → returns sunRaw verbatim
    expect(encodeSunGroup(cell, 0, 0, W2)).toEqual([0x9a, 0x30, 0x02, 0x00]);
    // Edit note (note=0 on this group, so add a note to force re-encode)
    const edited = { ...cell, note: 20 as typeof cell.note };
    const bytes = encodeSunGroup(edited, 0, 0, W2);
    const back = decodeSunGroup(new Uint8Array(bytes), 0, 0, 0, 0, W2);
    const cols = [
      { typ: back.cell.effTyp,  val: back.cell.eff  },
      { typ: back.cell.effTyp2, val: back.cell.eff2 },
      { typ: back.cell.effTyp3, val: back.cell.eff3 },
    ];
    const amount = cols.find(c => c.typ === 10);
    const rate   = cols.find(c => c.typ === 40);
    expect(amount?.val).toBe(0x30);
    expect(rate?.val).toBe(0x02);
  });
});
