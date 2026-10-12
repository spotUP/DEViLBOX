/**
 * True re-cue on a deck (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 11, 18; ledger SCR-P3.4; audit SA-M3).
 *
 * A gesture that returns to its anchor needs the deck's play position back on
 * the anchor. That is only inaudible while the gesture's fader window is
 * CLOSED: then the audio player is sought (audio mode) or the replayer is
 * jumped to the row (tracker mode, `cue`; `suppressNotes` stays as it is) and
 * the scratch ring is reset. While the window is open the listener hears the
 * deck, so nothing is touched - not the deck, not the ring - and the caller
 * waits for the gesture's next closed window (`waiting`). A tracker song with
 * no time index cannot be cued: nothing is touched (`unavailable`).
 */

export interface DeckRecueTarget {
  readonly playbackMode: 'audio' | 'tracker';
  /** The scratch fader window is closed: the listener does not hear the deck now. */
  isFaderWindowClosed(): boolean;
  /** Audio mode: seek the player (seconds). */
  seekAudio(sec: number): void;
  /** Tracker mode: jump the replayer to the row at `sec`; false when the song has no time index. */
  cueTracker(sec: number): boolean;
  /** Reset the capture ring so a backward stroke reads from the new position. */
  resetRing(): void;
}

export type DeckRecueMode = 'audio' | 'tracker' | 'waiting' | 'unavailable';

export interface DeckRecueResult {
  /** The deck itself now sits on the anchor. */
  recued: boolean;
  mode: DeckRecueMode;
  /** The planner may count on the strokes after this point starting at the anchor. */
  returnsToAnchor: boolean;
  reason?: string;
}

/** Reachability sentinel (SCR-P3.4). */
export const deckRecueStats = { recues: 0, waits: 0, unavailable: 0 };

export function recueDeck(target: DeckRecueTarget, anchorSec: number): DeckRecueResult {
  if (!target.isFaderWindowClosed()) {
    deckRecueStats.waits++;
    return { recued: false, mode: 'waiting', returnsToAnchor: false, reason: 'the fader window is open: the listener hears the deck; re-cue in the next closed window' };
  }
  if (target.playbackMode === 'audio') {
    target.seekAudio(anchorSec);
    target.resetRing();
    deckRecueStats.recues++;
    return { recued: true, mode: 'audio', returnsToAnchor: true };
  }
  if (!target.cueTracker(anchorSec)) {
    deckRecueStats.unavailable++;
    return { recued: false, mode: 'unavailable', returnsToAnchor: false, reason: 'the tracker song has no time index to cue by' };
  }
  target.resetRing();
  deckRecueStats.recues++;
  return { recued: true, mode: 'tracker', returnsToAnchor: true };
}
