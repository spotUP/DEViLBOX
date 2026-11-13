/**
 * QuartetExporter.ts - save a Quartet PSG (.sqt) song: the module it was loaded from with the grid's note edits written
 * into the stored frequency longs of the voice streams (quartetPsgGrid.applyQuartetGridEdits). A note edit rewrites four
 * bytes in place, so an unedited export is byte-identical to the source. Edits the stream has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyQuartetGridEdits } from '@/lib/import/formats/quartetPsgGrid';

export interface QuartetExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportQuartet(song: TrackerSong): Promise<QuartetExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Quartet export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'module.sqt').split('/').pop() ?? 'module.sqt';
  if (!/\.sqt$|^sqt\./i.test(name)) return { data: new Uint8Array(src), filename: name, warnings: ['only Quartet PSG (.sqt) note edits are written; the module is saved unchanged'] };
  const res = applyQuartetGridEdits(new Uint8Array(src), song.patterns, song.fileSubsongs?.current ?? 0);
  return { data: res.data, filename: name, warnings: res.warnings };
}
