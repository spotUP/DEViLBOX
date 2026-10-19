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
 */

import * as Tone from 'tone';
import { getNormalizedVolume } from './factories/volumeNormalization';

interface ParamLike { value: number }

function paramLike(x: unknown): x is ParamLike {
  return typeof x === 'object' && x !== null && typeof (x as ParamLike).value === 'number';
}

/** Sets the level; returns false when the synth exposes neither surface. */
export function applyInstrumentOutputLevel(synth: unknown, synthType: string, volumeDb: number | undefined): boolean {
  if (typeof synth !== 'object' || synth === null) return false;
  const levelDb = getNormalizedVolume(synthType, volumeDb);
  const s = synth as { output?: { gain?: unknown }; volume?: unknown };
  const gain = s.output?.gain;
  if (paramLike(gain)) {
    gain.value = Tone.dbToGain(levelDb);
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
