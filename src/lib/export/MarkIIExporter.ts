/**
 * MarkIIExporter.ts - save a Mark II song: the module it was loaded from, with each edited grid note written into the
 * note byte of the sequence step that played it. The grid is a step reading of the row table (MarkIIParser.ts); its
 * `noteBytes` pair each note cell with the file byte of its step and the grid note it showed (the byte moved by the
 * row's transpose, + 1), so the transpose in force is recovered from the loaded byte. Same length, byte-exact where
 * nothing was edited. A note where no step plays, a removed note, a note whose byte would leave 0..$7F (bit 7 is the
 * slide flag), hit the hold note $32 of the versions that have it, or leave the period table, and two different
 * edits of one shared byte (a sequence played in several rows) are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { identifyMarkII, markIIPeriodCount } from '@/lib/import/formats/MarkIIParser';

export interface MarkIIExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

const MAX_NOTE_BYTE = 0x7f;
const HOLD_NOTE = 0x32;

export async function exportMarkII(song: TrackerSong): Promise<MarkIIExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Mark II export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'markII') throw new Error('Mark II export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.mk2').split('/').pop() ?? 'module.mk2';
  const loaded = new Uint8Array(src);
  const version = identifyMarkII(loaded);
  if (!version) throw new Error('Mark II export: unknown player version');
  const periodCount = markIIPeriodCount(loaded, version);
  const out = new Uint8Array(loaded);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const written = new Map<number, number>();
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0) warnings.push(`${where}: a note where the player plays none is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    // Up or down, the transpose is the difference between the shown note and the stored byte.
    const transpose = (n.note - 1 - loaded[n.offset]) & 0xff;
    const nb = (cell.note - 1 - transpose) & 0xff;
    if (cell.note === 0 || cell.note > periodCount || nb > MAX_NOTE_BYTE || (version.holdsNote && nb === HOLD_NOTE)) {
      warnings.push(`${where}: note ${cell.note} needs a note byte the player cannot play under this transpose; not written`);
      continue;
    }
    const prior = written.get(n.offset);
    if (prior !== undefined && prior !== nb) {
      warnings.push(`${where}: shares its note byte with an earlier edit (a sequence played more than once); not written`);
      continue;
    }
    out[n.offset] = nb;
    written.set(n.offset, nb);
  }
  return { data: out, filename: name, warnings };
}
