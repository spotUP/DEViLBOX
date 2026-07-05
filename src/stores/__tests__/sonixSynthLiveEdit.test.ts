/**
 * Regression: editing a SonixSynth instrument's params must route to the live WASM
 * engine, not the invalidation path.
 *
 * The Sonix song plays in the SonixEngine WASM singleton (note-suppressed), and knob
 * edits reach it via SonixSynth.applyConfig -> SonixEngine.setSynthParams. But
 * updateInstrument had no dispatch branch for synthType 'SonixSynth', so a param edit
 * fell through to engine.invalidateInstrument + replayer.updateInstrument (map-only) --
 * never calling applyConfig, so knobs were silent. This test asserts the added branch
 * gets the live synth via engine.getInstrument and calls applyConfig, and does NOT
 * invalidate (which would kill the running song).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const getInstrument = vi.fn();
const invalidateInstrument = vi.fn();
const applyConfig = vi.fn();

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    getInstrument,
    invalidateInstrument,
    // methods other branches might touch — harmless no-ops
    updateComplexSynthParameters: vi.fn(),
    updateToneJsSynthInPlace: vi.fn(),
  }),
}));

import { useInstrumentStore } from '../useInstrumentStore';
import { resetStore } from './_harness';

function seedSonixSynth(): number {
  const id = useInstrumentStore.getState().createInstrument();
  // Patch directly (bypass the dispatch path) so the instrument is already a
  // tagged SonixSynth before we exercise a param edit.
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
    getInstrument.mockReset().mockReturnValue({ applyConfig });
    invalidateInstrument.mockReset();
    applyConfig.mockReset();
  });

  it('routes a sonix param edit to the live synth via getInstrument + applyConfig', () => {
    const id = seedSonixSynth();
    useInstrumentStore.getState().updateInstrument(id, {
      parameters: { sonixIndex: 2, sonix: { index: 2, baseVol: 120, wave: new Array(128).fill(0), envTable: new Array(128).fill(0) } },
    } as any);

    expect(getInstrument).toHaveBeenCalledWith(id, expect.objectContaining({ synthType: 'SonixSynth' }));
    expect(applyConfig).toHaveBeenCalledTimes(1);
    expect(applyConfig).toHaveBeenCalledWith(expect.objectContaining({ synthType: 'SonixSynth' }));
  });

  it('does NOT invalidate the instrument (that would kill the running song)', () => {
    const id = seedSonixSynth();
    useInstrumentStore.getState().updateInstrument(id, {
      parameters: { sonixIndex: 2, sonix: { index: 2, baseVol: 50, wave: new Array(128).fill(0), envTable: new Array(128).fill(0) } },
    } as any);

    expect(invalidateInstrument).not.toHaveBeenCalled();
  });
});
