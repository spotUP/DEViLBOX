/**
 * Moves that take a part away, and when there is not enough to take.
 *
 * A dub drop works because something REMAINS — the bass keeps the riddim while
 * the top is pulled, and the return tells you what left. Take everything and
 * you have silence, which is not a version of the tune; it is the tune
 * stopping.
 *
 * `arrangementIntelligence.planDrop` already holds that line for the moves it
 * plans, keeping a core whatever the profile evidence says. This is the same
 * principle one level up, for the moves that remove without going through a
 * plan: with fewer than two sounding parts there is nothing to drop AGAINST,
 * so those moves are barred outright.
 *
 * Found 2026-09-18 by scene G ("sparse arrangement, one channel"), whose
 * assertion — never remove the only part — had been passing vacuously: the
 * simulator's move selection was a deterministic argmax that never chose a
 * removing move at all. With selection matched to the live weighted roll,
 * `masterDrop` fired a DROP on the one-channel scene at bar 32 and the
 * assertion did its job.
 */

/**
 * Moves whose effect is subtractive.
 *
 * A filter sweep is NOT here: it is a drop in feel and takes nothing away
 * permanently, so it remains available on the sparsest arrangement — which is
 * exactly what a performer with one part to work with should reach for.
 */
export const REMOVING_MOVES: ReadonlySet<string> = new Set([
  'versionDrop',
  'riddimSection',
  'masterDrop',
  'channelMute',
]);

/** Below this many sounding parts, removal is silence rather than a version. */
export const MIN_PARTS_TO_REMOVE = 2;

export function isRemovingMove(moveId: string): boolean {
  return REMOVING_MOVES.has(moveId);
}

/**
 * True when `moveId` would take away more than the arrangement can spare.
 *
 * `soundingParts` is how many parts are actually playing, not how many
 * channels exist: a sixteen-channel module with one active part is still a
 * one-part arrangement.
 */
export function barredByArrangement(moveId: string, soundingParts: number): boolean {
  return isRemovingMove(moveId) && soundingParts < MIN_PARTS_TO_REMOVE;
}
