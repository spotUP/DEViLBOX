/**
 * Grid edits for a MONOTONE song playing on the MonotoneEngine.
 *
 * A grid cell is one row of one track of one pattern (monotoneGrid.ts): the
 * edit is written into the file (applyMonotoneGridEdits) and the replayer swaps
 * the new cells in where it plays (mt_replace_song keeps its place). The new
 * module becomes the song's module, so the next load, save and export carry it.
 * The grid is the module's own patterns, so no other cell changes.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

/** Write `edits` into the song's module and hand it to the replayer. Returns the new module, or null when nothing changed. */
export async function applyMonotoneModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.monotoneFileData) return null;
  const { applyMonotoneGridEdits } = await import('@/lib/import/formats/monotoneGrid');
  const current = new Uint8Array(song.monotoneFileData);
  const next = applyMonotoneGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.monotoneFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ monotoneFileData: module });

  const { MonotoneEngine } = await import('./MonotoneEngine');
  if (MonotoneEngine.hasInstance()) MonotoneEngine.getInstance().replaceModule(module.slice(0));
  return module;
}
