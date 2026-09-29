/**
 * Factory presets use each effect's own units.
 *
 * "Paula's Revenge" gave its Limiter attack 0.001, release 0.05 and
 * lookahead 0.005 - seconds - where the Limiter reads milliseconds: a 0.05 ms
 * release (found 2026-09-29). A value under 0.1 for a parameter whose default
 * is 1 or more is that mistake.
 */
import { describe, it, expect } from 'vitest';
import { EffectRegistry } from '@engine/registry/EffectRegistry';
import '@engine/registry/effects/tonejs';
import '@engine/registry/effects/wasm';
import { FX_PRESETS } from '../fxPresets';

describe('factory preset parameter units', () => {
  it('no parameter looks like seconds where its effect reads milliseconds', () => {
    const suspect: string[] = [];
    for (const p of FX_PRESETS) for (const e of p.effects) {
      const d = EffectRegistry.get(e.type)?.getDefaultParameters?.() as Record<string, unknown> | undefined;
      if (!d) continue;
      for (const [k, v] of Object.entries(e.parameters ?? {})) {
        const dv = d[k];
        if (typeof v === 'number' && typeof dv === 'number' && dv >= 1 && v > 0 && v < 0.1) suspect.push(`${p.name}: ${e.type}.${k} = ${v} (default ${dv})`);
      }
    }
    expect(suspect).toEqual([]);
  });
});
