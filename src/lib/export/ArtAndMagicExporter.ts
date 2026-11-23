/**
 * ArtAndMagicExporter.ts - save an Art and Magic (.aam) song: the module it was loaded from, with each edited grid note
 * written into the note byte that played it. The grid is a step reading of the three voices (ArtAndMagicParser.ts); its
 * `noteBytes` pair each note cell with the file byte naming its note (a note byte $00-$5F or a portamento's from-note).
 * The byte is an index into the period table offset by the track entry's note base; the table is not one semitone per
 * index everywhere, so the new byte is the index whose period shows the edited note, minus that base.
 * Same length, byte-exact where nothing was edited. A note where no byte plays it (a replayed note, a rest), a note the
 * table cannot show, and two different edits of one shared byte (a pattern played several times) are warnings, not
 * written. Instrument and other column edits are not written (they would change the stream length).
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { editedCells } from '@/lib/song/gridBaseline';
import { AAM_PERIODS, AAM_PITCH_SEQ, aamIndexNote, locateAamLayout } from '@/lib/import/formats/ArtAndMagicParser';

export interface ArtAndMagicExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportArtAndMagic(song: TrackerSong): Promise<ArtAndMagicExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Art and Magic export needs the module the song was loaded from');
  const layout = song.uadeVariableLayout;
  if (!layout || layout.formatId !== 'artAndMagic') throw new Error('Art and Magic export needs the layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.aam').split('/').pop() ?? 'module.aam';
  const loaded = new Uint8Array(src);
  const l = locateAamLayout(loaded);
  if (!l) throw new Error('Art and Magic export: the loaded module has no known driver build');
  const indexOf = (note: number): number => {
    for (let i = 0; i < AAM_PERIODS; i++) if (aamIndexNote(loaded, l, i) === note) return i;
    return -1;
  };
  const out = new Uint8Array(loaded);
  const at = new Map((layout.noteBytes ?? []).map((n) => [`${n.pattern}:${n.channel}:${n.row}`, n]));
  const written = new Map<number, number>();
  const warnings: string[] = [];
  for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
    const where = `pattern ${pattern} voice ${channel + 1} row ${row}`;
    const n = at.get(`${pattern}:${channel}:${row}`);
    if (!n) {
      if (cell.note !== 0) warnings.push(`${where}: a note where no note byte plays is not written`);
      continue;
    }
    if (cell.note === n.note) continue;
    const noteBase = indexOf(n.note) - loaded[n.offset];
    const target = indexOf(cell.note);
    const nb = target - noteBase;
    if (target < 0 || nb < 0 || nb >= AAM_PITCH_SEQ) {
      warnings.push(`${where}: note ${cell.note} is outside what the period table and note byte can hold; not written`);
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
