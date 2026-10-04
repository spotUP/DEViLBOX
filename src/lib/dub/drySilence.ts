/**
 * Is a dub move holding the dry signal down right now?
 *
 * `masterDrop` ramps every source's root gain to zero - the Tone buses and
 * each native engine's `output` GainNode. That GainNode is where
 * `SilenceDetector` listens for the song ending, so a drop held past the
 * detector's 5 s read as "song over" and the engine was faded out and
 * stopped under the performer's hand (ledger F28, 2026-10-04). Channel
 * mutes go through the mixer and are covered by its own predicate; this
 * flag is for the moves that silence below the mixer.
 *
 * A counter, not a boolean: two overlapping holds release independently.
 */
let holds = 0;

/** Mark the dry signal as held down by a move. Call the returned function once to release. */
export function beginDrySilence(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
  };
}

/** True while at least one move holds the dry signal down. */
export function drySilencedByDub(): boolean {
  return holds > 0;
}

/** Tests only. */
export function _resetDrySilence(): void {
  holds = 0;
}
