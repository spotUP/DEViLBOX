/**
 * RichardJosephExporter.ts - save a Richard Joseph (rjp.* / *.sng) song: the module it was loaded from, with each edited grid cell's note byte
 * written where the parser's layout puts it (RichardJosephParser.ts getCellFileOffset / encodeCell). Same length, and
 * byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface RichardJosephExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportRichardJoseph(song: TrackerSong): Promise<RichardJosephExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Richard Joseph export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Richard Joseph export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.sng').split('/').pop() ?? 'module.sng';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
