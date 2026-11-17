/** Move Up / Move Down swaps instrument numbers and every pattern cell follows. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({ disposeInstrument: vi.fn(), invalidateInstrument: vi.fn() }),
}));

import { useInstrumentStore } from '../useInstrumentStore';
import { useTrackerStore } from '../useTrackerStore';
import { resetStore } from './_harness';

describe('moveInstrument', () => {
  beforeEach(() => {
    resetStore(useInstrumentStore);
    resetStore(useTrackerStore);
  });

  it('swaps ids with the neighbour and remaps pattern cells', () => {
    const s = useInstrumentStore.getState();
    const a = s.createInstrument();
    const b = s.createInstrument();
    useTrackerStore.setState((d) => { d.patterns[0].channels[0].rows[0].instrument = a; d.patterns[0].channels[0].rows[1].instrument = b; });
    const nameA = useInstrumentStore.getState().instruments.find((i) => i.id === a)!.name;
    useInstrumentStore.getState().moveInstrument(a, 'down');
    const list = useInstrumentStore.getState().instruments;
    expect(list.map((i) => i.id).slice(-2)).toEqual([a, b]);
    expect(list.find((i) => i.id === b)!.name).toBe(nameA);
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows;
    expect([rows[0].instrument, rows[1].instrument]).toEqual([b, a]);
  });
});
