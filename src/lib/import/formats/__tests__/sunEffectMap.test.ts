// sunEffectMap.test.ts
import { describe, it, expect } from 'vitest';
import { SUN_EFFECT_BY_OP, sunEncodeEffect } from '../sunEffectMap';
import { SUN_FX } from '../sunEffectGlyphs';
import type { SunCmdWidths } from '../SunTronicV13';

const MAIN: SunCmdWidths = { arpShift: 4, volSlideRateFromStream: false };   // 0x9b = 2-byte word
const VERA: SunCmdWidths = { arpShift: 0, volSlideRateFromStream: false };   // 0x9b = 1 signed byte

describe('sunEffectMap', () => {
  it('maps every control opcode 0x8b..0x9c plus 0x97', () => {
    for (let op = 0x8b; op <= 0x9c; op++) expect(SUN_EFFECT_BY_OP.has(op)).toBe(true);
    expect(SUN_EFFECT_BY_OP.has(0x97)).toBe(true);
  });

  it('setVolume 0x99 decode/encode round-trip (Cxx, effTyp 12)', () => {
    const def = SUN_EFFECT_BY_OP.get(0x99)!;
    expect(def.decode([0x40])).toEqual({ effTyp: 12, param: 0x40 });
    expect(sunEncodeEffect(12, 0x40, MAIN)).toEqual({ op: 0x99, argBytes: [0x40] });
  });

  it('every non-empty opcode round-trips decode -> sunEncodeEffect -> same op+bytes', () => {
    // representative arg bytes per opcode arity (skip 0x9a/0x9b/0x95/0x96 — asserted separately)
    const cases: Array<[number, number[]]> = [
      [0x9c, [0x11]], [0x99, [0x30]], [0x98, [0x06]], [0x8f, [0x03]],
      [0x94, [0x24]], [0x93, [0x01, 0x02]], [0x92, [0x38]], [0x91, [0x01]],
      [0x90, [0x05]], [0x8e, [0x01, 0x40]], [0x8d, [0x00, 0x08]],
      [0x8c, [0x0c]], [0x8b, [0x08]], [0x97, [0xab, 0xcd]],
    ];
    for (const [op, bytes] of cases) {
      const { effTyp, param } = SUN_EFFECT_BY_OP.get(op)!.decode(bytes);
      expect(sunEncodeEffect(effTyp, param, MAIN)).toEqual({ op, argBytes: bytes });
    }
  });

  it('Fxx split: speed (<0x20) -> 0x98 effTyp 15, tempo (>=0x20 word) -> 0x8e ciaTempo', () => {
    expect(SUN_EFFECT_BY_OP.get(0x98)!.decode([0x06])).toEqual({ effTyp: 15, param: 0x06 });
    expect(SUN_EFFECT_BY_OP.get(0x8e)!.decode([0x01, 0x40])).toEqual({ effTyp: SUN_FX.ciaTempo, param: 0x0140 });
    expect(sunEncodeEffect(15, 0x06, MAIN)).toEqual({ op: 0x98, argBytes: [0x06] });
    expect(sunEncodeEffect(SUN_FX.ciaTempo, 0x0140, MAIN)).toEqual({ op: 0x8e, argBytes: [0x01, 0x40] });
  });

  it('pitchSlide 0x9b: sign -> effTyp 1/2, variant width on encode', () => {
    const def = SUN_EFFECT_BY_OP.get(0x9b)!;
    expect(def.decode([0x05])).toEqual({ effTyp: 1, param: 0x05 });        // +5, 1-byte
    expect(def.decode([0xfb])).toEqual({ effTyp: 2, param: 0x05 });        // -5 sign-ext, magnitude 5
    expect(sunEncodeEffect(1, 0x05, VERA)).toEqual({ op: 0x9b, argBytes: [0x05] });
    expect(sunEncodeEffect(2, 0x05, VERA)).toEqual({ op: 0x9b, argBytes: [0xfb] });
    expect(sunEncodeEffect(1, 0x05, MAIN)).toEqual({ op: 0x9b, argBytes: [0x00, 0x05] });
    expect(sunEncodeEffect(2, 0x05, MAIN)).toEqual({ op: 0x9b, argBytes: [0xff, 0xfb] });
  });

  it('volSlide rate (SUN_FX.volSlideRate) is not independently encodable', () => {
    expect(SUN_EFFECT_BY_OP.get(0x9a)!.decode([0x30])).toEqual({ effTyp: 10, param: 0x30 });
    expect(sunEncodeEffect(SUN_FX.volSlideRate, 0x02, MAIN)).toBeNull();
  });
});
