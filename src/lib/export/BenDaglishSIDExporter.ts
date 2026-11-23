/**
 * BenDaglishSIDExporter.ts - save a Ben Daglish SID (bds.*) song: the module it was loaded from, with each edited grid
 * note written into the note byte that played it. `noteBytes` (BenDaglishSIDParser.ts) pair each note cell with that
 * byte's file offset and the note it showed; the shown note is the note byte plus the order list transpose plus a
 * constant, so the new byte is the loaded byte moved by the note difference. Same length, byte-exact where nothing
 * was edited. A note where no note byte plays, a removed note, a byte that would leave 0x00..0x7F and a note byte
 * edited twice differently are warnings, not written. Lengths, instruments and effects do not write back.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';

export interface BenDaglishSIDExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportBenDaglishSID(song: TrackerSong): Promise<BenDaglishSIDExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Ben Daglish SID export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'benDaglishSID') throw new Error('Ben Daglish SID export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'bds.module').split('/').pop() ?? 'bds.module';
  const loaded = new Uint8Array(src);
  const out = new Uint8Array(loaded);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  const written = new Map<number, number>();
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0 && cell.note !== 97) warnings.push(`${where}: a note where the player plays none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    const byte = loaded[n.offset] + cell.note - n.note;
    if (cell.note < 1 || cell.note > 96 || byte < 0 || byte > 0x7f) {
      warnings.push(`${where}: note ${cell.note} is out of the note byte range; not written`);
      continue;
    }
    if (written.has(n.offset) && written.get(n.offset) !== byte) {
      warnings.push(`${where}: its note byte is already edited differently; not written`);
      continue;
    }
    written.set(n.offset, byte);
    out[n.offset] = byte;
  }
  return { data: out, filename: name, warnings };
}
