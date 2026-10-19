import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';
vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});
const stopAudition = vi.hoisted(() => vi.fn());
vi.mock('@/lib/uprough/auditionPlayer', () => ({ stopAudition, playAudition: vi.fn() }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useSongLoadStore } from '@/stores/useSongLoadStore';
import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';

const A = JSON.stringify(fixture);
const B = JSON.stringify({ ...fixture, song: { ...fixture.song, name: 'song B' }, order: [0, 1, 2] });

function snap() {
  const t = useTrackerStore.getState();
  return JSON.parse(JSON.stringify({
    patterns: t.patterns, order: t.patternOrder, meta: t.upRoughMeta,
    instruments: useInstrumentStore.getState().instruments,
    bpm: useTransportStore.getState().bpm, speed: useTransportStore.getState().speed,
    name: useProjectStore.getState().metadata.name,
  }));
}

describe('re-import of an Up Rough song', () => {
  it('A then B equals B alone, and the outgoing song was unloaded', async () => {
    await openUpRoughSong(B);
    const fresh = snap();
    await openUpRoughSong(A);
    const gen = useSongLoadStore.getState().generation;
    await openUpRoughSong(B);
    const second = snap();
    expect(second.patterns.length).toBe(fresh.patterns.length);
    expect(second.order).toEqual(fresh.order);
    expect(second.meta).toEqual(fresh.meta);
    expect(second.bpm).toBe(fresh.bpm);
    expect(second.name).toBe('song B');
    expect(second.instruments.map((i: { id: number }) => i.id)).toEqual(fresh.instruments.map((i: { id: number }) => i.id));
    expect(second.instruments.length).toBe(fresh.instruments.length);
    // unloadSong bumps the generation; the import must go through it
    expect(useSongLoadStore.getState().generation).toBeGreaterThan(gen);
    // the preview of the outgoing song stops with it
    expect(stopAudition).toHaveBeenCalled();
  });
});
