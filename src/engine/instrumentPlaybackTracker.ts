/**
 * instrumentPlaybackTracker — module-level side channel that records the
 * AudioContext time of the most recent note attack per instrument.
 *
 * Used by the SampleEditor's playhead overlay so it can show a moving
 * playback marker when the user triggers notes via the test keyboard /
 * test piano / external MIDI, not just when they click the editor's
 * own Play button.
 *
 * Kept deliberately tiny: no subscription bus, no per-note bookkeeping —
 * one map keyed by instrumentId, value is the AudioContext time of the
 * last attack. Consumers poll via requestAnimationFrame.
 */

const lastAttackByInstrument = new Map<number, number>();
const lastReleaseByInstrument = new Map<number, number>();

/**
 * Record a note attack for an instrument. Called by ToneEngine inside
 * triggerPolyNoteAttack / triggerNoteAttack.
 */
export function notifyInstrumentAttack(instrumentId: number, ctxTime: number): void {
  lastAttackByInstrument.set(instrumentId, ctxTime);
  // Clear any prior release so the playhead knows a new note is active
  lastReleaseByInstrument.delete(instrumentId);
}

/**
 * Get the AudioContext time of the last note attack for an instrument,
 * or null if no attack has been recorded.
 */
export function getInstrumentLastAttack(instrumentId: number): number | null {
  return lastAttackByInstrument.get(instrumentId) ?? null;
}

/**
 * Record a note release for an instrument. Called by ToneEngine inside
 * triggerNoteRelease / triggerPolyNoteRelease.
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
