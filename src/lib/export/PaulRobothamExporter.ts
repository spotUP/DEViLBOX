/**
 * PaulRobothamExporter.ts - save a Paul Robotham song: the module it was loaded from with the grid's note edits written
 * into the note bytes of the voice command streams (paulRobothamGrid.applyPRGridEdits). A note edit moves one byte in
 * place, so the streams keep their length and an unedited export is byte-identical to the source. Edits a stream has no
 * place for (a note on an empty frame, a removed note, instrument changes) come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyPRGridEdits } from '@/lib/import/formats/paulRobothamGrid';

export interface PaulRobothamExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportPaulRobotham(song: TrackerSong): Promise<PaulRobothamExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Paul Robotham export needs the module the song was loaded from');
  const dv = new Uint8Array(src);
  const instruments = (dv[6] << 8) | dv[7];
  const res = applyPRGridEdits(dv, song.patterns, instruments);
  const name = (song.uadeEditableFileName ?? 'module.dat').split('/').pop() ?? 'module.dat';
  return { data: res.data, filename: name, warnings: res.warnings };
}
