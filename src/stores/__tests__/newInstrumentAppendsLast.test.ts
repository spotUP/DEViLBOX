/** A new or cloned instrument takes the slot after the last used one, never a gap before it. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({ disposeInstrument: vi.fn(), invalidateInstrument: vi.fn(), ensureInstrumentReady: vi.fn() }),
}));

import { useInstrumentStore } from '../useInstrumentStore';
import { resetStore } from './_harness';

describe('new instrument is appended last', () => {
  beforeEach(() => resetStore(useInstrumentStore));

  it('createInstrument and cloneInstrument skip free low slots', () => {
    const a = useInstrumentStore.getState().createInstrument();
    const b = useInstrumentStore.getState().createInstrument();
    const c = useInstrumentStore.getState().createInstrument();
    useInstrumentStore.getState().deleteInstrument(a); // slot a is now a gap
    const d = useInstrumentStore.getState().createInstrument();
    expect(d).toBe(c + 1);
    const e = useInstrumentStore.getState().cloneInstrument(b);
    expect(e).toBe(d + 1);
    const ids = useInstrumentStore.getState().instruments.map((i) => i.id);
    expect(ids[ids.length - 1]).toBe(e);
  });
});
