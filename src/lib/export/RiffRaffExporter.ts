/**
 * RiffRaffExporter.ts - save a Riff Raff (.riff) song: the module it was loaded from, with the grid's note and
 * instrument edits patched into the pattern bytes they came from (riffRaffEdits.ts). Same length, byte-exact where
 * nothing was edited; edits the module cannot hold in place come back as warnings.
 * Reference: RiffRaffParser.ts (import), riffRaffGrid.ts (the walk the grid is drawn from).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyRiffRaffGridEdits } from '@lib/import/formats/riffRaffEdits';

export interface RiffRaffExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportRiffRaff(song: TrackerSong): Promise<RiffRaffExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Riff Raff export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'module.riff').split('/').pop() ?? 'module.riff';
  const original = new Uint8Array(src);
  // a song whose grid did not match the replayer's walk opened without a layout: there is no grid to write back
  if (!song.uadeVariableLayout) return { data: original, filename: name, warnings: [] };
  const r = applyRiffRaffGridEdits(original, song.patterns);
  return { data: r.data, filename: name, warnings: r.warnings };
}
