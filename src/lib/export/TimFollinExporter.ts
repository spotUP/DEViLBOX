/**
 * TimFollinExporter.ts - save a Tim Follin (.tf) song: the module it was loaded from, with the grid's note edits
 * patched into the voice streams they came from (timFollinEdits.ts). Same length, byte-exact where nothing was edited;
 * edits the module cannot hold in place come back as warnings.
 * Reference: TimFollinParser.ts (import), timFollinGrid.ts (the walk the grid is drawn from).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyTimFollinGridEdits } from '@lib/import/formats/timFollinEdits';

export interface TimFollinExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportTimFollin(song: TrackerSong): Promise<TimFollinExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Tim Follin export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'module.tf').split('/').pop() ?? 'module.tf';
  const original = new Uint8Array(src);
  // a song whose voices played no notes opened without a layout: there is no grid to write back
  if (!song.uadeVariableLayout) return { data: original, filename: name, warnings: [] };
  const r = applyTimFollinGridEdits(original, song.patterns, song.nuadeSubsong ?? 0);
  return { data: r.data, filename: name, warnings: r.warnings };
}
