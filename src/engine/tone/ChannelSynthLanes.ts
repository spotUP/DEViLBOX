/**
 * Per-channel synth lanes for standalone native synths (perChannelNativeSynths.ts).
 *
 * A native synth instance keyed to a tracker channel plays into that channel's
 * lane instead of the shared synthBus:
 *
 *   chain.output -> lane.gain -> lane.shift -> channel strip (lane join)
 *
 * The lane gain mirrors synthBus (manual synth gain + auto-gain), so a
 * per-channel instance sits at the same level as the shared bus. The shift is
 * the same time-preserving pitch shifter the synthBus carries for the DJ pitch
 * slider (DeckKeyLock, Signalsmith Stretch): a direct wire at pitch 0, the
 * stretcher once the slider moves. The lane joins the strip AFTER the strip's
 * voice delay, which holds the channel's samples back by the shifter's
 * latency, so a channel mixing samples and a native synth stays in time.
 *
 * ToneEngine owns the context (the shifter factory and the current pitch
 * rate); the functions here are the routing logic, testable without the engine.
 */
import type * as Tone from 'tone';
import { pitchRateToShift } from '../dj/computeKeyLockShift';

/** What a lane needs from a pitch-shift insert (DeckKeyLock satisfies it). */
export interface PitchShiftInsert {
  readonly input: Tone.ToneAudioNode;
  readonly output: Tone.ToneAudioNode;
  setActive(active: boolean): void;
  setPitchSemiTones(semitones: number): void;
  latencySec(): number;
  dispose(): void;
}

export interface ChannelSynthLane {
  gain: Tone.Gain;
  shift: PitchShiftInsert;
}

export interface ChannelSynthLaneContext {
  lanes: Map<number, ChannelSynthLane>;
  /** Current linear synthBus gain (what every lane mirrors). */
  synthBusGain: () => number;
  /** A unity Tone.Gain on the engine's context. */
  createGain: (gain: number) => Tone.Gain;
  /** Where the lane joins its channel strip, after the strip's voice delay (built on demand). */
  getLaneDestination: (channelIndex: number) => Tone.ToneAudioNode;
  /** The DJ pitch rate the synthBus is at (1 = unshifted). */
  synthPitchRate: () => number;
  /** A fresh pitch-shift insert on the engine's context. */
  createPitchShift: () => PitchShiftInsert;
}

/** Drive a shift insert from a DJ pitch rate: semitones first, then engage or bypass. */
export function applyPitchShift(shift: PitchShiftInsert, rate: number): void {
  const { active, semitones } = pitchRateToShift(rate);
  shift.setPitchSemiTones(semitones);
  shift.setActive(active);
}

/** The lane for a channel, built on first use, already at the current pitch rate. */
export function getChannelSynthLane(ctx: ChannelSynthLaneContext, channelIndex: number): ChannelSynthLane {
  const existing = ctx.lanes.get(channelIndex);
  if (existing) return existing;
  const gain = ctx.createGain(ctx.synthBusGain());
  const shift = ctx.createPitchShift();
  gain.connect(shift.input);
  shift.output.connect(ctx.getLaneDestination(channelIndex));
  applyPitchShift(shift, ctx.synthPitchRate());
  const lane: ChannelSynthLane = { gain, shift };
  ctx.lanes.set(channelIndex, lane);
  return lane;
}

/** Follow a synthBus gain change on every lane. */
export function applyChannelSynthLaneGains(ctx: ChannelSynthLaneContext): void {
  const gain = ctx.synthBusGain();
  for (const lane of ctx.lanes.values()) lane.gain.gain.value = gain;
}

/** Fan the DJ pitch rate out to every lane's shifter. */
export function setChannelSynthLanePitchRate(ctx: ChannelSynthLaneContext, rate: number): void {
  for (const lane of ctx.lanes.values()) applyPitchShift(lane.shift, rate);
}

export function disposeChannelSynthLanes(ctx: ChannelSynthLaneContext): void {
  for (const [channelIndex, lane] of ctx.lanes) {
    try {
      lane.shift.dispose();
      lane.gain.disconnect();
      lane.gain.dispose();
    } catch (e) {
      console.warn(`[ToneEngine] Failed to dispose synth lane for channel ${channelIndex}:`, e);
    }
  }
  ctx.lanes.clear();
}
