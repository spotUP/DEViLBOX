/**
 * Grid edits for a JXS song playing on the JxsEngine.
 *
 * The edit is written into the file (applyJxsGridEdits) and becomes the song's
 * module, so the next load, save and export carry it. The new module is handed
 * to the engine only when it is running, by reloading it.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';
import type { JxsEdit } from '@/lib/import/formats/jxsInstrument';

export async function applyJxsModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.jxsFileData) return null;
  const { applyJxsGridEdits } = await import('@/lib/import/formats/jxsGrid');
  const current = new Uint8Array(song.jxsFileData);
  const next = applyJxsGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  return commitJxsModule(song, next);
}

/**
 * Make `next` the song's module: song.jxsFileData, the format store (the keyboard voice reloads when its
 * identity changes) and the running engine. Shared by grid edits and instrument edits.
 */
export async function commitJxsModule(song: TrackerSong, next: Uint8Array): Promise<ArrayBuffer> {
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.jxsFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ jxsFileData: module });
  const { JxsEngine } = await import('./JxsEngine');
  if (JxsEngine.hasInstance()) JxsEngine.getInstance().replaceModule(module.slice(0));
  return module;
}

/**
 * Apply an instrument edit (instrumentId is the grid's 1-based number) to the song's module and commit it.
 * Null when the song has no module or the edit changes no byte.
 */
export async function editJxsInstrument(song: TrackerSong, instrumentId: number, edit: JxsEdit): Promise<ArrayBuffer | null> {
  if (!song.jxsFileData) return null;
  const { writeJxsInstrument } = await import('@/lib/import/formats/jxsInstrument');
  const current = new Uint8Array(song.jxsFileData);
  const next = writeJxsInstrument(current, instrumentId - 1, edit);
  if (next === current) return null;
  return commitJxsModule(song, next);
}
