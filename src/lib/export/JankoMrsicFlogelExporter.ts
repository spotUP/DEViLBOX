/**
 * JankoMrsicFlogelExporter.ts - save a Janko Mrsic-Flogel (.jmf) song: the module it was loaded from, with each edited grid
 * note written into the note byte that played it. The grid is a tick reading of sub-song 0 (JankoMrsicFlogelParser.ts);
 * its `noteBytes` pair each note cell with the file byte of its event. An edited note is the byte whose period-table entry
 * (byte + the driver's note offset) is that grid note; the table is read from the module. Same length, byte-exact where
 * nothing was edited. A note where no event plays, a removed note, a note not in the table and two different edits of one
 * shared byte (a stream played several times) are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { analyseJankoMrsicFlogel, jankoGridNote } from '@/lib/import/formats/JankoMrsicFlogelParser';

export interface JankoMrsicFlogelExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const HUNK_CODE_OFFSET = 0x20;
/** $FE and $FF are stream commands, never note bytes. */
const MAX_NOTE_BYTE = 0xfd;

export async function exportJankoMrsicFlogel(song: TrackerSong): Promise<JankoMrsicFlogelExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Janko Mrsic-Flogel export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'jankoMrsicFlogel') throw new Error('Janko Mrsic-Flogel export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.jmf').split('/').pop() ?? 'module.jmf';
  const loaded = new Uint8Array(src);
  const out = new Uint8Array(loaded);
  const mod = analyseJankoMrsicFlogel(loaded);
  if (!mod) throw new Error('Janko Mrsic-Flogel export: the module is no longer recognised');
  const img = loaded.subarray(HUNK_CODE_OFFSET);
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
    let nb = -1;
    for (let i = 0; i < mod.periodCount && nb < 0; i++) {
      if (jankoGridNote(img, mod, i) === cell.note) nb = i - mod.noteOffset;
    }
    if (cell.note === 0 || nb < 0 || nb > MAX_NOTE_BYTE) {
      warnings.push(`${where}: note ${cell.note} is not one the period table plays; not written`);
      continue;
    }
    const prior = written.get(n.offset);
    if (prior !== undefined && prior !== nb) {
      warnings.push(`${where}: shares its note byte with an earlier edit (a stream played more than once); not written`);
      continue;
    }
    out[n.offset] = nb;
    written.set(n.offset, nb);
  }
  return { data: out, filename: name, warnings };
}
