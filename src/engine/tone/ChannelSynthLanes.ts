/**
 * Per-channel synth lanes for standalone native synths (perChannelNativeSynths.ts).
 *
 * A native synth instance keyed to a tracker channel plays into that channel's
 * lane instead of the shared synthBus:
 *
 *   chain.output -> lane.gain -> [lane.resampler] -> channel strip input
 *
 * The lane gain mirrors synthBus (manual synth gain + auto-gain), so a
 * per-channel instance sits at the same level as the shared bus. The resampler
 * is the same PitchResampler worklet the synthBus uses for the DJ pitch slider;
 * the lane reaches the strip at once and the worklet is spliced in when its
 * module has loaded, so audio flows before the worklet is ready.
 *
 * ToneEngine owns the context (the Tone context, the worklet module promise and
 * the current pitch rate); the functions here are the routing logic, testable
 * without the engine.
 */
import type * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface ChannelSynthLane {
  gain: Tone.Gain;
  resampler: AudioWorkletNode | null;
}

export interface ChannelSynthLaneContext {
  lanes: Map<number, ChannelSynthLane>;
  /** Current linear synthBus gain (what every lane mirrors). */
  synthBusGain: () => number;
  /** A unity Tone.Gain on the engine's context. */
  createGain: (gain: number) => Tone.Gain;
  /** The channel strip input the lane feeds (built on demand). */
  getChannelOutput: (channelIndex: number) => Tone.ToneAudioNode;
  /** Loads the PitchResampler worklet module once; rejects when unavailable. */
  ensurePitchResamplerModule: () => Promise<void>;
  /** A resampler node at the current pitch rate (module already loaded). */
  createPitchResamplerNode: () => AudioWorkletNode;
}

/** The lane for a channel, built on first use. */
export function getChannelSynthLane(ctx: ChannelSynthLaneContext, channelIndex: number): ChannelSynthLane {
  const existing = ctx.lanes.get(channelIndex);
  if (existing) return existing;
  const gain = ctx.createGain(ctx.synthBusGain());
  const strip = ctx.getChannelOutput(channelIndex);
  gain.connect(strip);
  const lane: ChannelSynthLane = { gain, resampler: null };
  ctx.lanes.set(channelIndex, lane);
  void ctx.ensurePitchResamplerModule().then(() => {
    if (ctx.lanes.get(channelIndex) !== lane) return; // disposed meanwhile
    const nativeGain = getNativeAudioNode(gain as never);
    const nativeStrip = getNativeAudioNode(strip as never);
    if (!nativeGain || !nativeStrip) return;
    const resampler = ctx.createPitchResamplerNode();
    nativeGain.disconnect(nativeStrip);
    nativeGain.connect(resampler);
    resampler.connect(nativeStrip);
    lane.resampler = resampler;
  }).catch((e) => {
    console.warn(`[ToneEngine] PitchResampler for channel ${channelIndex} unavailable, lane stays unshifted:`, e);
  });
  return lane;
}

/** Follow a synthBus gain change on every lane. */
export function applyChannelSynthLaneGains(ctx: ChannelSynthLaneContext): void {
  const gain = ctx.synthBusGain();
  for (const lane of ctx.lanes.values()) lane.gain.gain.value = gain;
}

/** Fan the DJ pitch rate out to every lane resampler that exists. */
export function setChannelSynthLanePitchRate(ctx: ChannelSynthLaneContext, rate: number): void {
  for (const lane of ctx.lanes.values()) {
    lane.resampler?.port.postMessage({ type: 'set-rate', rate });
  }
}

export function disposeChannelSynthLanes(ctx: ChannelSynthLaneContext): void {
  for (const [channelIndex, lane] of ctx.lanes) {
    try {
      lane.resampler?.disconnect();
      lane.gain.disconnect();
      lane.gain.dispose();
    } catch (e) {
      console.warn(`[ToneEngine] Failed to dispose synth lane for channel ${channelIndex}:`, e);
    }
  }
  ctx.lanes.clear();
}
