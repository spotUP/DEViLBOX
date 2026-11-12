/**
 * MedleyExporter.ts - save a Medley song: the module it was loaded from with the grid's note edits written into the stored
 * note bytes of the track streams (medleyGrid.applyMedleyGridEdits). A note edit moves one byte in place, so an unedited
 * export is byte-identical to the source. Edits a stream has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyMedleyGridEdits } from '@/lib/import/formats/medleyGrid';

export interface MedleyExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportMedley(song: TrackerSong): Promise<MedleyExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Medley export needs the module the song was loaded from');
  const res = applyMedleyGridEdits(new Uint8Array(src), song.patterns);
  const name = (song.uadeEditableFileName ?? 'module.mso').split('/').pop() ?? 'module.mso';
  return { data: res.data, filename: name, warnings: res.warnings };
}
