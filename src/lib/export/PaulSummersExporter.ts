/**
 * PaulSummersExporter.ts - save a Paul Summers song: the module it was loaded from with the grid's note edits written
 * into the stored note bytes of the pattern streams (paulSummersGrid.applyPaulSummersGridEdits). A note edit moves one
 * byte in place, so an unedited export is byte-identical to the source. Edits a stream has no place for come back as
 * warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyPaulSummersGridEdits } from '@/lib/import/formats/paulSummersGrid';

export interface PaulSummersExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportPaulSummers(song: TrackerSong): Promise<PaulSummersExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Paul Summers export needs the module the song was loaded from');
  const res = applyPaulSummersGridEdits(new Uint8Array(src), song.patterns);
  const name = (song.uadeEditableFileName ?? 'module.snk').split('/').pop() ?? 'module.snk';
  return { data: res.data, filename: name, warnings: res.warnings };
}
