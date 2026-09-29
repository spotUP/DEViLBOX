/**
 * A knob set to 0 survives a rebuild.
 *
 * Effects were created with `Number(p.x) || default`, so a stored 0 came back
 * as the default whenever the chain was rebuilt (reload, preset load, chain
 * edit), while the live knob had worked - found 2026-09-29 writing a master
 * preset whose MultibandEnhancer narrows the lows to mono (lowWidth 0): it
 * came up full width.
 */
import { describe, it, expect, vi } from 'vitest';

const ctor = vi.fn();
vi.mock('@engine/effects/MultibandEnhancerEffect', () => ({
  MultibandEnhancerEffect: class { constructor(opts: unknown) { ctor(opts); } },
}));

import { EffectRegistry } from '../../EffectRegistry';
import '../wasm';

describe('effect creation keeps explicit zeros', () => {
  it('MultibandEnhancer lowWidth 0 stays 0 (mono lows), a missing value still defaults', async () => {
    await EffectRegistry.get('MultibandEnhancer')!.create({
      id: 'x', category: 'wasm', type: 'MultibandEnhancer', enabled: true, wet: 100,
      parameters: { lowWidth: 0 },
    } as never);
    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({ lowWidth: 0, midWidth: 1 }));
  });
});
