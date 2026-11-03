/**
 * SoundProgrammingLanguageExporter.ts - save a Sound Programming Language (.spl) song: the module it was loaded from,
 * with the grid's note edits patched into the stream bytes they came from (soundProgrammingLanguageEdits.ts). Same
 * length, byte-exact where nothing was edited; edits the module cannot hold in place come back as warnings.
 * Reference: SoundProgrammingLanguageParser.ts (import), soundProgrammingLanguageGrid.ts (the walk the grid is drawn from).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applySplGridEdits } from '@lib/import/formats/soundProgrammingLanguageEdits';

export interface SoundProgrammingLanguageExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportSoundProgrammingLanguage(song: TrackerSong): Promise<SoundProgrammingLanguageExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Sound Programming Language export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'module.spl').split('/').pop() ?? 'module.spl';
  const original = new Uint8Array(src);
  // a build that is not decoded opened without a layout: there is no grid to write back
  if (!song.uadeVariableLayout) return { data: original, filename: name, warnings: [] };
  const r = applySplGridEdits(original, song.patterns);
  return { data: r.data, filename: name, warnings: r.warnings };
}
