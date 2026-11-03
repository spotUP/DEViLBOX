/**
 * BeathovenExporter.ts - save a Beathoven Synthesizer (.bss) song: the module it was loaded from, with the grid's note
 * edits patched into the command streams they came from (beathovenEdits.ts). Same length, byte-exact where nothing was
 * edited; edits the module cannot hold in place come back as warnings.
 * Reference: BeathovenParser.ts (import), beathovenGrid.ts (the walk the grid is drawn from), TimFollinExporter.ts.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applyBeathovenGridEdits } from '@lib/import/formats/beathovenEdits';

export interface BeathovenExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportBeathoven(song: TrackerSong): Promise<BeathovenExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Beathoven export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'module.bss').split('/').pop() ?? 'module.bss';
  const original = new Uint8Array(src);
  // a module whose grid was not decoded has no layout: there is nothing to write back
  if (!song.uadeVariableLayout) return { data: original, filename: name, warnings: [] };
  const r = applyBeathovenGridEdits(original, song.patterns);
  return { data: r.data, filename: name, warnings: r.warnings };
}
