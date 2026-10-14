/**
 * The DJ path's safety limiters (per deck, and the mixer's): one definition.
 * Owner decision 2026-10-11, "safety only": unity gain below the threshold,
 * the limiter only catches overs.
 *
 * A Web Audio DynamicsCompressorNode always applies an automatic make-up
 * gain: (1 / fullRangeGain)^0.6, where fullRangeGain is its static curve at
 * 0 dBFS. With a hard knee that is exactly threshold + (0 - threshold) / ratio
 * dB, so the make-up is a constant of the settings - +1.71 dB for the old
 * deck limiter (-3 dB, 20:1), +0.57 dB for the mixer's (-1 dB, 20:1) - and it
 * lifted every DJ deck above the tracker view's level. A fixed gain after the
 * compressor cancels it exactly (it is a property of the spec, not a
 * measurement), so below the threshold the stage is unity.
 *
 * Release 50 ms: a 10 ms release follows the waveform of a kick (an 80 Hz
 * cycle is 12.5 ms) and ripples it.
 */

import * as Tone from 'tone';

/** Threshold of every DJ safety limiter, dBFS. */
export const DJ_LIMITER_THRESHOLD_DB = -1;
/** Per-deck brick-wall threshold, dBFS. */
export const DECK_LIMITER_THRESHOLD_DB = DJ_LIMITER_THRESHOLD_DB;
const RATIO = 20;
const ATTACK_SEC = 0.001;
const RELEASE_SEC = 0.05;

/** The make-up gain a hard-knee DynamicsCompressorNode applies, dB (Web Audio spec). */
export function compressorMakeupDb(thresholdDb: number, ratio: number): number {
  const fullRangeDb = thresholdDb + (0 - thresholdDb) / ratio;
  return -0.6 * fullRangeDb;
}

/**
 * The safety limiter's settings - the DJ path's and the tracker master's
 * (ToneEngine.safetyLimiter): one spec. The tracker ran its own soft 4:1
 * (knee 6 dB) that let a hot preset through above full scale: Amiga Bass
 * Cannon peaked 1.06 at the destination, 460 clipped samples per million
 * (2026-10-14), where the DJ path held it.
 */
export const SAFETY_LIMITER = {
  thresholdDb: DJ_LIMITER_THRESHOLD_DB,
  ratio: RATIO,
  kneeDb: 0,
  attackSec: ATTACK_SEC,
  releaseSec: RELEASE_SEC,
} as const;

/** The linear gain that cancels a hard-knee compressor's automatic make-up (unity below the threshold). */
export function makeupCancelGain(thresholdDb: number, ratio: number): number {
  return 10 ** (-compressorMakeupDb(thresholdDb, ratio) / 20);
}

/**
 * The tracker master's safety limiter, as Tone nodes (ToneEngine wires and
 * retunes them): the same spec as createSafetyLimiter. Feed `compressor`,
 * take `makeupCancel`.
 */
export function createToneSafetyLimiter(): { compressor: Tone.Compressor; makeupCancel: Tone.Gain } {
  const compressor = new Tone.Compressor({
    threshold: SAFETY_LIMITER.thresholdDb,
    ratio: SAFETY_LIMITER.ratio,
    attack: SAFETY_LIMITER.attackSec,
    release: SAFETY_LIMITER.releaseSec,
    knee: SAFETY_LIMITER.kneeDb,
  });
  const makeupCancel = new Tone.Gain(makeupCancelGain(SAFETY_LIMITER.thresholdDb, SAFETY_LIMITER.ratio));
  compressor.connect(makeupCancel);
  return { compressor, makeupCancel };
}

export interface SafetyLimiter {
  /** Feed the limiter here. */
  readonly input: DynamicsCompressorNode;
  /** Unity below the threshold. */
  readonly output: GainNode;
  disconnect(): void;
}

/** A DJ safety limiter: brick-wall above DJ_LIMITER_THRESHOLD_DB, unity gain below it. */
export function createSafetyLimiter(ctx: BaseAudioContext): SafetyLimiter {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = DJ_LIMITER_THRESHOLD_DB;
  compressor.knee.value = 0;
  compressor.ratio.value = RATIO;
  compressor.attack.value = ATTACK_SEC;
  compressor.release.value = RELEASE_SEC;
  const makeupCancel = ctx.createGain();
  makeupCancel.gain.value = makeupCancelGain(DJ_LIMITER_THRESHOLD_DB, RATIO);
  compressor.connect(makeupCancel);
  return {
    input: compressor,
    output: makeupCancel,
    disconnect: () => {
      try { compressor.disconnect(); } catch { /* already disconnected */ }
      try { makeupCancel.disconnect(); } catch { /* already disconnected */ }
    },
  };
}
