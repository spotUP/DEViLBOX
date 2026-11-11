/**
 * JesperOlsenExporter.ts - save a Jesper Olsen (L/G offset-table) song: the module it was loaded from, with every grid cell
 * written through the layout's own cell writer (jesperOlsenGrid.joWriteCell, the one a live edit uses). Cell bytes depend on the
 * voice's transpose at that row, so patchModuleByLayout (encodeCell) cannot be used. The writer returns no runs for a cell that
 * still says what the module says, so an unedited export is byte-identical to the source. A row shared by several steps of a
 * subsong is one module row: every cell reading it names the same bytes. Parts a row has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';

export interface JesperOlsenExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportJesperOlsen(song: TrackerSong): Promise<JesperOlsenExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Jesper Olsen export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout?.writeCell) throw new Error('Jesper Olsen export needs the pattern layout the song was loaded with');
  const out = new Uint8Array(src.slice(0));
  let written = 0;
  song.patterns.forEach((pat, p) => {
    for (let ch = 0; ch < layout.numChannels; ch++) {
      const rows = pat.channels[ch]?.rows ?? [];
      for (let r = 0; r < rows.length; r++) {
        for (const run of layout.writeCell!(p, r, ch, rows[r])) { out.set(run.bytes, run.offset); written++; }
      }
    }
  });
  const name = (song.uadeEditableFileName ?? 'module.jo').split('/').pop() ?? 'module.jo';
  return { data: out, filename: name, warnings: written > 0 ? [`${written} edited byte run(s) written into the module`] : [] };
}
