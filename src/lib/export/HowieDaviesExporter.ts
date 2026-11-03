/**
 * HowieDaviesExporter.ts - save a Howie Davies (.hd) song: the module it was loaded from, with the grid's note and
 * instrument edits patched into the pattern bytes they came from (howieDaviesEdits.ts). Same length, byte-exact where
 * nothing was edited; edits the module cannot hold in place come back as warnings.
 * Reference: HowieDaviesParser.ts (import), riffRaffGrid.ts (the walk the grid is drawn from).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyHowieDaviesGridEdits } from '@lib/import/formats/howieDaviesEdits';

export interface HowieDaviesExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportHowieDavies(song: TrackerSong): Promise<HowieDaviesExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Howie Davies export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'module.hd').split('/').pop() ?? 'module.hd';
  const original = new Uint8Array(src);
  // a song whose grid did not match the replayer's walk opened without a layout: there is no grid to write back
  if (!song.uadeVariableLayout) return { data: original, filename: name, warnings: [] };
  const r = applyHowieDaviesGridEdits(original, song.patterns);
  return { data: r.data, filename: name, warnings: r.warnings };
}
