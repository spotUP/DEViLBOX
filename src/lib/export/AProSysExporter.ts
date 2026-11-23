/**
 * PSAExporter.ts - save a AProSys song: the module it was loaded from, with each edited grid
 * cell's bytes written where the parser's layout puts it (AProSysParser.ts getCellFileOffset / encodeAProSysCell). Same
 * length, and byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface AProSysExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportAProSys(song: TrackerSong): Promise<AProSysExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('AProSys export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('AProSys export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.aps').split('/').pop() ?? 'module.aps';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
