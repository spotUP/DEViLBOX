/**
 * Anders0landExporter.ts - save an Anders 0land (.hot) song: the module it was loaded from, with each edited grid
 * cell's bytes written where the parser's layout puts it (Anders0landParser.ts, encodeAnders0landCell). Same length, and byte-exact
 * where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface Anders0landExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportAnders0land(song: TrackerSong): Promise<Anders0landExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Anders0land export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Anders0land export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.hot').split('/').pop() ?? 'module.hot';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
