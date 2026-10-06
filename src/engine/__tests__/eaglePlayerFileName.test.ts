/**
 * The eagleplayer opens its module by file name. The engine was handed the
 * song's display name ('primemover 07 [Anders 0land]'), so suffix-named
 * songs (primemover 07.hot, dynamite dux.core) played silent in the app
 * while the headless tests, which passed the real name, passed (2026-10-06).
 */
import { describe, it, expect } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { liveTrackerSong } from '@/lib/song/liveSong';
import { WASM_ENGINES } from '@/engine/replayer/wasmEngineRegistry';
import { playOnEaglePlayer } from '@/lib/import/parsers/withEaglePlayer';
import type { TrackerSong } from '@/engine/TrackerReplayer';

describe('eagleplayer module file name', () => {
  it('the engine is loaded with the real file name, not the display name', () => {
    const song = { name: 'primemover 07 [Anders 0land]', instruments: [], patterns: [] } as unknown as TrackerSong;
    playOnEaglePlayer(song, 'Anders0land', new ArrayBuffer(16), 'primemover 07.hot');
    useFormatStore.getState().applyEditorMode(song);
    const live = liveTrackerSong();
    const desc = WASM_ENGINES.find((d) => d.key === 'EaglePlayer')!;
    expect(desc.getLoadArgs!(live)).toEqual(['Anders0land', 'primemover 07.hot']);
  });
});
