/**
 * Effect columns 2-8 reach libopenmpt (reported 2026-10-20: commands typed in
 * the second effect column did nothing on sample channels).
 *
 * libopenmpt plays an XM cell: one command plus the volume column. The edit
 * bridge used to write column 1 only, so a Dxx, Bxx or Fxx typed in any other
 * column was never in the module.
 */
import { describe, it, expect } from 'vitest';
import { foldEffectColumnsForXM, effectToVolumeColumnByte } from '../volumeColumn';

const slot = (effTyp: number, eff: number) => ({ effTyp, eff });
const none = slot(0, 0);

describe('foldEffectColumnsForXM', () => {
  it('a flow effect in column 2 wins the command slot over column 1', () => {
    const r = foldEffectColumnsForXM(0, [slot(1, 0x02), slot(13, 0x00)]);
    expect(r.command).toEqual(slot(13, 0x00));
  });

  it('column 1 keeps the command slot when it is a flow effect', () => {
    const r = foldEffectColumnsForXM(0, [slot(15, 0x06), slot(13, 0x00)]);
    expect(r.command).toEqual(slot(15, 0x06));
  });

  it('a command typed only in column 3 is kept', () => {
    const r = foldEffectColumnsForXM(0, [none, none, slot(1, 0x10)]);
    expect(r.command).toEqual(slot(1, 0x10));
  });

  it('the displaced column 1 effect moves to the volume column when it has a form there', () => {
    const r = foldEffectColumnsForXM(0, [slot(10, 0x04), slot(13, 0x00)]);
    expect(r.command).toEqual(slot(13, 0x00));
    expect(r.volume).toBe(0x64);
  });

  it('a cell volume is never overwritten', () => {
    const r = foldEffectColumnsForXM(0x30, [slot(10, 0x04), slot(13, 0x00)]);
    expect(r.volume).toBe(0x30);
  });

  it('a single column 1 effect is written unchanged', () => {
    expect(foldEffectColumnsForXM(0, [slot(4, 0x37), none])).toEqual({ volume: 0, command: slot(4, 0x37) });
  });

  it('an empty cell stays empty', () => {
    expect(foldEffectColumnsForXM(0, [none, none])).toEqual({ volume: 0, command: none });
  });
});

describe('effectToVolumeColumnByte', () => {
  it('maps the effects the XM volume column can hold', () => {
    expect(effectToVolumeColumnByte(0xC, 0x20)).toBe(0x30);
    expect(effectToVolumeColumnByte(0xA, 0x40)).toBe(0x74);
    expect(effectToVolumeColumnByte(0xA, 0x05)).toBe(0x65);
    expect(effectToVolumeColumnByte(0x8, 0x80)).toBe(0xC8);
    expect(effectToVolumeColumnByte(0x4, 0x37)).toBe(0xB7);
    expect(effectToVolumeColumnByte(0x3, 0x20)).toBe(0xF2);
    expect(effectToVolumeColumnByte(0xE, 0xA3)).toBe(0x93);
    expect(effectToVolumeColumnByte(0xE, 0xB3)).toBe(0x83);
  });

  it('returns 0 for effects with no volume-column form', () => {
    expect(effectToVolumeColumnByte(0xD, 0x00)).toBe(0);
    expect(effectToVolumeColumnByte(0x1, 0x02)).toBe(0);
  });
});
