/**
 * set_channel_count lets a tool caller (the composing chat) grow the song.
 * Before it existed a composer on a 4-channel song had no way to reach a fifth
 * channel: writes to channel 4 were refused (cellWritesOutOfRangeAreRefused)
 * and the only channel action opened a confirm dialog no tool can answer.
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

const formatLimits = vi.hoisted(() => ({ value: null as { name: string; maxChannels: number } | null }));
vi.mock('../../../lib/formatCompatibility', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getActiveFormatLimits: () => formatLimits.value,
}));

import { setChannelCount, setCell } from '../writeHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { resetStore } from '@/stores/__tests__/_harness';

const channelCounts = () => useTrackerStore.getState().patterns.map((p) => p.channels.length);

describe('set_channel_count', () => {
  beforeEach(() => {
    resetStore(useTrackerStore);
    formatLimits.value = null;
  });

  it('grows every pattern and makes the new channel writable', () => {
    const before = channelCounts()[0];
    useTrackerStore.getState().addPattern();
    expect(setCell({ channel: before, row: 0, note: 'C-4' })).toHaveProperty('error');

    expect(setChannelCount({ count: before + 2 })).toEqual({ ok: true, channelCount: before + 2 });
    expect(channelCounts().every((n) => n === before + 2)).toBe(true);
    const st = useTrackerStore.getState();
    for (const p of st.patterns) {
      for (const c of p.channels) expect(c.rows.length).toBe(p.length);
    }
    expect(setCell({ channel: before + 1, row: 0, note: 'C-4' })).toMatchObject({ ok: true });
  });

  it('keeps the notes already in the song', () => {
    setCell({ channel: 0, row: 3, note: 'E-4', instrument: 1 });
    const before = channelCounts()[0];
    setChannelCount({ count: before + 1 });
    const st = useTrackerStore.getState();
    expect(st.patterns[st.currentPatternIndex].channels[0].rows[3].note).toBeGreaterThan(0);
  });

  it('never removes a channel', () => {
    const before = channelCounts()[0];
    expect(setChannelCount({ count: before - 1 })).toHaveProperty('error');
    expect(channelCounts()[0]).toBe(before);
    expect(setChannelCount({ count: before })).toEqual({ ok: true, channelCount: before });
  });

  it('refuses counts outside 1..16 and non-numbers', () => {
    const before = channelCounts()[0];
    for (const count of [0, 17, 4.5, '8', undefined]) {
      expect(setChannelCount({ count }), String(count)).toHaveProperty('error');
    }
    expect(channelCounts()[0]).toBe(before);
  });

  it('refuses more channels than the loaded format holds', () => {
    const before = channelCounts()[0];
    formatLimits.value = { name: 'ProTracker MOD', maxChannels: before };
    const result = setChannelCount({ count: before + 1 });
    expect(String(result.error)).toContain('ProTracker MOD');
    expect(channelCounts()[0]).toBe(before);
  });
});
