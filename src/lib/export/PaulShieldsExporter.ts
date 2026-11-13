/**
 * PaulShieldsExporter.ts - save a Paul Shields song: the module it was loaded from with the grid's note edits written
 * into the stored note bytes of the pattern streams (paulShieldsGrid.applyPaulShieldsGridEdits). A note edit moves one
 * byte in place, so an unedited export is byte-identical to the source. Edits a stream has no place for come back as
 * warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyPaulShieldsGridEdits } from '@/lib/import/formats/paulShieldsGrid';

export interface PaulShieldsExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportPaulShields(song: TrackerSong): Promise<PaulShieldsExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Paul Shields export needs the module the song was loaded from');
  const res = applyPaulShieldsGridEdits(new Uint8Array(src), song.patterns);
  const name = (song.uadeEditableFileName ?? 'module.ps').split('/').pop() ?? 'module.ps';
  return { data: res.data, filename: name, warnings: res.warnings };
}
