/**
 * openUpRoughSong - the song opener for a .uprough-song.json file.
 * An opener lives outside the stores: the stores must never statically reach songLifecycle
 * (songPersistenceImportCycle.test.ts).
 */

import { applySong } from '@/lib/song/applySong';
import { withSongLoad } from '@/lib/song/songLifecycle';
import { useTrackerStore } from '@stores/useTrackerStore';
import { parseSongFile, songFileToSong } from './songFile';

/** .uprough-song.json text -> patterns, order and instruments (throws SongFileError by name). */
export async function openUpRoughSong(text: string): Promise<void> {
  const song = songFileToSong(parseSongFile(text));
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
