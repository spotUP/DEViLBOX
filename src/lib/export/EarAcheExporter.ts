/**
 * EarAcheExporter.ts - save an EarAche (.ea) song: the module it was loaded from, with each edited grid cell's two bytes
 * written where the parser's layout puts it (EarAcheParser.ts getCellFileOffset / EarAcheEncoder.ts). Same length, and
 * byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { earAcheSpeedOffsets } from '@/lib/import/formats/EarAcheParser';
import { patchModuleByLayout } from './layoutPatch';

export async function exportEarAche(song: TrackerSong): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('EarAche export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('EarAche export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.ea').split('/').pop() ?? 'module.ea';
  const r = patchModuleByLayout(src, layout, song.patterns);
  // Per-entry speed: Fxx on row 0 of a pattern is the high nibble of that entry's second word.
  const bytes = r.bytes;
  earAcheSpeedOffsets(bytes).forEach((at, p) => {
    const cell = song.patterns[p]?.channels[0].rows[0];
    if (cell?.effTyp2 === 0x0f && cell.eff2 >= 1 && cell.eff2 <= 15) bytes[at] = (bytes[at] & 0x0f) | (cell.eff2 << 4);
  });
  return {
    data: new Blob([r.bytes as BlobPart], { type: 'application/octet-stream' }),
    filename: name,
    warnings: r.unplaced.length > 0 ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`] : [],
  };
}
