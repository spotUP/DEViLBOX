/**
 * The instrument header's preset dropdown and new-instrument auto-init read FACTORY_PRESETS, not the SynthPreset
 * list in synthPresets/. The Golden Era kit lived only in the latter, so an Up Rough Softsynth instrument showed
 * "No Presets" and started without its showcase preset. The Add Instrument Presets tab reads PRESET_CATEGORIES, a
 * third list, where a "Golden Era" search found nothing.
 */
import { describe, it, expect } from 'vitest';
import { FACTORY_PRESETS, PRESET_CATEGORIES, getFirstPresetForSynthType } from '../factoryPresets';
import { UPROUGH_SOFTSYNTH_PRESETS } from '@constants/synthPresets/upRoughSoftsynth';

describe('Up Rough Softsynth presets in the preset dropdown', () => {
  it('lists every Golden Era voice with its voice and params', () => {
    const listed = FACTORY_PRESETS.filter((p) => p.synthType === 'UpRoughSoftsynth');
    expect(listed.map((p) => p.name)).toEqual(UPROUGH_SOFTSYNTH_PRESETS.map((p) => p.name));
    for (const p of UPROUGH_SOFTSYNTH_PRESETS) {
      const entry = listed.find((e) => e.name === p.name);
      expect(entry?.upRoughSoftsynth).toEqual(p.config);
    }
  });

  it('starts a new instrument on the showcase preset', () => {
    const first = getFirstPresetForSynthType('UpRoughSoftsynth');
    expect(first?.name).toBe('Golden Era 808 Bass');
    expect(first?.upRoughSoftsynth?.voice).toBe('bass808');
  });

  it('lists the kit in a Presets tab category', () => {
    const categories = Object.values(PRESET_CATEGORIES) as { name: string; synthType?: string }[][];
    const listed = categories.flat().filter((p) => p.synthType === 'UpRoughSoftsynth');
    expect(listed.map((p) => p.name)).toEqual(UPROUGH_SOFTSYNTH_PRESETS.map((p) => p.name));
  });
});
