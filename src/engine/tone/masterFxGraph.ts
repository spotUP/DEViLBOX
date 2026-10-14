/**
 * The master effects graph: ONE wiring of a master FX chain for every view.
 *
 * The tracker (MasterEffectsChain) and the DJ mixer (DJMixerEngine) each
 * wired the same preset their own way. The tracker put each effect's level
 * calibration (effectGainCompensation) and the preset's make-up gain
 * (gainCompensationDb) in the chain; the DJ mixer left both out and instead
 * split the bass off bass-locked effects. One preset played two different
 * chains: Amiga Bass Cannon ran about 6 dB hotter in the DJ view than in the
 * tracker (owner 2026-10-14: "awesome in the DJ view, crackly and no bass in
 * the tracker"). Both views now assemble their chain here, from nodes they
 * created themselves (creation stays with the caller: each guards its own
 * async rebuild).
 *
 *   input ─┬─> [bass lock: high-pass 150 Hz] ─> fx[0] ─> comp? ─> ... ─> fx[n] ─> comp? ─┬─> presetComp ─> output
 *          └─> [bass lock: low-pass 150 Hz] ──────────────────────────────────────────────┘
 *
 * Without a bass-locked effect the split is absent and the whole spectrum runs
 * through the effects.
 */
import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { connectAudio } from './connectAudio';
import { getEffectGainCompensation } from '../factories/effectGainCompensation';
import { applyWetGain } from '../factories/EffectFactory';
import { effectiveBassLock } from '../dj/bassLockDefaults';

/** Crossover of the bass lock, Hz: below it a bass-locked chain passes the signal dry. */
export const BASS_LOCK_CROSSOVER_HZ = 150;

export interface MasterFxGraph {
  /** Feed the chain here. */
  readonly input: Tone.Gain;
  /** The chain's output. */
  readonly output: Tone.Gain;
  /** Every node in signal order, effects and the gains between them (the bass-lock split excluded). */
  readonly chain: Tone.ToneAudioNode[];
  /** Whether the bass bypasses the effects (a bass-locked effect is in the chain). */
  readonly bassLocked: boolean;
  /** Every node the graph created (not the effects): for disposal. */
  readonly owned: Tone.ToneAudioNode[];
}

/**
 * Wire `effects` (created by the caller, in order) into one master chain with
 * each effect's level calibration and the preset's make-up gain.
 */
export function assembleMasterFxGraph(
  effects: ReadonlyArray<{ config: EffectConfig; node: Tone.ToneAudioNode }>,
  presetCompDb: number,
): MasterFxGraph {
  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);
  const owned: Tone.ToneAudioNode[] = [input, output];
  const chain: Tone.ToneAudioNode[] = [];

  for (const { config, node } of effects) {
    chain.push(node);
    // The level correction goes on the effect's WET signal when it has one: a
    // gain after the effect scaled the dry signal as well, so a preset running
    // an effect below 100 % wet had its dry cut too - Vox Amp Crunch (WAMVoxAmp,
    // -13.9 dB, wet 40) played its 60 % dry 13.9 dB down: "low volume and very
    // thin all bass gone" (2026-09-30). After the effect only when it has no
    // separate wet path (Buzz machines; mixes done inside the worklet).
    const compLinear = getEffectGainCompensation(config.type);
    if (compLinear !== 1 && applyWetGain(node, compLinear) === 'none') {
      const compGain = new Tone.Gain(compLinear);
      owned.push(compGain);
      chain.push(compGain);
    }
  }

  // Preset-level make-up (measured with a full-spectrum signal): the level of
  // the whole chain, on top of the per-effect corrections.
  if (presetCompDb !== 0) {
    const presetComp = new Tone.Gain(Math.pow(10, presetCompDb / 20));
    owned.push(presetComp);
    connectAudio(presetComp, output);
    chain.push(presetComp);
  }
  const tail: Tone.ToneAudioNode = presetCompDb !== 0 ? chain[chain.length - 1] : output;

  const bassLocked = effects.length > 0 && effects.some(({ config }) => effectiveBassLock(config.type, config.bassLock));
  const fxEnd = presetCompDb !== 0 ? chain.length - 1 : chain.length; // index past the last fx/comp node

  if (fxEnd === 0) {
    // No effects: straight through (the make-up gain, if any).
    connectAudio(input, tail);
  } else {
    let head: Tone.ToneAudioNode = input;
    if (bassLocked) {
      // Bass lock: the low end bypasses the effects, dry; the effects get the rest.
      const lowPass = new Tone.Filter({ type: 'lowpass', frequency: BASS_LOCK_CROSSOVER_HZ, Q: Math.SQRT1_2, rolloff: -12 });
      const highPass = new Tone.Filter({ type: 'highpass', frequency: BASS_LOCK_CROSSOVER_HZ, Q: Math.SQRT1_2, rolloff: -12 });
      owned.push(lowPass, highPass);
      connectAudio(input, lowPass);
      connectAudio(lowPass, tail);
      connectAudio(input, highPass);
      head = highPass;
    }
    connectAudio(head, chain[0]);
    for (let i = 0; i < fxEnd - 1; i++) connectAudio(chain[i], chain[i + 1]);
    connectAudio(chain[fxEnd - 1], tail);
  }

  return { input, output, chain, bassLocked, owned };
}
