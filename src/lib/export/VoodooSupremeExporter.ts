/**
 * VoodooSupremeExporter.ts - save a Voodoo Supreme Synthesizer (.vss) song: the module it was loaded from, with each edited
 * grid note written into the track command that played it. The grid is a reading of the player (voodooSupremeGrid.ts), so a
 * cell is not a place in the file: the layout's `noteBytes` pairs each note cell with the file byte of its command (a note
 * byte below 0x80, or a portamento's start byte) and the transpose in force. The replayer plays the period table entry
 * (byte + transpose), so an edited note is the byte whose entry shows the new note. Same length, and byte-exact where nothing
 * was edited. A note on a row no command played, a removed note, a note the table has no byte for and two edits of one shared
 * byte (a track played several times) come back as warnings and are not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { voodooByteFor } from '@/lib/import/formats/voodooSupremeGrid';

export interface VoodooSupremeExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const NOTE_OFF = 97;

export async function exportVoodooSupreme(song: TrackerSong): Promise<VoodooSupremeExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Voodoo Supreme export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'uade_vss') throw new Error('Voodoo Supreme export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.vss').split('/').pop() ?? 'module.vss';
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
    if (cell.note < 1 || cell.note >= NOTE_OFF) {
      warnings.push(`${where}: a removed note or note-off needs a different command; not written`);
      continue;
    }
    const nb = voodooByteFor(cell.note, n.base ?? 0, loaded[n.offset]);
    if (nb < 0) {
      warnings.push(`${where}: note ${cell.note} is not in the player's period table; not written`);
      continue;
    }
    const prior = written.get(n.offset);
    if (prior !== undefined && prior !== nb) {
      warnings.push(`${where}: shares its note byte with an earlier edit (a track played more than once); not written`);
      continue;
    }
    out[n.offset] = nb;
    written.set(n.offset, nb);
  }
  return { data: out, filename: name, warnings };
}
