/**
 * SeanConranExporter.ts - save a Sean Conran (scr.*) song: the module it was loaded from, with each edited grid note
 * written into the pitch byte of the note command (N/O) that played it. `noteBytes` (SeanConranParser.ts) pair each
 * note cell with that byte's file offset and the note it showed; the shown note is the period table index + 1, and the
 * build (nw_scr_layout) says whether the byte is that index or twice it. Same length, byte-exact where nothing was
 * edited. A note where no note command plays, a removed note, a note outside the table and a pitch byte edited twice
 * differently are warnings, not written. Lengths, instruments and effects do not write back.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { scrLayout } from '@/engine/nuade/nuadeScrLayout';
import { scrNoteToBias } from '@lib/import/formats/seanConranGrid';

export interface SeanConranExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportSeanConran(song: TrackerSong): Promise<SeanConranExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Sean Conran export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'seanConran') throw new Error('Sean Conran export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'scr.module').split('/').pop() ?? 'scr.module';
  const loaded = new Uint8Array(src);
  const out = new Uint8Array(loaded);
  const edits = editedCells(song.patterns);
  if (edits.length === 0) return { data: out, filename: name, warnings: [] };
  const build = await scrLayout(loaded);
  if (!build) throw new Error('Sean Conran export: no known build matches the module the song was loaded from');
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  const written = new Map<number, number>();
  for (const { pattern, row, channel, cell } of edits) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0 && cell.note !== 97) warnings.push(`${where}: a note where the player plays none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    const byte = loaded[n.offset] + scrNoteToBias(build, cell.note) - scrNoteToBias(build, n.note);
    if (cell.note < 1 || cell.note > 96 || byte < 0 || byte > 0xff) {
      warnings.push(`${where}: note ${cell.note} is out of the period table; not written`);
      continue;
    }
    if (written.has(n.offset) && written.get(n.offset) !== byte) {
      warnings.push(`${where}: its pitch byte is already edited differently; not written`);
      continue;
    }
    written.set(n.offset, byte);
    out[n.offset] = byte;
  }
  return { data: out, filename: name, warnings };
}
