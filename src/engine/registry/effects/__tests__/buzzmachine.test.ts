/**
 * Regression: Buzzmachine effects are registered as effect descriptors so they appear in the
 * effect chain + preset system (previously they existed only as BuzzmachineEngine synths).
 * Validates the generated descriptors are well-formed — no audio is exercised here.
 */
import { describe, it, expect } from 'vitest';
import { EffectRegistry } from '../../EffectRegistry';
import { BUZZ_EFFECT_IDS } from '../buzzmachine';

describe('buzzmachine effect registry', () => {
  it('registers 22 effect descriptors', () => {
    expect(BUZZ_EFFECT_IDS).toHaveLength(22);
    expect(new Set(BUZZ_EFFECT_IDS).size).toBe(22); // no duplicate ids
  });

  it('each descriptor is well-formed and self-consistent', () => {
    for (const id of BUZZ_EFFECT_IDS) {
      const d = EffectRegistry.get(id);
      expect(d, id).toBeTruthy();
      if (!d) continue;
      expect(d.category).toBe('wasm');
      expect(typeof d.create).toBe('function');
      expect(d.loadMode).toBe('lazy');

      const defaults = d.getDefaultParameters();
      const paramKeys = (d.parameters ?? []).map((p) => p.key);
      // Every declared parameter has a default, and defaults only cover declared params.
      expect(Object.keys(defaults).sort()).toEqual([...paramKeys].sort());

      // Presets only reference declared params and stay within [min,max].
      expect(d.presets?.length).toBe(3);
      for (const preset of d.presets ?? []) {
        for (const [k, v] of Object.entries(preset.params)) {
          const pd = d.parameters?.find((p) => p.key === k);
          expect(pd, `${id} preset param ${k}`).toBeTruthy();
          if (pd) {
            expect(v).toBeGreaterThanOrEqual(pd.min ?? -Infinity);
            expect(v).toBeLessThanOrEqual(pd.max ?? Infinity);
          }
        }
      }
    }
  });
});
