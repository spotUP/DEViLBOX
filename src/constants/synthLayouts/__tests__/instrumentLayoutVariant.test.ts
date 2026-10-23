/**
 * A WaveSabre catalog variant shares the WaveSabreSynth engine type, so the editor must pick the
 * layout from the variant marker (xrns.synthType), not from synthType alone.
 */
import { describe, it, expect } from 'vitest';
import { buildInstrumentConfig } from '@stores/useInstrumentStore';
import { applySynthTypeDefaults } from '@stores/instrument/synthTypeDefaults';
import type { SynthType } from '@typedefs/instrument';
import { getInstrumentLayout, getSynthLayout } from '..';

function pick(key: string) {
  const inst = buildInstrumentConfig(1, { name: 'x', type: 'synth', synthType: key as SynthType, effects: [], volume: -12, pan: 0 });
  applySynthTypeDefaults(inst, key as SynthType, false);
  return inst;
}

describe('getInstrumentLayout', () => {
  it('gives a Slaughter instrument the Slaughter layout, not the Falcon default', () => {
    const slaughter = getInstrumentLayout(pick('WaveSabreSlaughter'));
    expect(slaughter).toBe(getSynthLayout('WaveSabreSlaughter'));
    expect(slaughter).not.toBe(getSynthLayout('WaveSabreFalcon'));
  });

  it('gives a Falcon instrument the Falcon layout', () => {
    expect(getInstrumentLayout(pick('WaveSabreFalcon'))).toBe(getSynthLayout('WaveSabreFalcon'));
  });

  it('gives an Adultery instrument no layout, not the Falcon layout of the shared engine type', () => {
    expect(getInstrumentLayout(pick('WaveSabreAdultery'))).toBeUndefined();
  });

  it('falls back to the engine type layout for a non-variant instrument', () => {
    expect(getInstrumentLayout(pick('DubSiren'))).toBe(getSynthLayout('DubSiren'));
  });
});
