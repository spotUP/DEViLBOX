/**
 * Tfmx7vExporter.ts - save a Jochen Hippel 7V (hip7.* / .hip7) song: the module it was loaded from with the grid's edits written in
 * by rebuildHippelSong (the same writer the nativeExportRouter 'hippel' branch uses), so the TFMX block, sample headers and PCM
 * stay as loaded. Byte-exact where nothing was edited; edits with no room in the module come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { rebuildHippelSong, hippelRefusedWarnings } from '@/engine/hippel/rebuildHippelModule';

export interface Tfmx7vExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportTfmx7v(song: TrackerSong): Promise<Tfmx7vExportResult> {
  if (!song.hippelFileData) throw new Error('Jochen Hippel 7V export needs the module the song was loaded from');
  const rebuilt = rebuildHippelSong(song);
  if (!rebuilt) throw new Error('Jochen Hippel 7V export could not rebuild the module');
  const name = (song.uadeEditableFileName ?? 'module.hip7').split('/').pop() ?? 'module.hip7';
  return { data: rebuilt.bytes, filename: name, warnings: hippelRefusedWarnings(rebuilt.refused) };
}
