/**
 * The Modern master presets (owner ask 2026-09-29: "super modern and polished
 * with side chaining ... surgically modern produced").
 *
 * Guards what a preset cannot check for itself: every effect exists, every
 * parameter is one the effect reads (a misspelt key is silently the default),
 * every preset ducks on the song's drums, and none widens the stereo image
 * (Amiga material goes near-mono at gigs).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EffectRegistry } from '@engine/registry/EffectRegistry';
import '@engine/registry/effects/tonejs';
import '@engine/registry/effects/wasm';
import { FX_PRESETS } from '../fxPresets';
import { SIDECHAIN_KEY_DRUMS } from '@engine/tone/sidechainKey';

const modern = FX_PRESETS.filter((p) => p.tags.includes('Modern'));
const ROUTING_PARAMS = new Set(['sidechainSource']);

describe('Modern master presets', () => {
  it('there are four', () => {
    expect(modern.map((p) => p.name)).toEqual(['Modern Precision', 'Modern Club Pump', 'Modern Glue & Air', 'Modern Amiga Master']);
  });

  it('use only registered effects and parameters those effects read', () => {
    for (const preset of modern) {
      for (const fx of preset.effects) {
        const desc = EffectRegistry.get(fx.type);
        expect(desc, `${preset.name}: ${fx.type}`).toBeTruthy();
        const known = new Set(Object.keys(desc!.getDefaultParameters?.() ?? {}));
        for (const key of Object.keys(fx.parameters ?? {})) {
          if (ROUTING_PARAMS.has(key)) continue;
          expect(known.has(key), `${preset.name}: ${fx.type}.${key}`).toBe(true);
        }
      }
    }
  });

  it('each ducks on the song drums through a keyed sidechain effect', () => {
    for (const preset of modern) {
      const keyed = preset.effects.filter((fx) => EffectRegistry.get(fx.type)?.sidechainKeyed);
      expect(keyed.length, preset.name).toBeGreaterThanOrEqual(1);
      expect(keyed.every((fx) => fx.parameters?.sidechainSource === SIDECHAIN_KEY_DRUMS), preset.name).toBe(true);
    }
  });

  it('never widen: no wideners, no band width above 1, lows folded to mono', () => {
    for (const preset of modern) {
      for (const fx of preset.effects) {
        expect(['StereoWidener', 'HaasEnhancer', 'MultiSpread', 'BinauralPanner']).not.toContain(fx.type);
        if (fx.type === 'MultibandEnhancer') {
          const p = fx.parameters as Record<string, number>;
          for (const k of ['lowWidth', 'midWidth', 'highWidth', 'topWidth']) expect(p[k], `${preset.name} ${k}`).toBeLessThanOrEqual(1);
          expect(p.lowWidth, preset.name).toBe(0);
        }
      }
    }
  });

  it('every registered effect is an AudioEffectType, so presets need no cast', () => {
    const union = readFileSync('src/types/instrument/effects.ts', 'utf8');
    for (const id of EffectRegistry.getAll().filter((d) => d.category === 'wasm' || d.category === 'tonejs').map((d) => d.id)) {
      expect(union.includes(`'${id}'`), id).toBe(true);
    }
  });
});
