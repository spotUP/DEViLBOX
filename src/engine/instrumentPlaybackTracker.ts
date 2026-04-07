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

/**
 * Record a note attack for an instrument. Called by ToneEngine inside
 * triggerPolyNoteAttack / triggerNoteAttack.
 */
export function notifyInstrumentAttack(instrumentId: number, ctxTime: number): void {
  lastAttackByInstrument.set(instrumentId, ctxTime);
}

/**
 * Get the AudioContext time of the last note attack for an instrument,
 * or null if no attack has been recorded.
 */
export function getInstrumentLastAttack(instrumentId: number): number | null {
  return lastAttackByInstrument.get(instrumentId) ?? null;
}

/** Clear the last attack record for an instrument (e.g. when stopping). */
export function clearInstrumentAttack(instrumentId: number): void {
  lastAttackByInstrument.delete(instrumentId);
}
