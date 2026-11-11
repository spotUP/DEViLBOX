/**
 * Grid edits for an Organya song playing on the OrganyaEngine.
 *
 * The edit is written into the file (applyOrganyaGridEdits) and becomes the song's
 * module, so the next load, save and export carry it. The new module is handed
 * to the engine only when it is running, by reloading it.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyOrganyaModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.organyaFileData) return null;
  const { applyOrganyaGridEdits } = await import('@/lib/import/formats/organyaGrid');
  const current = new Uint8Array(song.organyaFileData);
  const next = applyOrganyaGridEdits(current, edits);
  if (next === current || (next.length === current.length && next.every((b, i) => b === current[i]))) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.organyaFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ organyaFileData: module });
  const { OrganyaEngine } = await import('./OrganyaEngine');
  if (OrganyaEngine.hasInstance()) OrganyaEngine.getInstance().replaceModule(module.slice(0));
  return module;
}
