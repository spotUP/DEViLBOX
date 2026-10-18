/**
 * Deleting an instrument stops its synths.
 *
 * deleteInstrument removed the instrument from the store but left its synth
 * instances (one per channel for per-channel synths) alive in ToneEngine. Five
 * orphaned DX7 worklets kept running after the owner deleted leftover
 * instruments, used ~790 ms of every audio-thread second and starved the
 * output: the song played silent (2026-10-19).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const disposeInstrument = vi.fn();

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({ disposeInstrument, invalidateInstrument: vi.fn() }),
}));

import { useInstrumentStore } from '../useInstrumentStore';
import { resetStore } from './_harness';

describe('deleting instruments', () => {
  beforeEach(() => {
    resetStore(useInstrumentStore);
    disposeInstrument.mockReset();
  });

  it('disposes the deleted instrument in the engine', () => {
    const store = useInstrumentStore.getState();
    store.createInstrument();
    const id = store.createInstrument();
    useInstrumentStore.getState().deleteInstrument(id);
    expect(disposeInstrument).toHaveBeenCalledWith(id);
  });

  it('disposes dropped and renumbered instruments, whose engine ids no longer match', () => {
    const store = useInstrumentStore.getState();
    const a = store.createInstrument();
    const b = store.createInstrument();
    const c = store.createInstrument();
    useInstrumentStore.getState().removeInstrumentsRenumbered([a]);
    // b and c move to new ids; their engine instances still carry the old ones.
    expect(new Set(disposeInstrument.mock.calls.map(([id]) => id))).toEqual(new Set([a, b, c]));
  });
});
