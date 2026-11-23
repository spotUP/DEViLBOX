/**
 * PeterVerswyvelenPackerExporter.ts - save a Peter Verswyvelen Packer (.pvp) song: the module it was loaded from, with each edited grid
 * cell's 4-byte run-length note cell (PeterVerswyvelenPackerEncoder) written where the parser's layout puts it (PeterVerswyvelenPackerParser.ts). Same length, and
 * byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface PeterVerswyvelenPackerExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportPeterVerswyvelenPacker(song: TrackerSong): Promise<PeterVerswyvelenPackerExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Peter Verswyvelen Packer export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Peter Verswyvelen Packer export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.pvp').split('/').pop() ?? 'module.pvp';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
