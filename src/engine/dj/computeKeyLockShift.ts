/**
 * Pure function — pitch/tempo decoupling math for DJ key lock.
 *
 * The DJ pitch fader scales `playbackRate` by a factor of 2^(semis/12).
 * On an `AudioBufferSourceNode` this couples pitch and tempo: both shift
 * together (vinyl-like chipmunk). Key Lock breaks the coupling by having
 * a SoundTouch insert compensate for the pitch change — applying
 * -semis of pitch shift undoes the playbackRate's pitch effect, leaving
 * only the tempo change.
 *
 * The live tracker path uses native replayer decoupling (not this function);
 * see DeckEngine.setPitch() for that path.
 *
 * Extracted as a pure function per CLAUDE.md regression policy: unit-testable
 * without an AudioContext so the tempo-/pitch-coupling invariant can be
 * locked down.
 */
export interface KeyLockShift {
  /** Native playbackRate to apply to AudioBufferSourceNode. Always 2^(s/12). */
  playbackRate: number;
  /** Pitch compensation in semitones to push into SoundTouch. 0 when key-lock
   *  is OFF (vinyl coupling), -semitones when ON (cancels playbackRate's
   *  pitch shift so only tempo remains audible). */
  pitchCompensate: number;
}

export function computeKeyLockShift(
  semitones: number,
  keyLockEnabled: boolean,
): KeyLockShift {
  const s = Number.isFinite(semitones) ? semitones : 0;
  const playbackRate = Math.pow(2, s / 12);
  // `|| 0` normalizes -0 to +0 so callers comparing with `===` / toBe don't
  // trip on JavaScript's signed-zero distinction.
  const pitchCompensate = keyLockEnabled ? (-s || 0) : 0;
  return { playbackRate, pitchCompensate };
}
