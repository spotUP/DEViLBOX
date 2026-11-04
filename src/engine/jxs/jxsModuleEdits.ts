/**
 * Grid edits for a JXS song playing on the JxsEngine.
 *
 * The edit is written into the file (applyJxsGridEdits) and becomes the song's
 * module, so the next load, save and export carry it. The new module is handed
 * to the engine only when it is running, by reloading it.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyJxsModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.jxsFileData) return null;
  const { applyJxsGridEdits } = await import('@/lib/import/formats/jxsGrid');
  const current = new Uint8Array(song.jxsFileData);
  const next = applyJxsGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.jxsFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ jxsFileData: module });
  const { JxsEngine } = await import('./JxsEngine');
  if (JxsEngine.hasInstance()) JxsEngine.getInstance().replaceModule(module.slice(0));
  return module;
}
