/**
 * MCP write tools that the store silently ignores answer with an error, never `{ ok: true }`.
 * Composer tool audit (2026-11-12): duplicate_pattern with a bad index, set_pattern_order([]),
 * update/clone/delete_instrument with an unknown id and delete_instrument of the last
 * instrument all returned ok after the store did nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({ stop: () => undefined, hasReplacedInstruments: false, replacedInstrumentIds: [] }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  }),
  peekTrackerReplayer: () => null,
}));
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = new Proxy({}, { get: () => () => Promise.resolve() });
  return { useInstrumentTypeStore: { getState: () => state } };
});

import { duplicatePattern, setPatternOrder, updateInstrument, deleteInstrument, cloneInstrument } from '../writeHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { resetStore } from '@/stores/__tests__/_harness';

describe('MCP write tools that would do nothing report an error', () => {
  beforeEach(() => {
    resetStore(useTrackerStore);
    resetStore(useInstrumentStore);
  });

  it('duplicate_pattern with a pattern index the song does not have errors and adds no pattern', () => {
    const before = useTrackerStore.getState().patterns.length;
    const result = duplicatePattern({ patternIndex: before + 5 });
    expect(result).toHaveProperty('error');
    expect(result).not.toHaveProperty('ok');
    expect(useTrackerStore.getState().patterns.length).toBe(before);
  });

  it('duplicate_pattern of an existing pattern still works', () => {
    const before = useTrackerStore.getState().patterns.length;
    expect(duplicatePattern({ patternIndex: 0 })).toMatchObject({ ok: true, newPatternIndex: before });
  });

  it('set_pattern_order with an empty list errors and keeps the order', () => {
    const order = [...useTrackerStore.getState().patternOrder];
    expect(setPatternOrder({ order: [] })).toHaveProperty('error');
    expect(useTrackerStore.getState().patternOrder).toEqual(order);
  });

  it('update_instrument and clone_instrument with an unknown id error and change nothing', () => {
    const count = useInstrumentStore.getState().instruments.length;
    expect(updateInstrument({ id: 9999, updates: { name: 'x' } })).toHaveProperty('error');
    expect(cloneInstrument({ id: 9999 })).toHaveProperty('error');
    expect(useInstrumentStore.getState().instruments.length).toBe(count);
  });

  it('delete_instrument with an unknown id errors', () => {
    useInstrumentStore.getState().createInstrument({ name: 'extra' });
    expect(deleteInstrument({ id: 9999 })).toHaveProperty('error');
  });

  it('delete_instrument of the last instrument errors and keeps it', () => {
    useInstrumentStore.getState().createInstrument({ name: 'only' });
    const [only] = useInstrumentStore.getState().instruments;
    expect(useInstrumentStore.getState().instruments.length).toBe(1);
    expect(deleteInstrument({ id: only.id })).toHaveProperty('error');
    expect(useInstrumentStore.getState().instruments.length).toBe(1);
  });
});
