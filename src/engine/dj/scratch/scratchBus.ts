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
import type { ScratchDJStyle, ScratchGestureFx, ScratchRole } from './scratchTypes';

/**
 * The reference style FX presets (`scratch.py` :341-345, `apply_fx`): the scratch channel's
 * tone stages per style. Only the presets a style maps to are used today (PROFILES[...].fx):
 * old school, boom bap and battle play BOOMBAP, electro ELECTRO, lo-fi LOFI.
 */
export interface ScratchFxProfile { hpHz: number; lpHz: number; drive: number; delayMix: number; delaySec: number; reverbMix: number }

export const SCRATCH_FX_PROFILES = {
  BOOMBAP: { hpHz: 150, lpHz: 4500, drive: 0.10, delayMix: 0, delaySec: 0.18, reverbMix: 0.05 },
  ELECTRO: { hpHz: 200, lpHz: 7000, drive: 0.05, delayMix: 0.12, delaySec: 0.14, reverbMix: 0.04 },
  LOFI: { hpHz: 120, lpHz: 3000, drive: 0.08, delayMix: 0, delaySec: 0.18, reverbMix: 0.10 },
  MEMPHIS: { hpHz: 180, lpHz: 3800, drive: 0.18, delayMix: 0, delaySec: 0.18, reverbMix: 0.06 },
  WEST: { hpHz: 150, lpHz: 5500, drive: 0.06, delayMix: 0.08, delaySec: 0.2, reverbMix: 0.05 },
} as const satisfies Record<string, ScratchFxProfile>;

/** Reference `PROFILES[style].fx` for the five DEViLBOX styles. */
export const STYLE_FX_PROFILE: Readonly<Record<ScratchDJStyle, keyof typeof SCRATCH_FX_PROFILES>> = {
  oldSchool: 'BOOMBAP', boomBap: 'BOOMBAP', electro: 'ELECTRO', battle: 'BOOMBAP', loFi: 'LOFI',
};

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

/** The reference routine presets (`scratch_routine.py` :331-334, `scratch_channel` arguments). */
interface ChannelPreset { room: number; delayMix: number; drive?: number; lpHz?: number }
export const CHANNEL_PRESETS = {
  dry: { room: 0.06, delayMix: 0, drive: 0.09 },
  dark: { room: 0.25, delayMix: 0.06, lpHz: 3800 },
  delay: { room: 0.18, delayMix: 0.28 },
} as const satisfies Record<string, ChannelPreset>;

/** Reference `VEL` (scratch.py :210-216): the velocity response of a stroke. */
export const VELOCITY_RESPONSE = {
  gainBase: 0.70, gainSpan: 0.50, throwBase: 0.8, throwSpan: 0.4,
  lpThresh: 0.50, lpBase: 2500, lpSpan: 6000, hpThresh: 0.85, hpFreq: 3000, hpMix: 0.15,
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
   * The stroke's velocity response (reference `render_gesture` + `VEL`, scratch.py :205-216,
   * :303-307; SCR-PG-D1): level 0.70 + 0.50 v (a throw 0.8 + 0.4 v); a stroke under 0.5 low-passed
   * at 2500 + 6000 v Hz, over 0.85 with 0.15 of a 3 kHz high pass added; now or at context time `at`.
   */
  setVelocity(velocity: number, at?: number, kind?: 'stroke' | 'throw'): void;
  /** The level the last velocity set (tests, telemetry). */
  readonly velocityLevel: number;
  /** The tone the last velocity set: the low pass (Hz) and the 3 kHz edge's share. */
  readonly velocityTone: { lpHz: number; edge: number };
  /**
   * The style's tone stages (reference style FX preset): high pass, low pass and drive; the
   * channel stays wet (owner 2026-10-12), a preset's own delay only lifts the echo (electro, west).
   * null = the channel's own stages.
   */
  setStyleFx(profile: ScratchFxProfile | null, at?: number): void;
  /**
   * The channel's routine preset (reference `scratch_routine.py` :331-334): Dry room 0.06, no delay,
   * drive 0.09; Dark low pass 3800 Hz, room 0.25, delay 0.06; Delay room 0.18, delay 0.28. null = the
   * wet channel (room 0.30, delay 0.16).
   */
  setChannelPreset(preset: keyof typeof CHANNEL_PRESETS | null, at?: number): void;
  /** A gesture's own echo (reference `echo`): delay mix and time while it plays; null = the channel's. */
  setGestureFx(fx: ScratchGestureFx | null, at?: number): void;
  /** The delay stage now: echo mix and time (telemetry, tests). */
  readonly delay: { mix: number; sec: number };
  dispose(): void;
}

/** The shaper's fixed slope: tanh(K x) covers every preset drive (k = 1 + 3 drive <= 1.54) with headroom. */
const DRIVE_K = 2.5;

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
export const scratchBusStats = { created: 0, wetOnly: 0, presets: 0 };

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
  const velGain = ctx.createGain();
  let velocityLevel = 1;
  const velocityTone = { lpHz: 20000, edge: 0 };
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

  // tanh(x (1 + 3 drive)) as a fixed tanh(K x) curve behind a drive gain (k / K): a style's drive
  // moves a gain, never the curve (a WaveShaper's curve is set once)
  const driveIn = ctx.createGain();
  driveIn.gain.value = (1 + 3 * SCRATCH_BUS.drive) / DRIVE_K;
  const shaper = ctx.createWaveShaper();
  shaper.curve = tanhCurve((DRIVE_K - 1) / 3);
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

  input.connect(velGain); velGain.connect(velLp); velLp.connect(toned); velLp.connect(edge); edge.connect(edgeGain); edgeGain.connect(toned);
  toned.connect(hp[0]!); hp[0]!.connect(hp[1]!); hp[1]!.connect(presence); presence.connect(driveIn); driveIn.connect(shaper);
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
  let style: ScratchFxProfile | null = null;
  let gestureFx: ScratchGestureFx | null = null;
  let preset: ChannelPreset | null = null;
  const delayNow: { mix: number; sec: number } = { mix: 0, sec: SCRATCH_BUS.delaySec };
  let delaySecSet: number = SCRATCH_BUS.delaySec;
  const apply = (amount: number, rampSec: number, at?: number) => {
    // the channel runs wet (room 0.30, delay 0.16); `amount` lengthens the echo tail toward 0.35
    // `room` / `delayMix` are the reference channel's own parameters (its RoutineDry / Dark / Delay presets)
    const channel = preset?.delayMix ?? opts.delayMix ?? SCRATCH_BUS.delayMix;
    const base = channel > 0 ? Math.max(channel, style?.delayMix ?? 0) : 0;
    const tail = base > 0 ? base + (SCRATCH_BUS.tailDelayMix - base) * amount : 0;
    // a gesture's own echo (reference echo fx) sets the stage while it plays
    const m = gestureFx ? gestureFx.delayMix : tail;
    const sec = gestureFx ? gestureFx.delaySec : style && style.delayMix > 0 ? style.delaySec : SCRATCH_BUS.delaySec;
    delayNow.mix = m; delayNow.sec = sec;
    const r = preset?.room ?? opts.room ?? SCRATCH_BUS.reverbMix;
    const now = Math.max(ctx.currentTime, at ?? ctx.currentTime);
    // the echo time moves only when a style or a gesture asks for another one
    if (sec !== delaySecSet) { delay.delayTime.setValueAtTime(sec, now); delaySecSet = sec; }
    for (const [param, value] of [[delayDry.gain, 1], [delayWet.gain, m], [roomDry.gain, 1 - r], [roomWet.gain, r]] as const) {
      param.cancelScheduledValues(now);
      if (rampSec > 0) { param.setValueAtTime(param.value, now); param.linearRampToValueAtTime(value, now + rampSec); }
      else param.setValueAtTime(value, now);
    }
  };
  apply(0, 0);

  const nodes: AudioNode[] = [input, velGain, velLp, edge, edgeGain, toned, ...hp, presence, driveIn, shaper, delayDry, delayWet, delay, damp, loopSat, feedback, loopSum, delaySum, roomDry, roomWet, convolver, roomSum, ...lp, headroom, output];

  return {
    input,
    output,
    level: output.gain,
    get ambience() { return ambience; },
    setAmbience(amount: number, rampSec = 0.02) {
      ambience = Math.max(0, Math.min(1, amount));
      apply(ambience, rampSec);
    },
    get delay() { return { ...delayNow }; },
    setStyleFx(profile: ScratchFxProfile | null, at?: number) {
      style = profile;
      const t = Math.max(ctx.currentTime, at ?? ctx.currentTime);
      hp.forEach((f) => f.frequency.setValueAtTime(profile?.hpHz ?? SCRATCH_BUS.hpHz, t));
      lp.forEach((f) => f.frequency.setValueAtTime(preset?.lpHz ?? profile?.lpHz ?? SCRATCH_BUS.lpHz, t));
      driveIn.gain.setValueAtTime((1 + 3 * (preset?.drive ?? profile?.drive ?? SCRATCH_BUS.drive)) / DRIVE_K, t);
      apply(ambience, 0, at);
    },
    setChannelPreset(name: keyof typeof CHANNEL_PRESETS | null, at?: number) {
      preset = name ? CHANNEL_PRESETS[name] : null;
      scratchBusStats.presets++;
      const t = Math.max(ctx.currentTime, at ?? ctx.currentTime);
      lp.forEach((f) => f.frequency.setValueAtTime(preset?.lpHz ?? style?.lpHz ?? SCRATCH_BUS.lpHz, t));
      driveIn.gain.setValueAtTime((1 + 3 * (preset?.drive ?? style?.drive ?? SCRATCH_BUS.drive)) / DRIVE_K, t);
      apply(ambience, 0, at);
    },
    setGestureFx(fx: ScratchGestureFx | null, at?: number) {
      gestureFx = fx;
      apply(ambience, 0, at);
    },
    get velocityLevel() { return velocityLevel; },
    get velocityTone() { return { ...velocityTone }; },
    setVelocity(velocity: number, at?: number, kind: 'stroke' | 'throw' = 'stroke') {
      const t = Math.max(ctx.currentTime, at ?? ctx.currentTime);
      const v = Math.max(0, Math.min(1, velocity));
      const r = VELOCITY_RESPONSE;
      // level (V1): a stroke 0.70 + 0.50 v, a throw 0.8 + 0.4 v (render_gesture's play path)
      velocityLevel = kind === 'throw' ? r.throwBase + r.throwSpan * v : r.gainBase + r.gainSpan * v;
      velGain.gain.setValueAtTime(velocityLevel, t);
      // tone (V2, V3): a stroke only - a throw is the word as recorded
      const toneV = kind === 'throw' ? 0.7 : v;
      velocityTone.lpHz = toneV < r.lpThresh ? r.lpBase + r.lpSpan * toneV : 20000;
      velocityTone.edge = toneV > r.hpThresh ? r.hpMix : 0;
      velLp.frequency.setValueAtTime(velocityTone.lpHz, t);
      edgeGain.gain.setValueAtTime(velocityTone.edge, t);
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
