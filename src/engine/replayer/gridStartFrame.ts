import type { TrackerSong } from '@engine/TrackerReplayer';
import { songRowTimeline, timeAtRow } from '@engine/dj/songRowTimeline';

/**
 * Output frame at which grid row (`songPos`, `row`) starts, for engines without a row preview: the song's one order
 * walk (songRowTimeline: initial speed / tempo, Fxx changes, Dxx, Bxx, loops) gives the row's time, times the sample
 * rate. Null when the walk never plays the row. The engine's own sequencer is exact, this is the grid's clock: a song
 * whose engine timing differs from its grid (engine-side speed changes the grid lacks) lands near, not on, the row.
 */
export function gridStartFrame(song: TrackerSong, songPos: number, row: number, sampleRate: number): number | null {
  const ms = timeAtRow(songRowTimeline(song), songPos, row);
  return ms === null ? null : Math.round((ms / 1000) * sampleRate);
}
