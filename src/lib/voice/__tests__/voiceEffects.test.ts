import { describe, it, expect } from 'vitest';
import { ownCellEffects, voiceEffectSet, type VoiceEffect } from '../voiceEffects';

const fx = (kind: VoiceEffect['kind'], param: number, rowOffset = 0): VoiceEffect => ({ kind, param, rowOffset });

describe('voice effects encode per channel notation (VNR-14)', () => {
  it('tracker notation: one hex type digit, retrigger and note delay as Exy', () => {
    const set = voiceEffectSet('tracker', 2);
    expect(set.encode('arpeggio', 0x47)).toEqual({ effTyp: 0x0, eff: 0x47 });
    expect(set.encode('portaUp', 0x10)).toEqual({ effTyp: 0x1, eff: 0x10 });
    expect(set.encode('portaDown', 0x10)).toEqual({ effTyp: 0x2, eff: 0x10 });
    expect(set.encode('tonePorta', 0x20)).toEqual({ effTyp: 0x3, eff: 0x20 });
    expect(set.encode('vibrato', 0x68)).toEqual({ effTyp: 0x4, eff: 0x68 });
    expect(set.encode('volumeSlide', 0x02)).toEqual({ effTyp: 0xa, eff: 0x02 });
    expect(set.encode('retrigger', 2)).toEqual({ effTyp: 0xe, eff: 0x92 });
    expect(set.encode('noteDelay', 3)).toEqual({ effTyp: 0xe, eff: 0xd3 });
  });

  it('furnace notation: raw effect types, retrigger 0C, note delay ED', () => {
    const set = voiceEffectSet('furnace', 4);
    expect(set.encode('tonePorta', 0x20)).toEqual({ effTyp: 0x03, eff: 0x20 });
    expect(set.encode('retrigger', 2)).toEqual({ effTyp: 0x0c, eff: 0x02 });
    expect(set.encode('noteDelay', 3)).toEqual({ effTyp: 0xed, eff: 0x03 });
  });

  it('clamps the nibble of Exy commands and the byte of the others', () => {
    const set = voiceEffectSet('tracker', 2);
    expect(set.encode('retrigger', 20)).toEqual({ effTyp: 0xe, eff: 0x9f });
    expect(set.encode('noteDelay', 0)).toEqual({ effTyp: 0xe, eff: 0xd1 });
    expect(set.encode('tonePorta', 999)).toEqual({ effTyp: 0x3, eff: 0xff });
  });

  it('a cell keeps the effects that matter most when the channel has fewer columns', () => {
    const effects = [fx('volumeSlide', 0x02), fx('vibrato', 0x68), fx('noteDelay', 2)];
    expect(voiceEffectSet('tracker', 1).commands(effects)).toEqual([{ effTyp: 0xe, eff: 0xd2 }]);
    expect(voiceEffectSet('tracker', 2).commands(effects)).toEqual([
      { effTyp: 0xe, eff: 0xd2 },
      { effTyp: 0x4, eff: 0x68 },
    ]);
    expect(voiceEffectSet('tracker', 8).commands(effects)).toHaveLength(3);
    expect(voiceEffectSet('tracker', 0).maxColumns).toBe(1);
  });

  it('only rowOffset 0 effects land on the note cell', () => {
    const own = fx('noteDelay', 2);
    expect(ownCellEffects([fx('tonePorta', 6, 1), own, fx('tonePorta', 6, 2)])).toEqual([own]);
    expect(ownCellEffects(undefined)).toEqual([]);
  });
});
