/**
 * TomyTrackerExporter.ts - save a Tomy Tracker (sg.*) song: the module it was loaded from, with each edited 4-byte grid cell
 * written where the parser's layout puts it (TomyTrackerParser.ts layout, encodeTomyCell). Same length, and
 * byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface TomyTrackerExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportTomyTracker(song: TrackerSong): Promise<TomyTrackerExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Tomy Tracker export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Tomy Tracker export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.sg').split('/').pop() ?? 'module.sg';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
