/**
 * StoneTrackerExporter.ts - save a StoneTracker (.spm) song: the module it was loaded from, with each edited note written where the
 * parser's layout puts it (the first byte of the note word of that row in its track pattern: note 1-36, bit 7 = end of row kept).
 * Samples, effects and row structure are kept, so the file keeps its length and is byte-exact where nothing was edited. A note
 * typed on a row that has no note word (adding one would grow the pattern) or a note removed comes back as a warning. A track
 * pattern is shared by every position that plays it, so an edit shows wherever it is played. The .sps sample bank is not changed.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface StoneTrackerExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportStoneTracker(song: TrackerSong): Promise<StoneTrackerExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('StoneTracker export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('StoneTracker export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.spm').split('/').pop() ?? 'module.spm';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
