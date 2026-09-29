/**
 * The Gothenburg tone is offered: HM-2 into the amp with every setting at max.
 *
 * Owner (2026-09-29): "the true gothenburg sound has everything on max so we
 * should offer that". The Chainsaw's presets had the HM-2 at 55-90 % and the
 * master preset at 55 % gain, wet 80 %.
 */
import { describe, it, expect } from 'vitest';
import { EffectRegistry } from '@engine/registry/EffectRegistry';
import '@engine/registry/effects/wasm';
import { FX_PRESETS } from '../fxPresets';

const EVERYTHING_MAX = { pedalGain: 100, ampGain: 100, bass: 100, middle: 100, treble: 100 };

describe('Gothenburg presets', () => {
  it('the Chainsaw offers Gothenburg (Everything Max) first', () => {
    const presets = EffectRegistry.get('SwedishChainsaw')!.presets!;
    expect(presets[0].name).toBe('Gothenburg (Everything Max)');
    expect(presets[0].params).toMatchObject({ tight: 0, ...EVERYTHING_MAX });
  });

  it('the Swedish death metal presets all run the HM-2 at max', () => {
    const presets = EffectRegistry.get('SwedishChainsaw')!.presets!;
    for (const name of ['Gothenburg Sound', 'Sunlight Studio', 'Entombed Buzz', 'Dismember Grind']) {
      expect(presets.find((p) => p.name === name)?.params.pedalGain, name).toBe(100);
    }
  });

  it('the Swedish Chainsaw master preset is everything on max, fully wet', () => {
    const fx = FX_PRESETS.find((p) => p.name === 'Swedish Chainsaw')!.effects.find((e) => e.type === 'SwedishChainsaw')!;
    expect(fx.wet).toBe(100);
    expect(fx.parameters).toMatchObject(EVERYTHING_MAX);
  });
});
