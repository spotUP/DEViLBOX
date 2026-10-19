import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/e6.uprough-song.json';
vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});

vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import * as songFile from '../songFile';
import * as applySongModule from '@/lib/song/applySong';
import { useTrackerStore } from '@stores/useTrackerStore';

describe('Up Rough song file through the tracker store', () => {
  it('importUpRoughSong -> exportUpRoughSong runs parse/serialize and returns the same file', async () => {
    const parse = vi.spyOn(songFile, 'parseSongFile');
    const serialize = vi.spyOn(songFile, 'songToSongFile');
    const apply = vi.spyOn(applySongModule, 'applySong');
    const text = JSON.stringify(fixture);
    await useTrackerStore.getState().importUpRoughSong(text);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![1]).toBe('import');
    expect(parse).toHaveBeenCalledTimes(1);
    expect(useTrackerStore.getState().patterns).toHaveLength(6);
    const out = useTrackerStore.getState().exportUpRoughSong();
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(JSON.parse(out)).toEqual(fixture);
  });

  it('export without an imported song refuses by name', () => {
    useTrackerStore.getState().loadPatterns([useTrackerStore.getState().patterns[0]!]);
    expect(() => useTrackerStore.getState().exportUpRoughSong()).toThrow(/import a \.uprough-song\.json/);
  });
});
