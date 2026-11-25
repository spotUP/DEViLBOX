/**
 * CpsycleExporter.ts - the loaded PSY3 .psy file with the grid's notes and machines saved into it.
 * The re-pack runs in wasm (cpsycle_grid.c cps_edit_save); this file only hands the grid over.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { cpsycleEdited } from '@/engine/cpsycle/cpsycleEditWasm';

export async function exportAsCpsycle(song: TrackerSong, baseName: string): Promise<{ data: Uint8Array; filename: string; warnings: string[] } | null> {
  const src = song.psycleFileData;
  if (!src || new TextDecoder().decode(new Uint8Array(src, 0, 8)) !== 'PSY3SONG') return null;
  const { data, warnings } = await cpsycleEdited(new Uint8Array(src), song.patterns);
  return { data, filename: `${baseName}.psy`, warnings };
}
