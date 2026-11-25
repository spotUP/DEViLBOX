/**
 * IxalanceExporter.ts - the loaded .ixs file with the grid's notes and instruments saved into it.
 * The re-pack runs in wasm (ixs_grid.cpp ixs_edit_save); this file only hands the grid over.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { ixalanceEdited } from '@/engine/ixalance/ixalanceEditWasm';

export async function exportAsIxalance(song: TrackerSong, baseName: string): Promise<{ data: Uint8Array; filename: string; warnings: string[] } | null> {
  const src = song.ixsFileData;
  if (!src) return null;
  const { data, warnings } = await ixalanceEdited(new Uint8Array(src), song.patterns);
  return { data, filename: `${baseName}.ixs`, warnings };
}
