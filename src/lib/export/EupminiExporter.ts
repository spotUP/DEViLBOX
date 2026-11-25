/**
 * EupminiExporter.ts - the loaded .eup file with the grid's notes saved into it.
 * The write-back runs in wasm (eup_grid.cpp eup_edit_*); this file only hands the grid over.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { eupEdited } from '@/engine/eupmini/eupminiEditWasm';

export async function exportAsEup(song: TrackerSong, baseName: string): Promise<{ data: Uint8Array; filename: string; warnings: string[] } | null> {
  const src = song.eupFileData;
  if (!src) return null;
  const { data, warnings } = await eupEdited(new Uint8Array(src), song.patterns);
  return { data, filename: `${baseName}.eup`, warnings };
}
