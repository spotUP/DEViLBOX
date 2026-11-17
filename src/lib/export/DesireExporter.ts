/**
 * DesireExporter.ts - save a Desire (DSR.*) song: the module it was loaded from with each edited note byte (and instrument
 * select operand) written in place where DesireParser's layout puts it. Same length, byte-exact where nothing was edited.
 * shortcut: length-changing edits (inserted notes, durations) are not written; they would need the W table and the streams repacked.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface DesireExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportDesire(song: TrackerSong): Promise<DesireExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Desire export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Desire export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'DSR.module').split('/').pop() ?? 'DSR.module';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0 ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`] : [],
  };
}
