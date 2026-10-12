/**
 * Scratch bus (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 42, 43; D4; ledger SCR-P2.6, SCR-P2.7).
 *
 * The reference `tools/scratch_routine.py scratch_channel()` chain, built
 * from Web Audio primitives (no DSP framework, section 42):
 *
 *   input -> HP 160 Hz (4th order) -> presence (+0.22 of the 1.5-3 kHz band)
 *         -> tanh(x x (1 + 3 x 0.10)) -> tape delay 0.20 s, feedback 0.32,
 *            mix 0.16 -> room 0.30 -> LP 5 kHz (4th order) -> 0.75 headroom
 *         -> level -> destination (the DJ mixer's samplerInput: bypasses the
 *            crossfader, like the sampler and the mic)
 *
 * The channel runs wet (owner 2026-10-12): room 0.30 and delay 0.16 always; `ambience` 0..1
 * lengthens the echo tail (delay mix up to 0.35) for features and the final event (section 43).
 * The room is the reference's own (`scratchRoom.ts`); a velocity tone sits before the band.
 */

import { scratchRoomResponse } from './scratchRoom';
import type { ScratchRole } from './scratchTypes';

/** The reference chain's numbers (section 42; `scratch_channel` defaults). */
/**
 * The wet scratch channel (owner 2026-10-12 "too dry"; Up Rough `scratch_dj.py:297`: the DJ render
 * calls `scratch_channel(room=0.3, delay_mix=0.16, drive=0.10)` - "the channel runs wet").
 */
export const SCRATCH_BUS = {
  hpHz: 160,
  /** Presence band the reference adds 0.22 of (a peaking filter at its geometric centre). */
  presenceBand: [1500, 3000] as readonly [number, number],
  presenceAdd: 0.22,
  drive: 0.10,
  delaySec: 0.20,
  feedback: 0.32,
  delayMix: 0.16,
  /** The final event's tail (reference "echo" gesture fx, scratch.py:176): delay mix 0.35. */
  tailDelayMix: 0.35,
  /** Reference tape loop (synth_dsp `_echo_line`, kind tape): a one-pole of coefficient 0.5 at the
   *  reference's 22,050 Hz render (2.43 kHz), then tanh(1.2 x) in the feedback path. */
  delayDampHz: 2430,
  delaySat: 1.2,
  reverbMix: 0.30,
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
  /**
   * The stroke's tone by velocity (reference `render_gesture`): under 0.5 low-passed at
   * 2500 + 6000 v Hz, over 0.85 with 0.15 of a 3 kHz high-pass added; now or at context time `at`.
   */
  setTone(velocity: number, at?: number): void;
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

/** Reachability sentinel: scratch buses built (record voices and deck sends). */
export const scratchBusStats = { created: 0, wetOnly: 0 };

/** The scratch room: the reference wet channel's 0.6 plate + 0.4 dark room (`scratchRoomResponse`),
 *  the one impulse response for the scratch bus AND the deck's own scratch send (SA-m2). */
export function createScratchRoomIR(ctx: BaseAudioContext): AudioBuffer {
  const r = scratchRoomResponse(ctx.sampleRate);
  const ir = ctx.createBuffer(2, r.length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < r.length; i++) d[i] = r[i]!;
  }
  return ir;
}

/**
 * `wetOnly`: the bus's wet part alone (the tape delay's echoes and the room), for a deck scratch:
 * the deck stays the dry signal, its scratch send gets the scratch channel's space.
 */
export function createScratchBus(ctx: BaseAudioContext, destination: AudioNode, opts: { reverbIR?: AudioBuffer; wetOnly?: boolean; room?: number; delayMix?: number } = {}): ScratchBus {
  scratchBusStats.created++;
  if (opts.wetOnly) scratchBusStats.wetOnly++;
  const wetOnly = !!opts.wetOnly;
  const input = ctx.createGain();
  // velocity tone (reference render_gesture): a low-pass that opens with the hand, a 3 kHz edge on hard cuts
  const velLp = ctx.createBiquadFilter();
  velLp.type = 'lowpass'; velLp.frequency.value = 20000; velLp.Q.value = qDb(0.7071);
  const edge = ctx.createBiquadFilter();
  edge.type = 'highpass'; edge.frequency.value = 3000; edge.Q.value = qDb(0.7071);
  const edgeGain = ctx.createGain();
  edgeGain.gain.value = 0;
  const toned = ctx.createGain();

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
  // the echo line (reference `_echo_line`): y = x + fb x tanh(1.2 x onePole(y delayed));
  // the stage is (1 - m) x + m y = x + m (y - x): the echoes at m x fb
  const dampA = Math.exp(-2 * Math.PI * SCRATCH_BUS.delayDampHz / ctx.sampleRate);
  const damp = ctx.createIIRFilter([1 - dampA], [1, -dampA]);
  const loopSat = ctx.createWaveShaper();
  loopSat.curve = tanhCurve((SCRATCH_BUS.delaySat - 1) / 3);
  const feedback = ctx.createGain();
  feedback.gain.value = SCRATCH_BUS.feedback;
  const loopSum = ctx.createGain();
  const delaySum = ctx.createGain();

  // Room stage: dry x (1 - r) + convolved x r.
  const roomDry = ctx.createGain();
  const roomWet = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = opts.reverbIR ?? createScratchRoomIR(ctx);
  convolver.normalize = false; // the reference's gains: the response carries its own direct part
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

  input.connect(velLp); velLp.connect(toned); velLp.connect(edge); edge.connect(edgeGain); edgeGain.connect(toned);
  toned.connect(hp[0]!); hp[0]!.connect(hp[1]!); hp[1]!.connect(presence); presence.connect(shaper);
  shaper.connect(delayDry); delayDry.connect(delaySum);
  shaper.connect(loopSum); loopSum.connect(delay); delay.connect(damp); damp.connect(loopSat); loopSat.connect(feedback);
  feedback.connect(loopSum); feedback.connect(delayWet); delayWet.connect(delaySum);
  // wet only (a deck's send): the room hears the whole stage, the dry path only the echoes
  if (wetOnly) delayWet.connect(roomDry); else delaySum.connect(roomDry);
  roomDry.connect(roomSum);
  delaySum.connect(convolver); convolver.connect(roomWet); roomWet.connect(roomSum);
  roomSum.connect(lp[0]!); lp[0]!.connect(lp[1]!); lp[1]!.connect(headroom); headroom.connect(output);
  output.connect(destination);

  let ambience = 0;
  const apply = (amount: number, rampSec: number) => {
    // the channel runs wet (room 0.30, delay 0.16); `amount` lengthens the echo tail toward 0.35
    // `room` / `delayMix` are the reference channel's own parameters (its RoutineDry / Dark / Delay presets)
    const base = opts.delayMix ?? SCRATCH_BUS.delayMix;
    const m = base > 0 ? base + (SCRATCH_BUS.tailDelayMix - base) * amount : 0;
    const r = opts.room ?? SCRATCH_BUS.reverbMix;
    const now = ctx.currentTime;
    for (const [param, value] of [[delayDry.gain, 1], [delayWet.gain, m], [roomDry.gain, 1 - r], [roomWet.gain, r]] as const) {
      param.cancelScheduledValues(now);
      if (rampSec > 0) { param.setValueAtTime(param.value, now); param.linearRampToValueAtTime(value, now + rampSec); }
      else param.setValueAtTime(value, now);
    }
  };
  apply(0, 0);

  const nodes: AudioNode[] = [input, velLp, edge, edgeGain, toned, ...hp, presence, shaper, delayDry, delayWet, delay, damp, loopSat, feedback, loopSum, delaySum, roomDry, roomWet, convolver, roomSum, ...lp, headroom, output];

  return {
    input,
    output,
    level: output.gain,
    get ambience() { return ambience; },
    setAmbience(amount: number, rampSec = 0.02) {
      ambience = Math.max(0, Math.min(1, amount));
      apply(ambience, rampSec);
    },
    setTone(velocity: number, at?: number) {
      const t = Math.max(ctx.currentTime, at ?? ctx.currentTime);
      const v = Math.max(0, Math.min(1, velocity));
      velLp.frequency.setValueAtTime(v < 0.5 ? 2500 + 6000 * v : 20000, t);
      edgeGain.gain.setValueAtTime(v > 0.85 ? 0.15 : 0, t);
    },
    dispose() {
      for (const n of nodes) { try { n.disconnect(); } catch { /* already */ } }
    },
  };
}

/** Section 43 on a wet channel: every scratch sits in the room; a feature trails longer echoes, the final event the full tail. */
export const AMBIENCE = { ordinary: 0, transition: 0.2, feature: 0.5, final: 1.0 } as const;

export function ambienceFor(role: ScratchRole, isFinal = false): number {
  if (isFinal) return AMBIENCE.final;
  if (role === 'FEATURE') return AMBIENCE.feature;
  if (role === 'TRANSITION' || role === 'OUTRO') return AMBIENCE.transition;
  return AMBIENCE.ordinary;
}
