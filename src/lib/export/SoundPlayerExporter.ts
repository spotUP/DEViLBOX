/**
 * SoundPlayerExporter.ts - save a Sound Player (SJS.*) song: the module it was loaded from, with each edited grid cell's 3-byte cell (note, instrument, command)
 * written where the parser's layout puts it (SoundPlayerParser.ts getCellFileOffset / encodeCell). Same length, and
 * byte-exact where nothing was edited. Notes typed on rows the module has no place for come back as warnings.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export interface SoundPlayerExportResult {
  data: Uint8Array;
  filename: string;
  warnings: string[];
}

export async function exportSoundPlayer(song: TrackerSong): Promise<SoundPlayerExportResult> {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Sound Player export needs the module the song was loaded from');
  const layout = song.uadePatternLayout;
  if (!layout) throw new Error('Sound Player export needs the pattern layout the song was loaded with');
  const name = (song.uadeEditableFileName ?? 'sjs.module').split('/').pop() ?? 'sjs.module';
  const r = patchModuleByLayout(src, layout, song.patterns);
  return {
    data: r.bytes,
    filename: name,
    warnings: r.unplaced.length > 0
      ? [`${r.unplaced.length} note(s) typed on rows the module has no place for were not saved`]
      : [],
  };
}
