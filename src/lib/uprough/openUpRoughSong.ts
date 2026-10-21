/**
 * openUpRoughSong - text in hand (a generator reply, a picked file's text) to the one open path.
 * It only wraps the text as a .uprough-song.json file and hands it to openSong, which classifies
 * it (upRough) and runs loadUpRoughSong; it never applies a song itself.
 */

import { openSong } from '@/lib/song/openSong';

/** .uprough-song.json text -> patterns, order and instruments. Throws the open's error message. */
export async function openUpRoughSong(text: string): Promise<void> {
  const file = new File([text], 'song.uprough-song.json', { type: 'application/json' });
  const r = await openSong({ kind: 'prepared', file, songKind: 'upRough' }, { origin: 'dialog', start: false, interactive: false });
  if (!r.ok) throw new Error(r.error);
}
