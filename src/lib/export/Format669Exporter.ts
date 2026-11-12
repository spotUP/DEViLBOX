/**
 * Format669Exporter.ts - save a Composer 669 (.669) song: the module it was loaded from, with each edited grid
 * cell's three bytes written where the parser's layout puts it (Format669Parser.ts getCellFileOffset / encode669Edit). Same
 * length, and byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface Format669ExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportFormat669(song: TrackerSong): Promise<Format669ExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Composer 669 export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Composer 669 export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.669').split('/').pop() ?? 'module.669';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
