/**
 * bassLockDefaults — per-FX default for the DJ master-chain bass-lock
 * crossover.
 *
 * When a master FX is bass-locked, the ~150 Hz crossover splits the
 * signal so the low end bypasses the effect entirely. This keeps the
 * bassline tight during live DJ sets where reverb / delay / phaser
 * would otherwise smear the sub. Effects that depend on full-spectrum
 * input (distortion, compression, EQ, filters, tape saturation) should
 * leave it OFF.
 *
 * Mid-2026-04 the flag moved from the single hard-coded
 * `BASS_LOCK_TYPES` set in `DJMixerEngine.ts` to a per-FX opt-in on
 * `EffectConfig.bassLock`. This module supplies the defaults used when
 * a config predates the flag or the user hasn't overridden it yet.
 */

import type { AudioEffectType } from '@typedefs/instrument';

/** Effects that should bass-lock by default (time-based + modulation) */
const BASS_LOCK_ON_BY_DEFAULT: ReadonlySet<string> = new Set([
  // Delays / echoes — smear the low end into mud
  'Delay', 'FeedbackDelay', 'PingPongDelay',
  'SpaceEcho', 'SpaceyDelayer', 'RETapeEcho', 'TapeDelay',
  'AmbientDelay',
  // Reverbs — same, plus keep the sub out of the tail
  'Reverb', 'JCReverb', 'Freeverb',
  'MVerb', 'MadProfessorPlate', 'DattorroPlate',
  'SpringReverb', 'ShimmerReverb',
  'Aelapse',
  // Modulation — phasers/choruses sound muddy on bass
  'Phaser', 'Chorus', 'Vibrato', 'BiPhase',
  // Granular / freeze — same rationale as reverb
  'GranularFreeze',
]);

/**
 * Default `bassLock` value for a given effect type. Used when
 * `EffectConfig.bassLock` is undefined (new effect, or an old config
 * from before the per-FX flag shipped).
 */
export function getDefaultBassLock(type: AudioEffectType | string): boolean {
  return BASS_LOCK_ON_BY_DEFAULT.has(type);
}

/**
 * Resolve the effective bass-lock state for a config — honours explicit
 * overrides, falls back to the per-type default.
 */
export function effectiveBassLock(
  type: AudioEffectType | string,
  bassLock: boolean | undefined,
): boolean {
  return bassLock ?? getDefaultBassLock(type);
}
