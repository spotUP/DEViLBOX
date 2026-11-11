/**
 * Grid edits for a PiyoPiyo song playing on the PiyoPiyoEngine.
 *
 * The edit is written into the file (applyPiyoPiyoGridEdits) and becomes the song's
 * module, so the next load, save and export carry it. The new module is handed
 * to the engine only when it is running, by swapping it in.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyPiyoPiyoModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.piyoPiyoFileData) return null;
  const { applyPiyoPiyoGridEdits } = await import('@/lib/import/formats/piyoPiyoGrid');
  const current = new Uint8Array(song.piyoPiyoFileData);
  const next = applyPiyoPiyoGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.piyoPiyoFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ piyoPiyoFileData: module });
  const { PiyoPiyoEngine } = await import('./PiyoPiyoEngine');
  if (PiyoPiyoEngine.hasInstance()) PiyoPiyoEngine.getInstance().replaceModule(module.slice(0));
  return module;
}
