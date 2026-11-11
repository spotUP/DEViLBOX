/**
 * Grid edits for an Art of Noise song playing on the ArtOfNoiseEngine.
 *
 * The edit is written into the file (applyArtOfNoiseGridEdits) and becomes the song's module, so the
 * next load, save and export carry it. The store carries the edit to sibling positions of a shared stored pattern (aonLinkedEdits). The new module is handed to the
 * engine only when it is running, by reloading it.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { LiveCellEdit } from '../replayer/liveCellEdits';

export async function applyArtOfNoiseModuleEdits(song: TrackerSong, edits: readonly LiveCellEdit[]): Promise<ArrayBuffer | null> {
  if (!song.artOfNoiseFileData) return null;
  const { applyArtOfNoiseGridEdits } = await import('@/lib/import/formats/artOfNoiseGrid');
  const current = new Uint8Array(song.artOfNoiseFileData);
  const next = applyArtOfNoiseGridEdits(current, edits);
  if (next === current) return null;
  const module = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength) as ArrayBuffer;
  song.artOfNoiseFileData = module;
  const { useFormatStore } = await import('@stores/useFormatStore');
  useFormatStore.setState({ artOfNoiseFileData: module });
  const { ArtOfNoiseEngine } = await import('./ArtOfNoiseEngine');
  if (ArtOfNoiseEngine.hasInstance()) ArtOfNoiseEngine.getInstance().replaceModule(module.slice(0));
  return module;
}
