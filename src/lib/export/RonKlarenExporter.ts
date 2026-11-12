/**
 * RonKlarenExporter.ts - save a Ron Klaren (rk.*) song: the module it was loaded from, with each edited note written where
 * the parser's layout puts it (RonKlarenParser.ts layout, encodeRonKlarenCell). A note edit rewrites the 2-byte note command
 * (period index) and keeps the stored wait byte, so the song's timing never moves; same length, and byte-exact where nothing
 * was edited. A note typed on a row inside a wait (no command there) comes back as a warning.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface RonKlarenExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportRonKlaren(song: TrackerSong): Promise<RonKlarenExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Ron Klaren export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Ron Klaren export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.rk').split('/').pop() ?? 'module.rk';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
