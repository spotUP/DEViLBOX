/**
 * RichardJosephExporter.ts - save a Richard Joseph (rjp.* / *.sng) song: the module it was loaded from, with each edited grid cell's note byte
 * written where the parser's layout puts it (RichardJosephParser.ts getCellFileOffset / encodeCell). Same length, and
 * byte-exact where nothing was edited. A note on the first blank row after a pattern's last event grows the pattern stream (richardJosephEdits.ts); other notes without a place come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';
import { addRichardJosephNotes } from '@lib/import/formats/richardJosephEdits';

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
  const warnings: string[] = [];
  const unplaced = [...r.unplaced].sort((a, b) => a.pattern - b.pattern || a.channel - b.channel || a.row - b.row);
  return { data: await addRichardJosephNotes(r.bytes, name, song, unplaced, warnings), filename: name, warnings };
}
