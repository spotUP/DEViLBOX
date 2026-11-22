/**
 * KrisHatlelidExporter.ts - save a Kris Hatlelid song: the module it was loaded from, with each edited grid note written
 * into the note byte of the event that played it. `noteBytes` (KrisHatlelidParser.ts) pair each note cell with the file
 * offset of its note byte and the grid note it showed; the pitch is a semitone index, so a change of n grid notes is
 * n added to the low 7 bits of the note byte (bit 7 is the tie flag and stays). Same length, byte-exact where nothing was edited. A note where no event plays, a removed
 * note, a pitch that would leave 0..$7F and a note byte edited twice differently are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';

export interface KrisHatlelidExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportKrisHatlelid(song: TrackerSong): Promise<KrisHatlelidExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Kris Hatlelid export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'krisHatlelid') throw new Error('Kris Hatlelid export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'kh.module').split('/').pop() ?? 'kh.module';
  const out = new Uint8Array(src.byteLength);
  out.set(new Uint8Array(src));
  const loaded = new Uint8Array(src);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  const written = new Map<number, number>();
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0) warnings.push(`${where}: a note where the player plays none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    const old = loaded[n.offset];
    const pitch = (old & 0x7f) + (cell.note - n.note);
    const word = (old & 0x80) | pitch;
    if (cell.note === 0 || pitch < 0 || pitch > 0x7f) {
      warnings.push(`${where}: note ${cell.note} is outside the pitch range; not written`);
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
