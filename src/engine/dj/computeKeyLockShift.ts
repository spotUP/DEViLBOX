/**
 * Pure function — pitch/tempo decoupling math for DJ key lock.
 *
 * The DJ pitch fader scales `playbackRate` by a factor of 2^(semis/12).
 * On an `AudioBufferSourceNode` this couples pitch and tempo: both shift
 * together (vinyl-like chipmunk). Key Lock breaks the coupling by having
 * the Key Lock stretcher (DeckKeyLock) compensate for the pitch change — applying
 * -semis of pitch shift undoes the playbackRate's pitch effect, leaving
 * only the tempo change.
 *
 * Replayer-played songs (a tracker-mode DJ deck and the tracker view's pitch
 * slider) decouple natively instead: see computeTempoPitchSplit() below.
 *
 * Extracted as a pure function per CLAUDE.md regression policy: unit-testable
 * without an AudioContext so the tempo-/pitch-coupling invariant can be
 * locked down.
 */
export interface KeyLockShift {
  /** Native playbackRate to apply to AudioBufferSourceNode. Always 2^(s/12). */
  playbackRate: number;
  /** Pitch compensation in semitones to push into the Key Lock stretcher. 0 when key-lock
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

/**
 * How a pitch fader position splits into tempo and pitch for a song the
 * TrackerReplayer plays tick by tick. Lossless and zero latency: tempo is the
 * replayer's tick rate, pitch is the sample playback rate and the synth detune.
 *
 * Key Lock OFF: vinyl coupling, all three follow the fader.
 * Key Lock ON: tempo follows the fader, pitch stays at the song's key.
 *
 * The one decision shared by DeckEngine.setPitch() (tracker-mode decks) and
 * PatternScheduler.setGlobalPitchOffset() (the tracker view's pitch slider).
 */
export interface TempoPitchSplit {
  /** Tick-rate multiplier. Always 2^(s/12): the fader always moves tempo. */
  tempoMultiplier: number;
  /** Sample playback-rate multiplier. 1 under Key Lock. */
  pitchMultiplier: number;
  /** Synth detune in cents. 0 under Key Lock. */
  detuneCents: number;
}

export function computeTempoPitchSplit(
  semitones: number,
  keyLockEnabled: boolean,
): TempoPitchSplit {
  const s = Number.isFinite(semitones) ? semitones : 0;
  const tempoMultiplier = Math.pow(2, s / 12);
  return {
    tempoMultiplier,
    pitchMultiplier: keyLockEnabled ? 1 : tempoMultiplier,
    detuneCents: keyLockEnabled ? 0 : (s * 100 || 0),
  };
}
