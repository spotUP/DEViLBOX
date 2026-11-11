/**
 * update_synth_config is a PARTIAL update: fields the caller does not name stay.
 * Found while composing through the tool (2026-11-11): an update of one FM
 * operator's level, `{ operators: [{ tl: 10 }] }`, replaced the four-operator
 * list with that single one-field entry, so the patch lost three operators and
 * every other field of the first.
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

import { updateSynthConfig } from '../writeHandlers';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import type { InstrumentConfig } from '@typedefs/instrument';

const operator = (tl: number, mult: number) => ({ enabled: true, mult, tl, ar: 31, dr: 8, d2r: 0, sl: 2, rr: 7, dt: 0 });

const furnaceOf = (id: number) =>
  (useInstrumentStore.getState().getInstrument(id) as unknown as { furnace: Record<string, unknown> }).furnace;

describe('update_synth_config', () => {
  beforeEach(() => {
    const instrument = {
      id: 1,
      name: 'FM Bass',
      type: 'synth',
      synthType: 'FurnaceOPNB',
      volume: -6,
      pan: 0,
      effects: [],
      furnace: {
        chipType: 1,
        algorithm: 4,
        feedback: 5,
        operators: [operator(30, 1), operator(25, 2), operator(4, 1), operator(0, 3)],
      },
    } as unknown as InstrumentConfig;
    useInstrumentStore.setState({ instruments: [instrument] });
  });

  it('an update of one operator field keeps the other operators and the other fields', () => {
    const result = updateSynthConfig({ id: 1, configKey: 'furnace', updates: { operators: [{ tl: 10 }] } });
    expect(result).toMatchObject({ ok: true });

    const furnace = furnaceOf(1);
    expect(furnace.operators).toEqual([operator(10, 1), operator(25, 2), operator(4, 1), operator(0, 3)]);
    expect(furnace.algorithm).toBe(4);
    expect(furnace.feedback).toBe(5);
  });

  it('a null entry skips an operator, so the last operator can be changed alone', () => {
    updateSynthConfig({ id: 1, configKey: 'furnace', updates: { operators: [null, null, null, { tl: 12, rr: 9 }] } });
    expect(furnaceOf(1).operators).toEqual([
      operator(30, 1), operator(25, 2), operator(4, 1), { ...operator(0, 3), tl: 12, rr: 9 },
    ]);
  });

  it('plain fields still update and an unknown instrument is still an error', () => {
    updateSynthConfig({ id: 1, configKey: 'furnace', updates: { algorithm: 0, feedback: 6 } });
    expect(furnaceOf(1)).toMatchObject({ algorithm: 0, feedback: 6 });
    expect((furnaceOf(1).operators as unknown[]).length).toBe(4);

    expect(updateSynthConfig({ id: 99, configKey: 'furnace', updates: { algorithm: 1 } })).toHaveProperty('error');
  });
});
