/**
 * PSAExporter.ts - save a Professional Sound Artists song: the module it was loaded from, with each edited grid
 * cell's bytes written where the parser's layout puts it (PSAParser.ts getCellFileOffset / encodePSACell). Same
 * length, and byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface PSAExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportPSA(song: TrackerSong): Promise<PSAExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Professional Sound Artists export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Professional Sound Artists export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.psa').split('/').pop() ?? 'module.psa';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
