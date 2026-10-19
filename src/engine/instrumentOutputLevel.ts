/**
 * The one place that writes an instrument's output level.
 *
 * InstrumentFactory calls applyInstrumentOutputLevel right after a registry
 * synth is created; ToneEngine.setInstrumentVolume calls setInstrumentVolumeOn
 * when the store changes an instrument's volume. Both use getNormalizedVolume,
 * so a volume update lands on exactly the level a fresh instance would get.
 *
 * Output surfaces, in order of preference:
 *   1. a native GainNode at `output.gain` (linear), written as dbToGain(level);
 *   2. a Tone.js `volume` Param (dB), written as the level itself. The Tone.js
 *      synth family, Sampler, Player, PolySynth and the TR808/TR909 wrappers
 *      (which expose only `volume`) all land here.
 *
 * The output gain is also the surface ToneEngine fades on stop (releaseAll)
 * and un-sticks when it finds it at 0. Those paths must come back to the level
 * applied here, never to unity: every write of `output.gain` outside this
 * module goes through restoreInstrumentOutputGain, which reads the level
 * remembered per instance by applyInstrumentOutputLevel.
 */

import * as Tone from 'tone';
import { getNormalizedVolume } from './factories/volumeNormalization';

interface ParamLike { value: number }

/** The parts of a native AudioParam the fade and restore paths touch. */
export interface OutputGainParam extends ParamLike {
  cancelScheduledValues(startTime: number): void;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
}

function paramLike(x: unknown): x is ParamLike {
  return typeof x === 'object' && x !== null && typeof (x as ParamLike).value === 'number';
}

/** The linear output gain last applied to each instance; an instance never applied is at unity. */
const appliedOutputGain = new WeakMap<object, number>();

/** The linear level applyInstrumentOutputLevel last wrote to this instance's output gain (1 when never applied). */
export function instrumentOutputGain(synth: unknown): number {
  if (typeof synth !== 'object' || synth === null) return 1;
  return appliedOutputGain.get(synth) ?? 1;
}

/** Puts an instance's output gain back at its applied level, dropping any pending fade. */
export function restoreInstrumentOutputGain(synth: unknown, gain: OutputGainParam): number {
  const level = instrumentOutputGain(synth);
  gain.cancelScheduledValues(0);
  gain.value = level;
  return level;
}

/**
 * Stop-time fade for a DevilboxSynth: ramp the output gain to silence over
 * fadeSec, then after restoreMs put it back at the instrument's level so the
 * next play starts at the configured volume. Returns the restore timer so the
 * caller can cancel it when a second release lands before it fires.
 */
export function fadeOutThenRestoreInstrumentOutput(
  synth: unknown,
  gain: OutputGainParam,
  now: number,
  onRestored: () => void,
  fadeSec = 0.05,
  restoreMs = 100,
): ReturnType<typeof setTimeout> {
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value || instrumentOutputGain(synth), now);
  gain.linearRampToValueAtTime(0, now + fadeSec);
  return setTimeout(() => {
    onRestored();
    try {
      restoreInstrumentOutputGain(synth, gain);
    } catch {
      // Instrument may be disposed
    }
  }, restoreMs);
}

/** Sets the level; returns false when the synth exposes neither surface. */
export function applyInstrumentOutputLevel(synth: unknown, synthType: string, volumeDb: number | undefined): boolean {
  if (typeof synth !== 'object' || synth === null) return false;
  const levelDb = getNormalizedVolume(synthType, volumeDb);
  const s = synth as { output?: { gain?: unknown }; volume?: unknown };
  const gain = s.output?.gain;
  if (paramLike(gain)) {
    const linear = Tone.dbToGain(levelDb);
    gain.value = linear;
    appliedOutputGain.set(synth, linear);
    return true;
  }
  if (paramLike(s.volume)) {
    s.volume.value = levelDb;
    return true;
  }
  return false;
}

/** Applies the level to every live instance of an instrument (shared and per-channel keys). */
export function setInstrumentVolumeOn(
  instruments: Map<number, unknown>,
  instrumentId: number,
  synthType: string,
  volumeDb: number | undefined,
): number {
  let applied = 0;
  instruments.forEach((synth, key) => {
    if ((key >>> 16) !== instrumentId) return;
    if (applyInstrumentOutputLevel(synth, synthType, volumeDb)) applied++;
  });
  return applied;
}
