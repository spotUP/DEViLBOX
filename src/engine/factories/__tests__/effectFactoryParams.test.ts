/**
 * EffectFactory hands effects real numbers: a stored 0 stays 0, a missing
 * value lets the effect apply its own default.
 *
 * The factory read parameters as `Number(p.x) || default` (89 sites: a knob
 * at 0 came back as the default on every rebuild) and passed some straight as
 * `Number(p.x)` - NaN for a missing value, which is not nullish, so the
 * effect's own `?? default` never applied (Dattorro Plate, MVerb, Spring...,
 * 2026-09-29).
 */
import { describe, it, expect, vi } from 'vitest';

const ctor = vi.fn();
vi.mock('../../effects/DattorroPlateEffect', () => ({
  DattorroPlateEffect: class { constructor(opts: unknown) { ctor(opts); } },
}));

import { createEffect } from '../EffectFactory';

describe('EffectFactory parameters', () => {
  it('a Dattorro Plate with no stored parameters gets undefined options, never NaN', async () => {
    await createEffect({ id: 'd', category: 'wasm', type: 'DattorroPlate', enabled: true, wet: 100, parameters: {} } as never);
    const opts = ctor.mock.calls[0][0] as Record<string, unknown>;
    for (const k of ['predelay', 'preFilter', 'inputDiffusion', 'decayDiffusion', 'decay', 'damping']) {
      expect(Number.isNaN(opts[k]), k).toBe(false);
      expect(opts[k], k).toBeUndefined();
    }
  });

  it('a stored 0 reaches the effect as 0', async () => {
    ctor.mockClear();
    await createEffect({ id: 'd', category: 'wasm', type: 'DattorroPlate', enabled: true, wet: 100, parameters: { damping: 0 } } as never);
    expect((ctor.mock.calls[0][0] as Record<string, unknown>).damping).toBe(0);
  });
});
