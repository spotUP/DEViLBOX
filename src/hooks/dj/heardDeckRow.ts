/**
 * The pattern row a DJ deck's listener hears at a frame's time - the one
 * derivation the 20 Hz store poll (useDeckStateSync) and the per-frame
 * pattern display share.
 *
 * Audio mode (pre-rendered modules): the heard position, extrapolated from the
 * deck's clock anchor to the frame, mapped through the song time index.
 * Tracker mode: the replayer's display ring at the context's current time
 * (rows are queued at heard times); the scheduler's counters only when the
 * ring has nothing yet.
 */

import { positionAtFrame, type ClockAnchor } from '@/engine/audioLatency';
import type { DeckEngine } from '@/engine/dj/DeckEngine';

export interface DeckRow {
  songPos: number;
  pattPos: number;
}

type RowSource = Pick<DeckEngine, 'playbackMode' | 'getPositionAtTime' | 'getHeardTrackerState'> & {
  replayer: Pick<DeckEngine['replayer'], 'getSongPos' | 'getPattPos'>;
};

export function heardDeckRow(deck: RowSource, anchor: ClockAnchor, frameMs: number): DeckRow | null {
  if (deck.playbackMode === 'audio') {
    return deck.getPositionAtTime(positionAtFrame(anchor, frameMs) * 1000);
  }
  return trackerRowFrom(deck.getHeardTrackerState(), deck.replayer);
}

/** Tracker mode: the display ring's heard row, else the scheduler's counters. */
export function trackerRowFrom(
  heard: DeckRow | null,
  replayer: Pick<DeckEngine['replayer'], 'getSongPos' | 'getPattPos'>,
): DeckRow {
  return heard
    ? { songPos: heard.songPos, pattPos: heard.pattPos }
    : { songPos: replayer.getSongPos(), pattPos: replayer.getPattPos() };
}
