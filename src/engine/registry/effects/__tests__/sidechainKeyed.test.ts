/**
 * The effect registry says which effects are keyed by a sidechain source, so
 * the master chain card can show the Key picker for exactly those.
 */
import { describe, it, expect } from 'vitest';
import { EffectRegistry } from '../../EffectRegistry';
import '../tonejs';
import '../wasm';

describe('sidechain-keyed effects', () => {
  it('flags the three sidechain effects and nothing else in the eager registries', () => {
    const keyed = ['SidechainCompressor', 'SidechainGate', 'SidechainLimiter'];
    for (const id of keyed) expect(EffectRegistry.get(id)?.sidechainKeyed, id).toBe(true);
    expect(EffectRegistry.get('Compressor')?.sidechainKeyed).not.toBe(true);
  });
});
