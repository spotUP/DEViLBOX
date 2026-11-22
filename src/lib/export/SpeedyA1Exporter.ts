/**
 * SpeedyA1Exporter.ts - save a Speedy A1 System (.sas) song: the module it was loaded from, with each edited grid note
 * written into the file cell that plays it (SpeedyA1SystemParser.ts noteBytes) and each changed instrument into that
 * cell's sample byte. A note maps to the table byte whose period names it; where the table repeats a pitch (the octave
 * overlaps) the byte nearest the loaded one is kept. Same length, byte-exact where nothing was edited. A note where the
 * file plays none, a removed note, a note outside the table and two different edits of one shared cell are warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { SA1_PERIODS, SA1_SLIDE_EFFTYP, speedyA1GridNote } from '@/lib/import/formats/SpeedyA1SystemParser';

export interface SpeedyA1ExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const MAX_SAMPLE = 0x1f;

export async function exportSpeedyA1(song: TrackerSong): Promise<SpeedyA1ExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Speedy A1 export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'sonicArrangerSas') throw new Error('Speedy A1 export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.sas').split('/').pop() ?? 'module.sas';
  const loaded = new Uint8Array(src);
  const out = new Uint8Array(loaded);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const slides = new Map((layout.columnBytes ?? []).map((c) => [`${c.pattern}:${c.channel}:${c.row}`, c.offset]));
  const written = new Map<number, string>();
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const slideAt = slides.get(`${pattern}:${channel}:${row}`);
    if (slideAt !== undefined) {
      // A period slide: the amount low byte is editable, the direction switches between 1xx and 2xx.
      const opcode = Number(Object.keys(SA1_SLIDE_EFFTYP).find((k) => SA1_SLIDE_EFFTYP[Number(k)] === cell.effTyp));
      if (!opcode || cell.note !== 0) {
        warnings.push(`${where}: a period slide is edited as effect 1xx or 2xx only; not written`);
        continue;
      }
      out[slideAt - 2] = opcode;
      out[slideAt] = cell.eff & 0xff;
      continue;
    }
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0) warnings.push(`${where}: a note where the player runs none is not written`);
      continue;
    }
    if (cell.note === 0) {
      warnings.push(`${where}: removing a note is not written`);
      continue;
    }
    let byte = loaded[n.offset];
    if (cell.note !== n.note) {
      const fits = SA1_PERIODS.map((_, b) => b).filter((b) => speedyA1GridNote(b) === cell.note);
      if (!fits.length) {
        warnings.push(`${where}: note ${cell.note} is outside the replayer's period table; not written`);
        continue;
      }
      byte = fits.reduce((best, b) => (Math.abs(b - loaded[n.offset]) < Math.abs(best - loaded[n.offset]) ? b : best));
    }
    const sample = cell.instrument - 1;
    const sampleByte = sample >= 0 && sample <= MAX_SAMPLE ? sample : loaded[n.offset + 2];
    const value = `${byte}:${sampleByte}`;
    const prior = written.get(n.offset);
    if (prior !== undefined && prior !== value) {
      warnings.push(`${where}: shares its cell with an earlier edit (a pattern played more than once); not written`);
      continue;
    }
    out[n.offset] = byte;
    out[n.offset + 2] = sampleByte;
    written.set(n.offset, value);
  }
  return { data: out, filename: name, warnings };
}
