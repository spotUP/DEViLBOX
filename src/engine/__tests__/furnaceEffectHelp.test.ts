import { describe, it, expect } from 'vitest';
import { FURNACE_EFFECT_TABLE, FURNACE_EFFECT_TEXT } from '../furnace-dispatch/furnaceEffectTable.gen';
import { SYNTH_TO_DISPATCH } from '../furnace-dispatch/synthPlatforms';
import { getAllFurnaceEffects, getFurnaceSystemEffects } from '../../utils/ft2EffectDescriptions';

const lanes = ['effect', 'post', 'pre'] as const;

describe('effect help comes from Furnace sysDef.cpp strings', () => {
  const systems = Object.keys(FURNACE_EFFECT_TABLE).map(Number);

  it('every handler in the table has a help string', () => {
    for (const s of systems) {
      for (const l of lanes) {
        expect(Object.keys(FURNACE_EFFECT_TEXT[s][l]), `system ${s} ${l}`).toEqual(Object.keys(FURNACE_EFFECT_TABLE[s][l]));
      }
    }
  });

  it('the picker source returns exactly Furnace\'s list (count and text) for every system', () => {
    let total = 0;
    for (const s of systems) {
      const expected = lanes.flatMap((l) => Object.values(FURNACE_EFFECT_TEXT[s][l]));
      const got = getFurnaceSystemEffects(s).map((e) => e.description);
      expect(got, `system ${s}`).toEqual(expected);
      total += got.length;
    }
    expect(total).toBeGreaterThan(2000);
  });

  it('a synth type resolves to its chip\'s list', () => {
    for (const [synth, id] of Object.entries(SYNTH_TO_DISPATCH)) {
      expect(getAllFurnaceEffects(synth), synth).toEqual(getFurnaceSystemEffects(id));
    }
    expect(getAllFurnaceEffects('NotAFurnaceSynth')).toEqual([]);
  });
});
