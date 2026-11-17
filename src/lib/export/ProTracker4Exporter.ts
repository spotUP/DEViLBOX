/**
 * ProTracker4Exporter.ts - write a ProTracker 4.1 song back to its own file.
 *
 * The file the song plays (protracker4FileData) gets every edited grid cell
 * written at its 4-byte MOD cell; every other byte (samples, PT4X block,
 * dynamic-loop envelopes, footer) is carried, so an unedited song exports
 * byte-identical. Also the module the player takes after an edit.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { patchModuleByLayout } from './layoutPatch';

export function exportProTracker4(song: TrackerSong): { data: Uint8Array; filename: string; warnings: string[] } {
  if (!song.protracker4FileData || !song.uadePatternLayout) throw new Error('ProTracker 4 export needs the module the song was loaded from');
  const { bytes, unplaced } = patchModuleByLayout(song.protracker4FileData, song.uadePatternLayout, song.patterns);
  const base = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: bytes,
    filename: `${base}.mod`,
    warnings: unplaced.length ? [`${unplaced.length} edited cells have no place in the file and were not written`] : [],
  };
}
