import { describe, it, expect } from 'vitest';
import { computeKeyLockShift } from '../computeKeyLockShift';

/**
 * Pitch/tempo coupling invariants for DJ Key Lock.
 *
 * The decoupling math is the single pure layer between the pitch fader and
 * the audio graph (native playbackRate + SoundTouch compensation). Breaking
 * it silently corrupts key-lock behaviour — the regression this pins down
 * is: "moving the pitch fader with Key Lock ON changes the track's musical
 * key, even though the UI says it shouldn't." Previously caused by
 * Tone.PitchShift's granular delay buffer (removed in commit bff38c6f3).
 * SoundTouch port is the replacement; this math drives the compensation.
 */
describe('computeKeyLockShift', () => {
  it('Key Lock OFF: pitch shift is zero (vinyl coupling)', () => {
    const { pitchCompensate } = computeKeyLockShift(5, false);
    expect(pitchCompensate).toBe(0);

    const atNeg = computeKeyLockShift(-3, false);
    expect(atNeg.pitchCompensate).toBe(0);
  });

  it('Key Lock ON: pitch shift cancels playbackRate pitch (tempo-only audible change)', () => {
    // +4 semitones fader → playbackRate > 1 (faster + higher). Compensation
    // of -4 semitones in SoundTouch drops the pitch back to neutral.
    const plus = computeKeyLockShift(4, true);
    expect(plus.pitchCompensate).toBe(-4);

    // -6 fader → slower + lower pitch. SoundTouch pushes +6 to restore key.
    const minus = computeKeyLockShift(-6, true);
    expect(minus.pitchCompensate).toBe(6);
  });

  it('playbackRate is 2^(semis/12) regardless of key-lock state', () => {
    // Zero shift = unity rate
    expect(computeKeyLockShift(0, false).playbackRate).toBe(1);
    expect(computeKeyLockShift(0, true).playbackRate).toBe(1);

    // One octave up = 2x rate (both modes)
    expect(computeKeyLockShift(12, false).playbackRate).toBeCloseTo(2, 6);
    expect(computeKeyLockShift(12, true).playbackRate).toBeCloseTo(2, 6);

    // One octave down = 0.5x rate
    expect(computeKeyLockShift(-12, false).playbackRate).toBeCloseTo(0.5, 6);
    expect(computeKeyLockShift(-12, true).playbackRate).toBeCloseTo(0.5, 6);
  });

  it('treats non-finite input as zero (guards against NaN fader pokes)', () => {
    const nan = computeKeyLockShift(Number.NaN, true);
    expect(nan.playbackRate).toBe(1);
    expect(nan.pitchCompensate).toBe(0);

    const inf = computeKeyLockShift(Number.POSITIVE_INFINITY, false);
    expect(inf.playbackRate).toBe(1);
    expect(inf.pitchCompensate).toBe(0);
  });

  it('regression — SoundTouch compensation ALWAYS cancels playbackRate to neutral when key-lock is ON', () => {
    // Property: for any semitone value in the DJ-reachable range (-16..+16),
    // the net audible pitch (playbackRate's pitch * SoundTouch's pitch) must
    // be 1.0 when Key Lock is ON. This is the "tempo-only change" contract.
    //
    // Equivalent check: playbackRate_pitch_factor = 2^(s/12),
    //                   soundtouch_pitch_factor   = 2^(compensate/12),
    //                   product must be 1.0 within float ε.
    for (let s = -16; s <= 16; s++) {
      const { playbackRate, pitchCompensate } = computeKeyLockShift(s, true);
      const netPitchFactor = playbackRate * Math.pow(2, pitchCompensate / 12);
      expect(netPitchFactor).toBeCloseTo(1, 6);
    }
  });

  it('regression — Key Lock OFF does NOT compensate (vinyl behaviour is preserved)', () => {
    // Opposite property: with Key Lock OFF, SoundTouch compensation is 0
    // so the net pitch factor IS the playbackRate factor (vinyl coupling).
    for (let s of [-12, -6, -1, 0, 1, 6, 12]) {
      const { playbackRate, pitchCompensate } = computeKeyLockShift(s, false);
      expect(pitchCompensate).toBe(0);
      const netPitchFactor = playbackRate * Math.pow(2, pitchCompensate / 12);
      expect(netPitchFactor).toBeCloseTo(playbackRate, 6);
    }
  });
});
