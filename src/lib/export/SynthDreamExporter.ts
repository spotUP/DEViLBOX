/**
 * SynthDreamExporter.ts - save a SynthDream (sdr.) song: the module it was loaded from, with the grid's note and
 * instrument edits patched into the command words they came from (synthDreamEdits.ts). Same length, byte-exact
 * where nothing was edited; edits the module cannot hold in place come back as warnings.
 * Reference: SynthDreamParser.ts (import), synthDreamGrid.ts (the walk the grid is drawn from).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { applySdrGridEdits } from '@lib/import/formats/synthDreamEdits';

export interface SynthDreamExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportSynthDream(song: TrackerSong): Promise<SynthDreamExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('SynthDream export needs the module the song was loaded from');
  const name = (song.uadeEditableFileName ?? 'sdr.song').split('/').pop() ?? 'sdr.song';
  const original = new Uint8Array(src);
  // a song whose grid did not match the replayer's walk opened without a layout: there is no grid to write back
  if (!song.uadeVariableLayout) return { data: original, filename: name, warnings: [] };
  const r = applySdrGridEdits(original, song.patterns, song.fileSubsongs?.current ?? 0);
  return { data: r.data, filename: name, warnings: r.warnings };
}
