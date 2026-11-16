/**
 * MarkCookseyExporter.ts - save a Mark Cooksey song: the module it was loaded from with the grid's note edits written
 * into the stored note bytes of the command streams (markCookseyGrid.applyMarkCookseyGridEdits). A note edit moves one
 * byte in place, so an unedited export is byte-identical to the source. Edits a stream has no place for come back as
 * warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyMarkCookseyGridEdits } from '@/lib/import/formats/markCookseyGrid';

export interface MarkCookseyExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportMarkCooksey(song: TrackerSong): Promise<MarkCookseyExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Mark Cooksey export needs the module the song was loaded from');
  const res = applyMarkCookseyGridEdits(new Uint8Array(src), song.patterns);
  const name = (song.uadeEditableFileName ?? 'module.mc').split('/').pop() ?? 'module.mc';
  return { data: res.data, filename: name, warnings: res.warnings };
}
