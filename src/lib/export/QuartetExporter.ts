/**
 * QuartetExporter.ts - save a Quartet PSG (.sqt) or Quartet ST (.4v / qts.*) song: the module it was loaded from with the grid's note edits written
 * into the stored frequency longs of the voice streams (quartetPsgGrid.applyQuartetGridEdits). A note edit rewrites four
 * bytes in place, so an unedited export is byte-identical to the source. Edits the stream has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyQuartetGridEdits } from '@/lib/import/formats/quartetPsgGrid';
import { applyQuartetStGridEdits } from '@/lib/import/formats/quartetStGrid';

export interface QuartetExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportQuartet(song: TrackerSong): Promise<QuartetExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Quartet export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'module.sqt').split('/').pop() ?? 'module.sqt';
  if (/\.4v$|^qts\./i.test(name)) {
    const st = applyQuartetStGridEdits(new Uint8Array(src), song.patterns);
    return { data: st.data, filename: name, warnings: st.warnings };
  }
  if (!/\.sqt$|^sqt\./i.test(name)) return { data: new Uint8Array(src), filename: name, warnings: ['only Quartet PSG (.sqt) and Quartet ST (.4v / qts.*) note edits are written; the module is saved unchanged'] };
  const res = applyQuartetGridEdits(new Uint8Array(src), song.patterns, song.fileSubsongs?.current ?? 0);
  return { data: res.data, filename: name, warnings: res.warnings };
}
