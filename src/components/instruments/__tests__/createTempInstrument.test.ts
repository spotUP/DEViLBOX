/**
 * The edit modal's temp instrument must be exactly what a synth switch in the store produces
 * (applySynthTypeDefaults): one source of truth for per-type defaults.
 */
import { describe, it, expect } from 'vitest';
import { createTempInstrument } from '../EditInstrumentModal';
import { buildInstrumentConfig } from '@stores/useInstrumentStore';
import { applySynthTypeDefaults } from '@stores/instrument/synthTypeDefaults';
import { ALL_SYNTH_TYPES, getSynthInfo } from '@constants/synthCategories';

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('createTempInstrument', () => {
  it('equals the applySynthTypeDefaults result for every synth type', () => {
    const mismatched: string[] = [];
    for (const t of ALL_SYNTH_TYPES) {
      const expected = buildInstrumentConfig(-1, { name: getSynthInfo(t).name, type: 'synth', synthType: t, volume: -6, pan: 0, effects: [] });
      applySynthTypeDefaults(expected, t, false);
      if (JSON.stringify(json(createTempInstrument(t))) !== JSON.stringify(json(expected))) mismatched.push(t);
    }
    expect(ALL_SYNTH_TYPES.length).toBeGreaterThan(100);
    expect(mismatched).toEqual([]);
  });

  it('resolves a catalog variant key to its engine type and marker', () => {
    const inst = createTempInstrument('WaveSabreSlaughter' as never);
    expect(inst.synthType).toBe('WaveSabreSynth');
    expect(inst.xrns?.synthType).toBe('wavesabre-slaughter');
  });
});
