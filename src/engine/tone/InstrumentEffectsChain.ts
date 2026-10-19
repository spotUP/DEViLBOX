import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import { isDevilboxSynth } from '@typedefs/synth';
import { InstrumentFactory } from '../InstrumentFactory';
import { InstrumentAnalyser } from '../InstrumentAnalyser';
import { getChannelFilterManager } from '../ChannelFilterManager';
import { connectAudio } from './connectAudio';
import type { VoiceState } from './ChannelRouting';
import { LIVE_VOICE_BASE_CHANNEL } from '../furnace-dispatch/chipChannel';

// Channel indices 1000+ are reserved for native synth global filters,
// avoiding collision with per-channel voice indices (0-63).
const NATIVE_SYNTH_FILTER_BASE = 1000;

export interface InstrumentEffectsContext {
  instrumentEffectChains: Map<number, {
    effects: Tone.ToneAudioNode[];
    output: Tone.Gain;
    bridge?: Tone.Gain;
  }>;
  instrumentEffectNodes: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>;
  instrumentAnalysers: Map<number, InstrumentAnalyser>;
  instrumentOutputOverrides: Map<number, Tone.ToneAudioNode>;
  instruments: Map<number, Tone.ToneAudioNode | DevilboxSynth>;
  /** Sounding voices per tracker channel (ToneEngine.activeVoices). */
  activeVoices: Map<number, VoiceState[]>;
  masterInput: Tone.Gain;
  synthBus: Tone.Gain;
  connectNativeSynth: (output: AudioNode, destination: Tone.ToneAudioNode) => void;
  getInstrumentOutputDestination: (instrumentId: number, isNative: boolean, channelIndex?: number) => Tone.ToneAudioNode;
  getInstrumentKey: (instrumentId: number, channel: number) => number;
  /** Channel half of a composite key; -1 for the shared instance. */
  channelFromKey: (key: number) => number;
}

/**
 * Build or rebuild an instrument's effect chain (now async for neural effects)
 * Route: instrument → effects → masterInput
 * Supports both Tone.js ToneAudioNodes and native DevilboxSynths.
 * @param key - Composite key (instrumentId-channelIndex) for per-channel chains
 */
export function clearConnectedNativeOutputs(): void {
  // No-op: permanent native connections (SunVox etc.) survive song changes.
}

/**
 * Connect effect chain output to destination, inserting a channel filter
 * for native (WASM) synths. Tone.js instruments already have per-channel
 * filters wired in ChannelRouting, but native synths bypass that path.
 * A per-channel native instance (channelIndex >= 0) plays into its channel
 * lane, which sits before the channel strip and its filter, so it skips the
 * global native-synth filter slot.
 */
function connectToDestWithFilter(
  output: Tone.Gain,
  dest: Tone.ToneAudioNode,
  isNative: boolean,
  instrumentId: number,
  channelIndex = -1,
): void {
  if (isNative && channelIndex < 0) {
    const filterMgr = getChannelFilterManager();
    const filterIdx = NATIVE_SYNTH_FILTER_BASE + instrumentId;
    const filterInput = filterMgr.getInput(filterIdx);
    const filterOutput = filterMgr.getOutput(filterIdx);
    connectAudio(output, filterInput);
    connectAudio(filterOutput, dest);
  } else if (isNative) {
    connectAudio(output, dest);
  } else {
    output.connect(dest);
  }
}

/** A tracker channel (pattern playback), as opposed to the shared -1 instance or a live-voice channel. */
export function isTrackerChannel(channelIndex: number): boolean {
  return channelIndex >= 0 && channelIndex < LIVE_VOICE_BASE_CHANNEL;
}

/**
 * Feed a tracker-channel voice's gain from `source` (the instrument's chain
 * output, or the voice node itself when the chain is not built yet). The
 * previous source edge is dropped so a voice never carries two copies.
 */
export function attachVoiceSource(voice: VoiceState, source: Tone.ToneAudioNode): void {
  if (voice.nodes.source && voice.nodes.source !== source) {
    try { voice.nodes.source.disconnect(voice.nodes.gain); } catch { /* not connected */ }
  }
  source.connect(voice.nodes.gain);
  voice.nodes.source = source;
}

/**
 * Route a built chain's output.
 *
 * A Tone.js instrument on a tracker channel reaches master only through its
 * channel strip: chain output -> voice gain (velocity, column effects, pan)
 * -> strip (fader, mute, solo, channel effects). It gets no static
 * destination here; triggerNoteAttack attaches each new voice, and a rebuilt
 * chain re-attaches the voices already sounding. (Before this, the chain also
 * fed masterInput directly: a second, unscaled copy that bypassed the strip
 * and drove the safety limiter into pumping.)
 *
 * Every other key gets its destination from getInstrumentOutputDestination
 * (per-channel native lane, synthBus or masterInput, or an output override).
 * An open instrument analyser is always a parallel tap.
 */
export function connectChainOutput(
  ctx: InstrumentEffectsContext,
  key: number,
  output: Tone.Gain,
  isNative: boolean,
): void {
  const instrumentId = key >>> 16;
  const channelIndex = ctx.channelFromKey(key);
  if (!isNative && isTrackerChannel(channelIndex)) {
    const instrument = ctx.instruments.get(key);
    for (const voice of ctx.activeVoices.get(channelIndex) ?? []) {
      if (voice.instrument === instrument) attachVoiceSource(voice, output);
    }
  } else {
    const dest = ctx.getInstrumentOutputDestination(instrumentId, isNative, channelIndex);
    connectToDestWithFilter(output, dest, isNative, instrumentId, channelIndex);
  }
  const activeAnalyser = ctx.instrumentAnalysers.get(instrumentId);
  if (activeAnalyser) connectAudio(output, activeAnalyser.input);
}

export async function buildInstrumentEffectChain(
  ctx: InstrumentEffectsContext,
  key: number,
  effects: EffectConfig[],
  instrument: Tone.ToneAudioNode | DevilboxSynth
): Promise<void> {
  console.log('[ToneEngine] buildInstrumentEffectChain called for key:', key,
    'effects:', effects.length,
    'isNative:', isDevilboxSynth(instrument));

  // Dispose existing effect chain if any
  const existing = ctx.instrumentEffectChains.get(key);
  if (existing) {
    console.log('[ToneEngine] buildInstrumentEffectChain: disposing existing chain with', existing.effects.length, 'effects');
    releaseEffectChain(ctx, existing);
  }

  // Create output gain node
  const output = new Tone.Gain(1);

  // Detect if this is a native DevilboxSynth (non-Tone.js) or a Tone.js node
  const isNativeSynth = isDevilboxSynth(instrument);

  // Helper: connect instrument to a Tone.js destination node
  const connectInstrumentTo = (dest: Tone.ToneAudioNode) => {
    if (isNativeSynth) {
      // Native AudioNode → Tone.js node bridge
      ctx.connectNativeSynth((instrument as DevilboxSynth).output, dest);
    } else {
      // Tone.js → Tone.js (existing path)
      (instrument as Tone.ToneAudioNode).connect(dest);
    }
  };

  // Filter to only enabled effects
  const enabledEffects = effects.filter((fx) => fx.enabled);

  if (enabledEffects.length === 0) {
    // No effects - direct connection
    connectInstrumentTo(output);

    connectChainOutput(ctx, key, output, isNativeSynth);

    ctx.instrumentEffectChains.set(key, { effects: [], output });
    return;
  }

  // Create effect nodes (async for neural effects)
  console.log('[ToneEngine] buildInstrumentEffectChain: creating', enabledEffects.length, 'effect nodes');
  const effectNodes = (await Promise.all(
    enabledEffects.map((config) => InstrumentFactory.createEffect(config))
  )) as Tone.ToneAudioNode[];
  console.log('[ToneEngine] buildInstrumentEffectChain: created', effectNodes.length, 'effect nodes');

  // Build full chain: instrument → [bridge?] → effect[0] → ... → effect[N-1] → output → destination
  let bridge: Tone.Gain | undefined;
  if (effectNodes.length > 0) {
    if (isNativeSynth) {
      // Native synths can't connect directly to Tone.js effects (CrossFade input).
      // Insert a Tone.Gain bridge whose .input IS a native GainNode.
      bridge = new Tone.Gain(1);
      console.log('[ToneEngine] buildInstrumentEffectChain: connecting native synth to bridge');
      connectInstrumentTo(bridge);
      console.log('[ToneEngine] buildInstrumentEffectChain: connecting bridge to first effect');
      bridge.connect(effectNodes[0] as Tone.ToneAudioNode);
    } else {
      console.log('[ToneEngine] buildInstrumentEffectChain: connecting Tone.js instrument to first effect');
      (instrument as Tone.ToneAudioNode).connect(effectNodes[0] as Tone.ToneAudioNode);
    }
    // Chain effects together
    for (let i = 0; i < effectNodes.length - 1; i++) {
      (effectNodes[i] as Tone.ToneAudioNode).connect(effectNodes[i + 1] as Tone.ToneAudioNode);
    }
    // Connect last effect to output
    console.log('[ToneEngine] buildInstrumentEffectChain: connecting last effect to output');
    (effectNodes[effectNodes.length - 1] as Tone.ToneAudioNode).connect(output);
  } else {
    console.log('[ToneEngine] buildInstrumentEffectChain: no enabled effects, connecting directly to output');
    connectInstrumentTo(output);
  }

  console.log('[ToneEngine] buildInstrumentEffectChain: connecting output to destination (native:', isNativeSynth, ')');
  connectChainOutput(ctx, key, output, isNativeSynth);

  ctx.instrumentEffectChains.set(key, { effects: effectNodes as Tone.ToneAudioNode[], output, bridge });
  console.log('[ToneEngine] buildInstrumentEffectChain: chain built and stored for key', key);

  // Register individual effect nodes for real-time parameter updates
  // Keyed by chain key and effect id: one instrument may own one chain per
  // tracker channel, and every chain carries its own copy of each effect.
  enabledEffects.forEach((config, i) => {
    ctx.instrumentEffectNodes.set(instrumentEffectNodeKey(key, config.id), { node: effectNodes[i] as Tone.ToneAudioNode, config });
  });
}

/** Registry key for one effect node inside one instrument instance's chain. */
export function instrumentEffectNodeKey(chainKey: number, effectId: string): string {
  return `${chainKey}:${effectId}`;
}

/** Every instance key (shared and per-channel) currently built for an instrument id. */
export function instanceKeysOf(instruments: Map<number, unknown>, instrumentId: number): number[] {
  const keys: number[] = [];
  for (const key of instruments.keys()) {
    if ((key >> 16) === instrumentId) keys.push(key);
  }
  return keys;
}

/**
 * Rebuild an instrument's effect chain (public method for store to call, now async)
 */
export async function rebuildInstrumentEffects(
  ctx: InstrumentEffectsContext,
  instrumentId: number,
  effects: EffectConfig[]
): Promise<void> {
  // One instrument may have a shared instance plus one instance per tracker
  // channel; the new chain must reach every one of them.
  const keys = instanceKeysOf(ctx.instruments, instrumentId);

  console.log('[ToneEngine] rebuildInstrumentEffects called for instrumentId:', instrumentId,
    'keys:', keys,
    'effects count:', effects.length);

  if (keys.length === 0) {
    // Instrument not yet created (no notes played) - effects will be applied on first note
    // This is expected behavior, not an error
    console.log('[ToneEngine] rebuildInstrumentEffects: instrument not yet created - effects will apply on first note');
    return;
  }

  for (const key of keys) {
    const instrument = ctx.instruments.get(key);
    if (!instrument) continue;

    // Disconnect instrument from current chain
    try {
      if (isDevilboxSynth(instrument)) {
        // Native synth — disconnect the AudioNode output
        instrument.output.disconnect();
      } else {
        instrument.disconnect();
      }
    } catch (e) {
      // May not be connected
      console.log('[ToneEngine] rebuildInstrumentEffects: disconnect error (expected if not connected):', e);
    }

    // Build new effect chain (await for neural effects)
    await buildInstrumentEffectChain(ctx, key, effects, instrument);
  }
  console.log('[ToneEngine] rebuildInstrumentEffects: effect chain built for', keys.length, 'instance(s)');
}

/**
 * Override the output destination for an instrument's effect chain and voice routing.
 * Used by DJ mode to route audio through deck gain → EQ → filter → crossfader.
 */
export function setInstrumentOutputOverride(
  ctx: InstrumentEffectsContext,
  instrumentId: number,
  destination: Tone.ToneAudioNode
): void {
  ctx.instrumentOutputOverrides.set(instrumentId, destination);
}

export function removeInstrumentOutputOverride(
  ctx: InstrumentEffectsContext,
  instrumentId: number
): void {
  ctx.instrumentOutputOverrides.delete(instrumentId);
}

/**
 * Momentarily "throw" an instrument into an effect (e.g. Dub Delay Throw)
 * Ramps the wet level of a specific effect type in the instrument's chain
 */
export function throwInstrumentToEffect(
  ctx: InstrumentEffectsContext,
  instrumentId: number,
  effectType: string,
  wetAmount: number = 1.0,
  durationMs: number = 0
): void {
  // Find the chain - for throws, we typically look at the base instrument chain (-1)
  // or iterate all channels if it's a live instrument
  const chains: Array<{ effects: Tone.ToneAudioNode[]; output: Tone.Gain }> = [];
  ctx.instrumentEffectChains.forEach((chain, chainKey) => {
    if ((chainKey >> 16) === instrumentId) {
      chains.push(chain);
    }
  });

  if (chains.length === 0) return;

  chains.forEach(chain => {
    // Find the target effect node in the chain
    const targetFx = chain.effects.find((fx) => (fx as unknown as { _fxType?: string })._fxType === effectType);

    if (targetFx && 'wet' in targetFx) {
      const wetParam = (targetFx as unknown as { wet: Tone.Param<"normalRange"> }).wet;
      const now = Tone.immediate();
      
      // Ramp up instantly (10ms)
      wetParam.cancelScheduledValues(now);
      wetParam.rampTo(wetAmount, 0.01, now);
      
      // If duration is provided, ramp back down after that time
      if (durationMs > 0) {
        wetParam.rampTo(0, 0.1, now + durationMs / 1000);
      }
    }
  });
}

/**
 * Dispose one chain's nodes (effects, bridge, output) and drop its effects
 * from the per-effect registry. The registry holds each node strongly, so a
 * chain disposed without it stays reachable with all its Tone.js Gains.
 */
function releaseEffectChain(
  ctx: InstrumentEffectsContext,
  chain: { effects: Tone.ToneAudioNode[]; output: Tone.Gain; bridge?: Tone.Gain }
): void {
  for (const [effectId, entry] of ctx.instrumentEffectNodes) {
    if (chain.effects.includes(entry.node)) {
      ctx.instrumentEffectNodes.delete(effectId);
    }
  }
  chain.effects.forEach((fx) => {
    try {
      fx.disconnect();
      fx.dispose();
    } catch {
      // Node may already be disposed
    }
  });
  if (chain.bridge) {
    try {
      chain.bridge.disconnect();
      chain.bridge.dispose();
    } catch {
      // Bridge may already be disposed
    }
  }
  try {
    chain.output.disconnect();
    chain.output.dispose();
  } catch {
    // Node may already be disposed
  }
}

/**
 * Dispose instrument effect chain
 */
export function disposeInstrumentEffectChain(
  ctx: InstrumentEffectsContext,
  key: number
): void {
  const chain = ctx.instrumentEffectChains.get(key);
  if (chain) {
    releaseEffectChain(ctx, chain);
    ctx.instrumentEffectChains.delete(key);
  }
}
