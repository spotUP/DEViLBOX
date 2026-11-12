/**
 * JeroenTelExporter.ts - save a Jeroen Tel (jt.*) song: the module it was loaded from, with each edited note written where the
 * parser's layout puts it (JeroenTelParser.ts layout: the note byte of the track entry starting on that row). The byte is the grid
 * note minus the voice's transpose; durations, instruments, volumes and slides are kept, so the file keeps its length and is
 * byte-exact where nothing was edited. A note typed on a row inside an entry's duration comes back as a warning. Tracks are shared
 * between voices and positions, so an edit shows wherever the track is played.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface JeroenTelExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportJeroenTel(song: TrackerSong): Promise<JeroenTelExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Jeroen Tel export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Jeroen Tel export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'module.jt').split('/').pop() ?? 'module.sg';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
