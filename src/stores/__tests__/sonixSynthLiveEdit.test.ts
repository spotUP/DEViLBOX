/**
 * Regression: editing a SonixSynth instrument's params must update EVERY live voice
 * instance, not just the shared one, and must not invalidate.
 *
 * SonixSynth (like Cinter4, a mono Paula voice) allocates per-channel voice instances on
 * playback. An earlier fix updated only the shared instance (getInstrument + applyConfig),
 * so cached per-channel voices stayed on old params → the preview got "stuck" on a preset.
 * The fix mirrors Cinter4: route through engine.updateComplexSynthParameters(id, config),
 * which applyConfigs every instance for the id. This test asserts that routing and that the
 * instrument is not invalidated (which would kill the running song).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const updateComplexSynthParameters = vi.fn();
const invalidateInstrument = vi.fn();

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    updateComplexSynthParameters,
    invalidateInstrument,
    // methods other branches might touch — harmless no-ops
    getInstrument: vi.fn(),
    updateToneJsSynthInPlace: vi.fn(),
  }),
}));

import { useInstrumentStore } from '../useInstrumentStore';
import { resetStore } from './_harness';

function seedSonixSynth(): number {
  const id = useInstrumentStore.getState().createInstrument();
  useInstrumentStore.setState((state: any) => ({
    instruments: state.instruments.map((inst: any) =>
      inst.id === id
        ? {
            ...inst,
            type: 'synth',
            synthType: 'SonixSynth',
            parameters: { sonixIndex: 2, sonix: { index: 2, baseVol: 200, wave: new Array(128).fill(0), envTable: new Array(128).fill(0) } },
          }
        : inst,
    ),
  }));
  return id;
}

describe('SonixSynth live param edit routing', () => {
  beforeEach(() => {
    resetStore(useInstrumentStore);
    updateComplexSynthParameters.mockReset();
    invalidateInstrument.mockReset();
  });

  it('routes a sonix param edit to every voice via updateComplexSynthParameters', () => {
    const id = seedSonixSynth();
    useInstrumentStore.getState().updateInstrument(id, {
      parameters: { sonixIndex: 2, sonix: { index: 2, baseVol: 120, wave: new Array(128).fill(0), envTable: new Array(128).fill(0) } },
    } as any);

    expect(updateComplexSynthParameters).toHaveBeenCalledWith(id, expect.objectContaining({ synthType: 'SonixSynth' }));
    expect(invalidateInstrument).not.toHaveBeenCalled();
  });

  it('routes an egLevels edit the same way (not invalidation)', () => {
    const id = seedSonixSynth();
    useInstrumentStore.getState().updateInstrument(id, {
      parameters: { sonixIndex: 2, sonix: { index: 2, baseVol: 200, wave: new Array(128).fill(0), envTable: new Array(128).fill(0), lfoWave: new Array(128).fill(0), egLevels: [10, 20, 30, 40], egRates: [1, 2, 3, 4] } },
    } as any);
    expect(updateComplexSynthParameters).toHaveBeenCalledTimes(1);
    expect(invalidateInstrument).not.toHaveBeenCalled();
  });
});
