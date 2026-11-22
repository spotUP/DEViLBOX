/**
 * SteveBarrettExporter.ts - save a Steve Barrett (sb.*) song: the module it was loaded from, with each edited grid note
 * written into the note byte that played it. The grid is a row-step reading of song 1 (SteveBarrettParser.ts); its
 * `noteBytes` pair each note cell with the file byte of its event and the grid note it showed ((byte + transpose) & $FF
 * + 1), so the transpose in force is recovered from the loaded byte. Same length, byte-exact where nothing was edited.
 * A note where no event plays, a removed note, a note whose byte would leave 0..$79 and two different edits of one
 * shared byte (a pattern played several times) are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';

export interface SteveBarrettExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

/** Note bytes are 0..$79; $7A..$7F are commands and $80 and above are prefixes or pattern ends. */
const MAX_NOTE_BYTE = 0x79;

export async function exportSteveBarrett(song: TrackerSong): Promise<SteveBarrettExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Steve Barrett export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'steveBarrett') throw new Error('Steve Barrett export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.sb').split('/').pop() ?? 'module.sb';
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
    const transpose = (n.note - 1 - loaded[n.offset]) & 0xff;
    const nb = (cell.note - 1 - transpose) & 0xff;
    if (cell.note === 0 || nb > MAX_NOTE_BYTE) {
      warnings.push(`${where}: note ${cell.note} needs a note byte outside 0..121 under this transpose; not written`);
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
