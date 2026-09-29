/**
 * 'Chip Metal' makes a chip song metal (owner ask 2026-09-29: "a preset
 * specifically for making chip songs sound like metal include the swedish
 * chainsaw").
 *
 * The HM-2 runs everything-max but tight and in parallel, so the bass line
 * and kick stay defined under the distorted wall; the kick ducks the wall.
 */
import { describe, it, expect } from 'vitest';
import { EffectRegistry } from '@engine/registry/EffectRegistry';
import '@engine/registry/effects/tonejs';
import '@engine/registry/effects/wasm';
import { FX_PRESETS } from '../fxPresets';
import { SIDECHAIN_KEY_DRUMS } from '@engine/tone/sidechainKey';

const preset = FX_PRESETS.find((p) => p.name === 'Chip Metal')!;

describe("'Chip Metal' master preset", () => {
  it('exists and uses only registered effects and parameters they read', () => {
    expect(preset).toBeTruthy();
    for (const fx of preset.effects) {
      const desc = EffectRegistry.get(fx.type);
      expect(desc, fx.type).toBeTruthy();
      const known = new Set(Object.keys(desc!.getDefaultParameters?.() ?? {}));
      for (const key of Object.keys(fx.parameters ?? {})) {
        if (key === 'sidechainSource') continue;
        expect(known.has(key), `${fx.type}.${key}`).toBe(true);
      }
    }
  });

  it('runs the Swedish Chainsaw everything-max, tight, in parallel', () => {
    const saw = preset.effects.find((fx) => fx.type === 'SwedishChainsaw')!;
    expect(saw.parameters).toMatchObject({ tight: 100, pedalGain: 100, ampGain: 100, bass: 100, middle: 100, treble: 100 });
    expect(saw.wet).toBeGreaterThan(0);
    expect(saw.wet).toBeLessThan(100);
  });

  it('ducks the wall on the song drums', () => {
    const keyed = preset.effects.filter((fx) => EffectRegistry.get(fx.type)?.sidechainKeyed);
    expect(keyed.map((fx) => fx.parameters?.sidechainSource)).toEqual([SIDECHAIN_KEY_DRUMS]);
  });

  it('ends in a ceiling', () => {
    expect(preset.effects.at(-1)?.type).toBe('Maximizer');
  });
});
