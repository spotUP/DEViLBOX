/**
 * The 'hippelst-module' live-edit route: a grid cell of a Hippel ST song is a row event of the
 * playback image the native player runs (HstSongEdit.image). The layout's writeCell edits the song
 * and returns the bytes it changed in the image; they go into the image the song and the format
 * store hold (one buffer), and the engine takes the image again, playing on from its tick.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export function patchHippelStImage(song: TrackerSong, edits: readonly LiveCellEdit[]): number {
  const layout = song.uadePatternLayout;
  const image = song.hippelStFileData;
  if (!layout?.writeCell || !image) return 0;
  const bytes = new Uint8Array(image);
  let written = 0;
  for (const { pattern, row, channel, cell } of edits) {
    for (const w of layout.writeCell(pattern, row, channel, cell)) {
      bytes.set(w.bytes, w.offset);
      written += w.bytes.length;
    }
  }
  return written;
}

export async function applyHippelStEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<void> {
  if (patchHippelStImage(song, edits) === 0 || !song.hippelStFileData) return;
  const { HippelStEngine } = await import('./HippelStEngine');
  if (HippelStEngine.hasInstance()) HippelStEngine.getInstance().reloadModule(song.hippelStFileData);
}
