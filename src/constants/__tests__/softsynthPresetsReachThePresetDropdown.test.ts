/**
 * The instrument header's preset dropdown and new-instrument auto-init read FACTORY_PRESETS, not the SynthPreset
 * list in synthPresets/. The Golden Era kit lived only in the latter, so an Up Rough Softsynth instrument showed
 * "No Presets" and started without its showcase preset.
 */
import { describe, it, expect } from 'vitest';
import { FACTORY_PRESETS, getFirstPresetForSynthType } from '../factoryPresets';
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
});
