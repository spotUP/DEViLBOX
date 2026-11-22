/**
 * SCUMMExporter.ts - save a SCUMM song: the module it was loaded from, with each edited grid note written into the
 * period word of the event that played it. `noteBytes` (SCUMMParser.ts) pair each note cell with the file offset of
 * its event's period and the grid note it showed. Same length, byte-exact where nothing was edited. A note where no
 * event plays, a removed note, and a note with no period are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { noteToPeriod } from '@/lib/amiga/periodNotes';

export interface SCUMMExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportSCUMM(song: TrackerSong): Promise<SCUMMExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('SCUMM export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'scumm') throw new Error('SCUMM export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.scumm').split('/').pop() ?? 'module.scumm';
  const out = new Uint8Array(src.byteLength);
  out.set(new Uint8Array(src));
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0) warnings.push(`${where}: a note where the player plays none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    const period = noteToPeriod(cell.note);
    if (cell.note === 0 || period === 0) {
      warnings.push(`${where}: note ${cell.note} has no period; not written`);
      continue;
    }
    out[n.offset] = period >> 8;
    out[n.offset + 1] = period & 0xff;
  }
  return { data: out, filename: name, warnings };
}
