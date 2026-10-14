/**
 * How far along the record the tonearm sits (0 = outer groove, 1 = run-out
 * groove), for any deck. One definition for every turntable view.
 *
 * Audio decks: heard position over the track duration. Tracker decks have no
 * duration in the store (only audio decks write durationMs), so they show
 * the song's place in its order list. Never a made-up default duration.
 */
export interface TonearmDeck {
  playbackMode: 'audio' | 'tracker';
  durationMs: number;
  songPos: number;
  totalPositions: number;
}

export function tonearmProgress(deck: TonearmDeck, heardPositionSec: number): number {
  let progress = 0;
  if (deck.durationMs > 0) progress = heardPositionSec / (deck.durationMs / 1000);
  else if (deck.playbackMode === 'tracker' && deck.totalPositions > 0) progress = deck.songPos / deck.totalPositions;
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}
