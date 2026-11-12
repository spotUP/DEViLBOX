/**
 * GlueMonExporter.ts - save a GlueMon (glue.*) song: the module it was loaded from, with each edited 1-byte grid cell
 * written where the parser's layout puts it (GlueMonParser.ts layout, encodeGlueMonCell). Same length, and
 * byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface GlueMonExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportGlueMon(song: TrackerSong): Promise<GlueMonExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('GlueMon export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('GlueMon export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.glue').split('/').pop() ?? 'module.glue';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
