/**
 * openUpRoughSong - the song opener for a .uprough-song.json file.
 * An opener lives outside the stores: the stores must never statically reach songLifecycle
 * (songPersistenceImportCycle.test.ts).
 */

import { applySong } from '@/lib/song/applySong';
import { withSongLoad } from '@/lib/song/songLifecycle';
import { useTrackerStore } from '@stores/useTrackerStore';
import type { Pattern } from '@typedefs/tracker';
import { useTransportStore } from '@stores/useTransportStore';
import { SPEED, parseSongFile, songFileToSong } from './songFile';

/** .uprough-song.json text -> patterns, order and instruments (throws SongFileError by name). */
export async function openUpRoughSong(text: string): Promise<void> {
  const song = songFileToSong(parseSongFile(text));
  // A generate run's blank song still loading would land after this one and blank it.
  await generating.catch(() => undefined);
  // The outgoing song is unloaded before the new one lands (applySong assumes it).
  await withSongLoad(song.tempo.name, async () => {
    await applySong({
      instruments: song.instruments, patterns: song.patterns, order: song.meta.order,
      bpm: song.tempo.bpm, speed: song.tempo.speed,
      metadata: { name: song.tempo.name },
      originalModuleData: null,
      engine: {},
    }, 'import');
    // After applySong: loadPatterns clears upRoughMeta.
    useTrackerStore.setState({ upRoughMeta: song.meta });
  });
}

/** The blank song of the latest generate run, until it is in the tracker. */
let generating: Promise<void> = Promise.resolve();

/**
 * The song a generate run builds, opened at its start event: the blank section patterns and no instruments yet.
 * It goes through the one load path, so the outgoing song's instruments, format mode and engine leave before the
 * fill writes cells; the finished song (openUpRoughSong) replaces it at done.
 */
export function openGeneratingSong(name: string, patterns: Pattern[]): Promise<void> {
  // The start event carries no tempo: the transport keeps its BPM until the finished song sets the style's.
  const bpm = useTransportStore.getState().bpm;
  generating = withSongLoad(name, () => applySong({
    instruments: [], patterns, order: patterns.map((_, i) => i),
    bpm, speed: SPEED,
    metadata: { name },
    originalModuleData: null,
    engine: {},
    preload: false,
  }, 'import'), { silent: true });
  return generating;
}
