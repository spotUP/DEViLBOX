/**
 * ManiacsOfNoiseExporter.ts - save a Maniacs of Noise song: the module it was loaded from with the grid's note edits
 * written into the stored note bytes of the patterns (maniacsOfNoiseGrid.applyManiacsOfNoiseGridEdits). A note edit
 * moves one byte in place, so an unedited export is byte-identical to the source. Edits a stream has no place for come
 * back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyManiacsOfNoiseGridEdits } from '@/lib/import/formats/maniacsOfNoiseGrid';

export interface ManiacsOfNoiseExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportManiacsOfNoise(song: TrackerSong): Promise<ManiacsOfNoiseExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Maniacs of Noise export needs the module the song was loaded from');
  const res = applyManiacsOfNoiseGridEdits(new Uint8Array(src), song.patterns, song.fileSubsongs?.current ?? 0);
  const name = (song.uadeEditableFileName ?? 'module.mon').split('/').pop() ?? 'module.mon';
  return { data: res.data, filename: name, warnings: res.warnings };
}
