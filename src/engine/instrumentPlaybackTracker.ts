/**
 * instrumentPlaybackTracker — module-level side channel that records the
 * AudioContext time of the most recent note attack per instrument, and the
 * speed that note plays the sample at.
 *
 * Fed by the keyboard / MIDI paths (ToneEngine.triggerPolyNoteAttack) and by
 * the song itself (songInstrumentTriggers, one row hook for every engine
 * that moves the play row). Read by the SampleEditor's playhead overlay
 * (polled per animation frame) and by the instrument lists, which subscribe
 * and flash the rows of instruments the song triggers.
 */

interface Attack { time: number; rate: number }

const lastAttackByInstrument = new Map<number, Attack>();
const lastReleaseByInstrument = new Map<number, number>();
const listeners = new Set<(instrumentId: number) => void>();

/**
 * Record a note attack for an instrument. `rate` is the speed the note plays
 * the sample at (1 = recorded speed); omitted, the editor assumes 1.
 */
export function notifyInstrumentAttack(instrumentId: number, ctxTime: number, rate = 1): void {
  lastAttackByInstrument.set(instrumentId, { time: ctxTime, rate });
  // Clear any prior release so the playhead knows a new note is active
  lastReleaseByInstrument.delete(instrumentId);
  for (const l of listeners) l(instrumentId);
}

/**
 * Get the AudioContext time of the last note attack for an instrument,
 * or null if no attack has been recorded.
 */
export function getInstrumentLastAttack(instrumentId: number): number | null {
  return lastAttackByInstrument.get(instrumentId)?.time ?? null;
}

/** The playback speed of the last attack (1 when none was given). */
export function getInstrumentLastAttackRate(instrumentId: number): number {
  return lastAttackByInstrument.get(instrumentId)?.rate ?? 1;
}

/**
 * Record a note release for an instrument. Called by ToneEngine inside
 * triggerNoteRelease / triggerPolyNoteRelease, and on a song's note-off.
 */
export function notifyInstrumentRelease(instrumentId: number): void {
  lastReleaseByInstrument.set(instrumentId, Date.now());
}

/**
 * Returns true if the instrument has been released since the last attack.
 */
export function isInstrumentReleased(instrumentId: number): boolean {
  return lastReleaseByInstrument.has(instrumentId);
}

/** Clear the last attack record for an instrument (e.g. when stopping). */
export function clearInstrumentAttack(instrumentId: number): void {
  lastAttackByInstrument.delete(instrumentId);
  lastReleaseByInstrument.delete(instrumentId);
}

/** Be told of every attack. Returns the unsubscribe. */
export function subscribeInstrumentAttacks(listener: (instrumentId: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
