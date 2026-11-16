/**
 * JasonPageExporter.ts - save a Jason Page song: the module it was loaded from with the grid's note edits written into
 * the stored note bytes of its patterns (jasonPageGrid.applyJasonPageGridEdits). A note edit moves one byte in place, so
 * an unedited export is byte-identical to the source. The sample file (smp.*) is not touched. Edits the pattern has no
 * place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyJasonPageGridEdits } from '@/lib/import/formats/jasonPageGrid';

export interface JasonPageExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportJasonPage(song: TrackerSong): Promise<JasonPageExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Jason Page export needs the module the song was loaded from');
  const res = applyJasonPageGridEdits(new Uint8Array(src), song.patterns);
  const name = (song.uadeEditableFileName ?? 'jpn.module').split('/').pop() ?? 'jpn.module';
  return { data: res.data, filename: name, warnings: res.warnings };
}
