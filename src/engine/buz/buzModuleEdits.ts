/**
 * Grid edits for a Buzzic song playing on the BuzEngine.
 *
 * The edit is written into the file (applyBuzGridEdits) and becomes the song's
 * module, so the next load, save and export carry it. The new module is handed
 * to the engine only when it is running, by reloading it.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyBuzModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.buzFileData) return null;
  const { applyBuzGridEdits } = await import('@/lib/import/formats/buzGrid');
  const current = new Uint8Array(song.buzFileData);
  const next = applyBuzGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.buzFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ buzFileData: module });
  const { BuzEngine } = await import('./BuzEngine');
  if (BuzEngine.hasInstance()) BuzEngine.getInstance().replaceModule(module.slice(0));
  return module;
}
