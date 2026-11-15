/**
 * WallyBebenExporter.ts - save a Wally Beben (.wb) song: the module it was loaded from, with each edited grid cell's note byte
 * written where the parser's layout puts it (WallyBebenParser.ts getCellFileOffset / encodeCell). Same length, and
 * byte-exact where nothing was edited. A note on a row past its phrase's end grows the phrase (wallyBebenEdits.ts); other rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';
import { addWallyBebenNote } from '@lib/import/formats/wallyBebenEdits';

export interface WallyBebenExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportWallyBeben(song: TrackerSong): Promise<WallyBebenExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Wally Beben export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Wally Beben export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.wb').split('/').pop() ?? 'module.wb';
  const r = patchModuleByLayout(src, layout, song.patterns);
  let data = r.bytes;
  const warnings: string[] = [];
  for (const u of r.unplaced) {
    const cell = song.patterns[u.pattern]?.channels[u.channel]?.rows[u.row];
    if (!cell) continue;
    const res = addWallyBebenNote(data, { ...u, note: cell.note, instrument: cell.instrument });
    if ('data' in res) data = res.data;
    else warnings.push(`Wally Beben pattern ${u.pattern}, channel ${u.channel + 1}, row ${u.row}: ${res.refused}; the note was not written.`);
  }
  return { data, filename: name, warnings };
}
