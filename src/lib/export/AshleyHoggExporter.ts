/**
 * AshleyHoggExporter.ts - save an old-family Ashley Hogg song: the module it was loaded from, with each edited grid note written
 * into the note byte of the event that played it. `noteBytes` (AshleyHoggParser.ts) pair each note cell with the file
 * offset of its note byte and the grid note it showed; the period table is chromatic, so a change of n grid notes is
 * n added to the note byte. Same length, byte-exact where nothing was edited. A note where no event plays, a removed
 * note, a note byte that would leave 0..$5F and a note byte edited twice differently are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';

export interface AshleyHoggExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportAshleyHogg(song: TrackerSong): Promise<AshleyHoggExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Ashley Hogg export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'ashleyHogg') throw new Error('Ashley Hogg export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'ash.module').split('/').pop() ?? 'ash.module';
  const out = new Uint8Array(src.byteLength);
  out.set(new Uint8Array(src));
  const loaded = new Uint8Array(src);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  const written = new Map<number, number>();
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    if (cell.volume || cell.effTyp || cell.eff || cell.effTyp2 || cell.eff2) warnings.push(`${where}: volume and effect edits are refused: the old Ashley Hogg pattern byte stream has no per-note volume or effect byte (a note is followed only by its instrument; sustain, slide, speed and wait are separate commands), so a row cannot carry its own; not written`);
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0) warnings.push(`${where}: a note where the player plays none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    const word = loaded[n.offset] + (cell.note - n.note);
    if (cell.note === 0 || word < 0 || word > 0x5f) {
      warnings.push(`${where}: note ${cell.note} is out of the period table; not written`);
      continue;
    }
    if (written.has(n.offset) && written.get(n.offset) !== word) {
      warnings.push(`${where}: its note byte is already edited differently; not written`);
      continue;
    }
    written.set(n.offset, word);
    out[n.offset] = word;
  }
  return { data: out, filename: name, warnings };
}
