import { describe, it, expect } from 'vitest';
import { buildInstrumentConfig } from '@stores/useInstrumentStore';
import { applySynthTypeDefaults } from '../synthTypeDefaults';
import type { SynthType } from '@typedefs/instrument';

describe('switching to a synth catalog variant key', () => {
  it.each([
    ['WaveSabreSlaughter', 'wavesabre-slaughter'],
    ['WaveSabreFalcon', 'wavesabre-falcon'],
    ['WaveSabreAdultery', 'wavesabre-adultery'],
  ])('%s becomes the WaveSabreSynth engine type with its variant marker', (key, variant) => {
    const inst = buildInstrumentConfig(1, { name: 'x', type: 'synth', synthType: key as SynthType, effects: [], volume: -12, pan: 0 });
    applySynthTypeDefaults(inst, key as SynthType, false);
    expect(inst.synthType).toBe('WaveSabreSynth');
    expect(inst.xrns?.synthType).toBe(variant);
    expect(inst.wavesabre).toBeDefined();
  });

  it('leaves a plain catalog key untouched', () => {
    const inst = buildInstrumentConfig(1, { name: 'x', type: 'synth', synthType: 'DubSiren', effects: [], volume: -12, pan: 0 });
    applySynthTypeDefaults(inst, 'DubSiren', false);
    expect(inst.synthType).toBe('DubSiren');
  });
});

describe('catalogKeyMatches', () => {
  it('marks only the picked WaveSabre variant as the active catalog entry', async () => {
    const { catalogKeyMatches } = await import('@constants/synthCategories');
    const inst = { synthType: 'WaveSabreSynth' as SynthType, xrns: { synthType: 'wavesabre-slaughter' } };
    expect(catalogKeyMatches('WaveSabreSlaughter' as SynthType, inst)).toBe(true);
    expect(catalogKeyMatches('WaveSabreFalcon' as SynthType, inst)).toBe(false);
    expect(catalogKeyMatches('DubSiren', { synthType: 'DubSiren' })).toBe(true);
  });
});
