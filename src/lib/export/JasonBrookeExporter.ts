/**
 * JasonBrookeExporter.ts - save a Jason Brooke song: the module it was loaded from, with each edited grid note written
 * into the note byte of the event that played it. `noteBytes` (JasonBrookeGrid.ts) pair each note cell with the file
 * offset of its note byte and the grid note it showed; the period table is chromatic, so a change of n grid notes is
 * n added to the note byte. Same length, byte-exact where nothing was edited. A note where no event plays, a removed
 * note, a note byte that would leave its range ($00..$7F old syntax, $80..$DF new), a note byte edited twice differently
 * and any instrument, volume or effect edit (the event bytes hold only the note) are warnings, not written.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells, getGridBaseline, hashCell } from '@/lib/song/gridBaseline';

export interface JasonBrookeExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportJasonBrooke(song: TrackerSong): Promise<JasonBrookeExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Jason Brooke export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  const name = (song.uadeEditableFileName ?? 'module.jb').split('/').pop() ?? 'module.scn';
  if (!layout || layout.formatId !== 'jasonBrooke') {
    // No grid decoded (not a version A or B driver module): the placeholder pattern has no byte for an edit to land in.
    return { data: new Uint8Array(src), filename: name, warnings: ['Jason Brooke edits are refused: no pattern grid was decoded from this module (not a version A or B driver module), so it is exported byte-identical; edits were not written'] };
  }
  const out = new Uint8Array(src.byteLength);
  out.set(new Uint8Array(src));
  const loaded = new Uint8Array(src);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const warnings: string[] = [];
  const written = new Map<number, number>();
  const baseline = getGridBaseline();
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      warnings.push(`${where}: ${cell.note !== 0 ? 'a note where the player plays none' : 'an edit on a row with no note event'} is not written`);
      continue;
    }
    const flat = song.patterns[pattern].channels.slice(0, channel).reduce((s, ch) => s + ch.rows.length, 0) + row;
    if (hashCell({ ...cell, note: n.note }) !== baseline?.[pattern]?.[flat]) {
      warnings.push(`${where}: instrument, volume and effect edits are not written (a Jason Brooke event byte holds only the note)`);
    }
    if (cell.note === n.note) continue;
    const word = loaded[n.offset] + (cell.note - n.note);
    if (cell.note === 0 || word < (loaded[n.offset] & 0x80) || word > ((loaded[n.offset] & 0x80) ? 0xdf : 0x7f)) {
      warnings.push(`${where}: note ${cell.note} is out of the period table; not written`);
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
