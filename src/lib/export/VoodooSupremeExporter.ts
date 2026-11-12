/**
 * VoodooSupremeExporter.ts - save a Voodoo Supreme Synthesizer (.vss) song: the module it was loaded from, with each edited
 * grid note written into the track command that played it. The grid is a reading of the player (voodooSupremeGrid.ts), so a
 * cell is not a place in the file: the layout's `noteBytes` pairs each note cell with the file byte of its command (a note
 * byte below 0x80, or a portamento's start byte) and the transpose in force. The replayer plays the period table entry
 * (byte + transpose), so an edited note is the byte whose entry shows the new note. Same length, and byte-exact where nothing
 * was edited. Extra note columns (several notes in one row of a voice) carry their own byte like the first column. A removed
 * note or a note-off becomes the note cut command 0xFF (same size as note + wait; the cell reloads as a note-off); a portamento
 * is longer, so removing it is a warning. A note on a row no command played, a note the table has no byte for and two edits of
 * one shared byte (a track played several times) come back as warnings and are not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { getColumnField } from '@/lib/tracker/noteColumns';
import { voodooByteFor } from '@/lib/import/formats/voodooSupremeGrid';

export interface VoodooSupremeExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const NOTE_OFF = 97;
/** Track command 0xFF: note cut, followed by a wait byte like a note. */
const NOTE_CUT = 0xff;

export async function exportVoodooSupreme(song: TrackerSong): Promise<VoodooSupremeExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Voodoo Supreme export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'uade_vss') throw new Error('Voodoo Supreme export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.vss').split('/').pop() ?? 'module.vss';
  const loaded = new Uint8Array(src);
  const out = new Uint8Array(loaded);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}:${n.col ?? 0}`, n]));
  const written = new Map<number, number>();
  const warnings: string[] = [];
  const noteOf = (pattern: number, channel: number, row: number, col: number): number =>
    getColumnField(song.patterns[pattern]?.channels[channel]?.rows[row] ?? {}, col, 'note') ?? 0;
  const where = (pattern: number, channel: number, row: number, col: number): string =>
    `pattern ${pattern} voice ${channel + 1} row ${row}${col > 0 ? ` note column ${col + 1}` : ''}`;

  // Every cell the module has a command for: compared with the note the module plays, whatever the baseline hash says
  // (the hash does not see extra note columns).
  for (const n of at.values()) {
    const col = n.col ?? 0;
    const note = noteOf(n.pattern, n.channel, n.row, col);
    if (note === n.note) continue;
    const label = where(n.pattern, n.channel, n.row, col);
    let nb: number;
    if (note < 1 || note === NOTE_OFF) {
      // A removed note or a note-off: the note cut (0xFF) followed by the same wait is the same size as note + wait.
      if (n.porta) { warnings.push(`${label}: a portamento is four bytes and a note cut two; a removed note there is not written`); continue; }
      nb = NOTE_CUT;
    } else if (note > NOTE_OFF) {
      warnings.push(`${label}: note ${note} is not in the player's period table; not written`);
      continue;
    } else {
      nb = voodooByteFor(note, n.base ?? 0, loaded[n.offset]);
      if (nb < 0) {
        warnings.push(`${label}: note ${note} is not in the player's period table; not written`);
        continue;
      }
    }
    const prior = written.get(n.offset);
    if (prior !== undefined && prior !== nb) {
      warnings.push(`${label}: shares its note byte with an earlier edit (a track played more than once); not written`);
      continue;
    }
    out[n.offset] = nb;
    written.set(n.offset, nb);
  }
  // A note on a cell no command played.
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    if (cell.note > 0 && !at.has(`${pattern}:${channel}:${row}:0`)) warnings.push(`${where(pattern, channel, row, 0)}: a note where the player runs none is not written`);
  }
  song.patterns.forEach((p, pattern) => p.channels.forEach((ch, channel) => ch.rows.forEach((cell, row) => {
    (cell.extraNotes ?? []).forEach((e, i) => {
      const col = i + 1;
      if ((e.note ?? 0) > 0 && e.note !== NOTE_OFF && !at.has(`${pattern}:${channel}:${row}:${col}`)) {
        warnings.push(`${where(pattern, channel, row, col)}: a note where the player runs none is not written`);
      }
    });
  })));
  return { data: out, filename: name, warnings };
}
