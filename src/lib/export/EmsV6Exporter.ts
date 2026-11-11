/**
 * EmsV6Exporter.ts - save an EMS v6 (.ems, tag "E.M.S. V6") song: the module it was loaded from, with each edited grid note
 * written into the note command that played it. The grid is a reading of the player (EMSv6Parser.ts), so a cell is not a place
 * in the file: the parser's `noteBytes` pairs each note cell with the file byte of its command (a note byte, or a glide's
 * first argument), and an edited note is that byte moved by the cell's change. Same length, and byte-exact where nothing was
 * edited. A note on a row no command played, a removed note, a note outside the grid range and two edits of one shared byte
 * (a pattern played several times) come back as warnings and are not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';

export interface EmsV6ExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

/** The highest note byte: 0xEF and above are commands. */
const MAX_NOTE_BYTE = 0xee;
/** The highest grid note a note command can play (period table index 96). */
const MAX_GRID_NOTE = 96;

export async function exportEmsV6(song: TrackerSong): Promise<EmsV6ExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('EMS v6 export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'emsv6') throw new Error('EMS v6 export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.ems').split('/').pop() ?? 'module.ems';
  const loaded = new Uint8Array(src);
  const out = new Uint8Array(loaded);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const written = new Map<number, number>();
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note > 0) warnings.push(`${where}: a note where the player runs none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    if (cell.note < 1 || cell.note > MAX_GRID_NOTE) {
      warnings.push(`${where}: a removed note or note-off needs a different command; not written`);
      continue;
    }
    const nb = loaded[n.offset] + (cell.note - n.note);
    if (nb < 0 || nb > MAX_NOTE_BYTE) {
      warnings.push(`${where}: note ${cell.note} is outside the range the command can hold; not written`);
      continue;
    }
    const prior = written.get(n.offset);
    if (prior !== undefined && prior !== nb) {
      warnings.push(`${where}: shares its note byte with an earlier edit (a pattern played more than once); not written`);
      continue;
    }
    out[n.offset] = nb;
    written.set(n.offset, nb);
  }
  return { data: out, filename: name, warnings };
}
