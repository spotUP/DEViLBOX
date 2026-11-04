/**
 * Grid edits for a KDM song playing on the KdmEngine.
 *
 * The edit is written into the file (applyKdmGridEdits) and becomes the song's
 * module, so the next load, save and export carry it. The new module is handed
 * to the engine only when it is running, by reloading it.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyKdmModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.kdmFileData) return null;
  const { applyKdmGridEdits } = await import('@/lib/import/formats/kdmGrid');
  const current = new Uint8Array(song.kdmFileData);
  const next = applyKdmGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.kdmFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ kdmFileData: module });
  const { KdmEngine } = await import('./KdmEngine');
  if (KdmEngine.hasInstance()) KdmEngine.getInstance().replaceModule(module.slice(0));
  return module;
}
