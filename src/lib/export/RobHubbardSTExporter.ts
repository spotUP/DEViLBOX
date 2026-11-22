/**
 * RobHubbardSTExporter.ts - save a Rob Hubbard ST (.rho) song: the module it was loaded from, with each edited grid note
 * written into the note byte that played it. The grid is a tick reading of sub-song 0 (RobHubbardSTParser.ts); its
 * `noteBytes` pair each note cell with the file byte of its note command ($00-$7F), and an edited note is that byte moved by
 * the cell's change. Same length, byte-exact where nothing was edited. A note where no command plays, a removed note, a note
 * outside the byte range and two different edits of one shared byte (a block played several times) are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { noteValueToPitch } from '@/lib/tracker/noteValue';
import { editedCells } from '@/lib/song/gridBaseline';

export interface RobHubbardSTExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

/** The highest note byte: $80 and above are commands. */
const MAX_NOTE_BYTE = 0x7f;

export async function exportRobHubbardST(song: TrackerSong): Promise<RobHubbardSTExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Rob Hubbard ST export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'robHubbardST') throw new Error('Rob Hubbard ST export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.rho').split('/').pop() ?? 'module.rho';
  const loaded = new Uint8Array(src);
  const out = new Uint8Array(loaded);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const written = new Map<number, number>();
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0) warnings.push(`${where}: a note where the player runs none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    // Grid notes are linear in pitch (negative below C-0), one semitone per table index.
    const pitch = noteValueToPitch(cell.note);
    const nb = pitch === null ? -1 : loaded[n.offset] + (pitch - (noteValueToPitch(n.note) ?? 0));
    if (pitch === null || nb < 0 || nb > MAX_NOTE_BYTE) {
      warnings.push(`${where}: note ${cell.note} is outside the range a note command can hold; not written`);
      continue;
    }
    const prior = written.get(n.offset);
    if (prior !== undefined && prior !== nb) {
      warnings.push(`${where}: shares its note byte with an earlier edit (a block played more than once); not written`);
      continue;
    }
    out[n.offset] = nb;
    written.set(n.offset, nb);
  }
  return { data: out, filename: name, warnings };
}
