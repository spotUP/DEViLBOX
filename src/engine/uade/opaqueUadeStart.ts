import type { TrackerSong } from '@engine/TrackerReplayer';
import type { UADEEngine } from './UADEEngine';
import { uadeRowFrames } from './uadeLoadArgs';

/** Where the transport starts: song position (order index) and pattern row. */
export interface OpaqueUadeStart { songPos: number; row: number }

/**
 * Start the opaque UADE player (UADESynth: the song plays in UADE, the grid is UADE's scan) at the transport's position.
 *
 * Play and Play Pattern start at the cursor on every engine route. The opaque route does not go through the replayer
 * (startNativeEngines and its descriptor startAt never run), so the start frame is resolved here, from the row map the
 * opaque playhead follow reads (uadeRowFrames with opaque = true: the TFMX timing table, else a fixed
 * OPAQUE_UADE_FRAMES_PER_ROW per scanned row). It must be that map and not the engine's targetOf: a song that also
 * carries editable data (the_plague_game_end.cm) answers targetOf on the CIA tick clock, a different row numbering from
 * the one the follow shows. seek() makes the next play() fast-forward to the frame. Position 0 row 0, or a row the
 * song never reaches, plays from the top.
 */
export function playOpaqueUadeFrom(
  engine: Pick<UADEEngine, 'seek' | 'play'>,
  song: TrackerSong,
  start: OpaqueUadeStart,
  sampleRate: number,
): void {
  if (start.songPos > 0 || start.row > 0) {
    const { from } = uadeRowFrames(song, start.songPos, start.row, sampleRate, true);
    if (Number.isFinite(from) && from > 0) engine.seek(from);
  }
  engine.play();
}
