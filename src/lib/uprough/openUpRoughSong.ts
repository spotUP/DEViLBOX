/**
 * openUpRoughSong - text in hand (a generator reply, a picked file's text) to the one open path.
 * It only wraps the text as a .uprough-song.json file and hands it to openSong, which classifies
 * it (upRough) and runs loadUpRoughSong; it never applies a song itself.
 */

import { openSavedSong, openSong } from '@/lib/song/openSong';
import type { Pattern } from '@typedefs/tracker';
import { useTransportStore } from '@stores/useTransportStore';
import { SPEED } from './songFile';

/** .uprough-song.json text -> patterns, order and instruments. Throws the open's error message. */
export async function openUpRoughSong(text: string): Promise<void> {
  // A generate run's blank song still loading would land after this one and blank it.
  await generating.catch(() => undefined);
  const file = new File([text], 'song.uprough-song.json', { type: 'application/json' });
  const r = await openSong({ kind: 'prepared', file, songKind: 'upRough' }, { origin: 'dialog', start: false, interactive: false });
  if (!r.ok) throw new Error(r.error);
}

/** The blank song of the latest generate run, until it is in the tracker. */
let generating: Promise<void> = Promise.resolve();

/**
 * The song a generate run builds, opened at its start event: the blank section patterns and no instruments yet.
 * It goes through the one open path (a song in hand, like a restore), so the outgoing song's instruments, format mode and engine leave before the
 * fill writes cells; the finished song (openUpRoughSong) replaces it at done.
 */
export function openGeneratingSong(name: string, patterns: Pattern[]): Promise<void> {
  // The start event carries no tempo: the transport keeps its BPM until the finished song sets the style's.
  const bpm = useTransportStore.getState().bpm;
  generating = openSavedSong({
    name, source: 'import', silent: true,
    song: () => ({
      instruments: [], patterns, order: patterns.map((_, i) => i),
      bpm, speed: SPEED,
      metadata: { name },
      originalModuleData: null,
      engine: {},
      preload: false,
    }),
  });
  return generating;
}
