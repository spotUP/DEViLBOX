/**
 * Scratch bus (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 42, 43; D4; ledger SCR-P2.6, SCR-P2.7).
 *
 * The reference `tools/scratch_routine.py scratch_channel()` chain, built
 * from Web Audio primitives (no DSP framework, section 42):
 *
 *   input -> HP 160 Hz (4th order) -> presence (+0.22 of the 1.5-3 kHz band)
 *         -> tanh(x x (1 + 3 x 0.09)) -> tape delay 0.20 s, feedback 0.32,
 *            mix 0.14 -> room 0.28 -> LP 5 kHz (4th order) -> 0.75 headroom
 *         -> level -> destination (the DJ mixer's samplerInput: bypasses the
 *            crossfader, like the sampler and the mic)
 *
 * `ambience` 0..1 scales the delay mix (0..0.14) and the room (0..0.28)
 * together (section 43: ordinary scratches dry or lightly wet, features
 * moderate, the final event may carry the full tail).
 */

import { createReverbIR } from '../reverbIR';
import type { ScratchRole } from './scratchTypes';

/** The reference chain's numbers (section 42; `scratch_channel` defaults). */
export const SCRATCH_BUS = {
  hpHz: 160,
  /** Presence band the reference adds 0.22 of (a peaking filter at its geometric centre). */
  presenceBand: [1500, 3000] as readonly [number, number],
  presenceAdd: 0.22,
  drive: 0.09,
  delaySec: 0.20,
  feedback: 0.32,
  delayMix: 0.14,
  /** Reference `damp=0.5` in the tape loop: a 4 kHz lowpass in the feedback path. */
  delayDampHz: 4000,
  reverbMix: 0.28,
  reverbSec: 0.6,
  /** Room time constant 0.15 s (exp(-t x 6.7)). */
  reverbDecayHz: 6.7,
  lpHz: 5000,
  headroom: 0.75,
} as const;

/** Butterworth 4th order as two biquads (linear Q). The Web Audio lowpass /
 *  highpass `Q` is in dB: 20 log10(Q) is what the node takes. */
const BUTTERWORTH_4 = [0.5412, 1.3066] as const;
const qDb = (q: number) => 20 * Math.log10(q);

export interface ScratchBus {
  readonly input: GainNode;
  readonly output: GainNode;
  /** 0..1 output level (an AudioParam for ramps). */
  readonly level: AudioParam;
  readonly ambience: number;
  setAmbience(amount: number, rampSec?: number): void;
  dispose(): void;
}

function tanhCurve(drive: number, points = 4096): Float32Array<ArrayBuffer> {
  const k = 1 + 3 * drive;
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k);
  }
  return curve;
}

export function createScratchBus(ctx: BaseAudioContext, destination: AudioNode, opts: { reverbIR?: AudioBuffer } = {}): ScratchBus {
  const input = ctx.createGain();

  const hp = BUTTERWORTH_4.map((q) => {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = SCRATCH_BUS.hpHz; f.Q.value = qDb(q);
    return f;
  });
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  const [lo, hi] = SCRATCH_BUS.presenceBand;
  presence.frequency.value = Math.sqrt(lo * hi);
  presence.Q.value = presence.frequency.value / (hi - lo);
  presence.gain.value = 20 * Math.log10(1 + SCRATCH_BUS.presenceAdd);

  const shaper = ctx.createWaveShaper();
  shaper.curve = tanhCurve(SCRATCH_BUS.drive);
  shaper.oversample = '2x';

  // Delay stage: dry x (1 - m) + delayed x m, tape loop with damping.
  const delayDry = ctx.createGain();
  const delayWet = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = SCRATCH_BUS.delaySec;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass'; damp.frequency.value = SCRATCH_BUS.delayDampHz; damp.Q.value = qDb(0.7071);
  const feedback = ctx.createGain();
  feedback.gain.value = SCRATCH_BUS.feedback;
  const delaySum = ctx.createGain();

  // Room stage: dry x (1 - r) + convolved x r.
  const roomDry = ctx.createGain();
  const roomWet = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = opts.reverbIR ?? createReverbIR(ctx, SCRATCH_BUS.reverbSec, SCRATCH_BUS.reverbDecayHz);
  const roomSum = ctx.createGain();

  const lp = BUTTERWORTH_4.map((q) => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = SCRATCH_BUS.lpHz; f.Q.value = qDb(q);
    return f;
  });
  const headroom = ctx.createGain();
  headroom.gain.value = SCRATCH_BUS.headroom;
  const output = ctx.createGain();
  output.gain.value = 1;

  input.connect(hp[0]!); hp[0]!.connect(hp[1]!); hp[1]!.connect(presence); presence.connect(shaper);
  shaper.connect(delayDry); delayDry.connect(delaySum);
  shaper.connect(delay); delay.connect(damp); damp.connect(feedback); feedback.connect(delay);
  delay.connect(delayWet); delayWet.connect(delaySum);
  delaySum.connect(roomDry); roomDry.connect(roomSum);
  delaySum.connect(convolver); convolver.connect(roomWet); roomWet.connect(roomSum);
  roomSum.connect(lp[0]!); lp[0]!.connect(lp[1]!); lp[1]!.connect(headroom); headroom.connect(output);
  output.connect(destination);

  let ambience = 0;
  const apply = (amount: number, rampSec: number) => {
    const m = SCRATCH_BUS.delayMix * amount;
    const r = SCRATCH_BUS.reverbMix * amount;
    const now = ctx.currentTime;
    for (const [param, value] of [[delayDry.gain, 1 - m], [delayWet.gain, m], [roomDry.gain, 1 - r], [roomWet.gain, r]] as const) {
      param.cancelScheduledValues(now);
      if (rampSec > 0) { param.setValueAtTime(param.value, now); param.linearRampToValueAtTime(value, now + rampSec); }
      else param.setValueAtTime(value, now);
    }
  };
  apply(0, 0);

  const nodes: AudioNode[] = [input, ...hp, presence, shaper, delayDry, delayWet, delay, damp, feedback, delaySum, roomDry, roomWet, convolver, roomSum, ...lp, headroom, output];

  return {
    input,
    output,
    level: output.gain,
    get ambience() { return ambience; },
    setAmbience(amount: number, rampSec = 0.02) {
      ambience = Math.max(0, Math.min(1, amount));
      apply(ambience, rampSec);
    },
    dispose() {
      for (const n of nodes) { try { n.disconnect(); } catch { /* already */ } }
    },
  };
}

/** Section 43 ambience by role: ordinary dry / lightly wet, feature moderate, final event the full tail. */
export const AMBIENCE = { ordinary: 0.15, transition: 0.2, feature: 0.5, final: 1.0 } as const;

export function ambienceFor(role: ScratchRole, isFinal = false): number {
  if (isFinal) return AMBIENCE.final;
  if (role === 'FEATURE') return AMBIENCE.feature;
  if (role === 'TRANSITION' || role === 'OUTRO') return AMBIENCE.transition;
  return AMBIENCE.ordinary;
}
