import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import { isDevilboxSynth } from '@typedefs/synth';
import { InstrumentFactory } from '../InstrumentFactory';
import { InstrumentAnalyser } from '../InstrumentAnalyser';
import { getChannelFilterManager } from '../ChannelFilterManager';
import { connectAudio } from './connectAudio';
import { getNativeAudioNode } from '@utils/audio-context';
import type { VoiceState } from './ChannelRouting';
import { LIVE_VOICE_BASE_CHANNEL } from '../furnace-dispatch/chipChannel';
import { tapWhileSounding } from '../audio/signalPresence';

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

const rebuildQueues = new WeakMap<object, Map<number, Promise<void>>>();

type EffectTap = { pre: AnalyserNode; post: AnalyserNode; untap: () => void };
// Pre/post scope taps per instrument effect, keyed like instrumentEffectNodes (a stable Map, so it owns the lookup).
const effectTaps = new WeakMap<object, Map<string, EffectTap>>();

/** Pre/post AnalyserNodes of an instrument effect (any instance chain of its instrument), or null. */
export function getInstrumentEffectAnalysers(
  instrumentEffectNodes: Map<string, unknown>,
  effectId: string
): { pre: AnalyserNode; post: AnalyserNode } | null {
  for (const [registryKey, tap] of effectTaps.get(instrumentEffectNodes) ?? []) {
    if (registryKey.endsWith(`:${effectId}`)) return tap;
  }
  return null;
}

/** Side-branch pre/post taps for effect i of a built chain (same shape as the master chain taps). */
function tapInstrumentEffect(
  nodes: Tone.ToneAudioNode[],
  i: number,
  source: Tone.ToneAudioNode | DevilboxSynth
): EffectTap {
  const rawCtx = Tone.getContext().rawContext as AudioContext;
  const pre = rawCtx.createAnalyser();
  const post = rawCtx.createAnalyser();
  pre.fftSize = post.fftSize = 2048;
  pre.smoothingTimeConstant = post.smoothingTimeConstant = 0.8;
  const nativeOf = (n: unknown) => {
    const out = (n as { output?: unknown }).output;
    return out ? getNativeAudioNode(out as never) : getNativeAudioNode(n as never);
  };
  const preNative = i === 0
    ? (isDevilboxSynth(source) ? source.output : nativeOf(source))
    : nativeOf(nodes[i - 1]);
  const postNative = nativeOf(nodes[i]);
  const untaps: Array<() => void> = [];
  if (preNative) untaps.push(tapWhileSounding(() => preNative.connect(pre), () => preNative.disconnect(pre)));
  if (postNative) untaps.push(tapWhileSounding(() => postNative.connect(post), () => postNative.disconnect(post)));
  return { pre, post, untap: () => untaps.forEach((u) => u()) };
}

/** Run builds of one instrument key strictly one after another (two quick adds must not leak a chain). */
export function buildInstrumentEffectChain(
  ctx: InstrumentEffectsContext,
  key: number,
  effects: EffectConfig[],
  instrument: Tone.ToneAudioNode | DevilboxSynth
): Promise<void> {
  // ctx is a fresh object per call (ToneEngine getter); its chain map is the stable owner.
  let queues = rebuildQueues.get(ctx.instrumentEffectChains);
  if (!queues) { queues = new Map(); rebuildQueues.set(ctx.instrumentEffectChains, queues); }
  const run = (queues.get(key) ?? Promise.resolve()).then(() => buildChainNow(ctx, key, effects, instrument));
  const tail = run.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

/** The node the instrument feeds in a chain: bridge, else first effect, else output. */
function chainInput(chain: { effects: Tone.ToneAudioNode[]; output: Tone.Gain; bridge?: Tone.Gain }): Tone.ToneAudioNode {
  return chain.bridge ?? chain.effects[0] ?? chain.output;
}

/** Remove only the instrument -> old chain edge; other consumers of the output (synthBus) stay. */
function detachFromChain(instrument: Tone.ToneAudioNode | DevilboxSynth, target: Tone.ToneAudioNode): void {
  try {
    if (isDevilboxSynth(instrument)) {
      const dest = getNativeAudioNode(target as never) ?? (target as unknown as { input?: AudioNode }).input;
      if (dest) instrument.output.disconnect(dest);
    } else {
      instrument.disconnect(target);
    }
  } catch (e) {
    console.log('[ToneEngine] detachFromChain: not connected (expected):', e);
  }
}

async function buildChainNow(
  ctx: InstrumentEffectsContext,
  key: number,
  effects: EffectConfig[],
  instrument: Tone.ToneAudioNode | DevilboxSynth
): Promise<void> {
  // Filter to only enabled effects
  const enabledEffects = effects.filter((fx) => fx.enabled);

  // Create ALL new effect nodes before touching the live chain: a failed or slow
  // create (lazy registry/WASM/neural load) must never leave the instrument silent.
  let effectNodes: Tone.ToneAudioNode[] = [];
  if (enabledEffects.length > 0) {
    try {
      effectNodes = (await Promise.all(
        enabledEffects.map((config) => InstrumentFactory.createEffect(config))
      )) as Tone.ToneAudioNode[];
    } catch (e) {
      console.error('[ToneEngine] buildInstrumentEffectChain: effect creation failed, keeping old chain', e);
      return;
    }
  }

  // Swap: detach and release the old chain only now.
  const existing = ctx.instrumentEffectChains.get(key);
  if (existing) {
    detachFromChain(instrument, chainInput(existing));
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

  if (enabledEffects.length === 0) {
    // No effects - direct connection
    connectInstrumentTo(output);

    connectChainOutput(ctx, key, output, isNativeSynth);

    ctx.instrumentEffectChains.set(key, { effects: [], output });
    return;
  }

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
      connectAudio(bridge, effectNodes[0]);
    } else {
      console.log('[ToneEngine] buildInstrumentEffectChain: connecting Tone.js instrument to first effect');
      connectAudio(instrument, effectNodes[0]);
    }
    // Chain effects together
    for (let i = 0; i < effectNodes.length - 1; i++) {
      // Effects mix Tone.js and native nodes (Buzzmachine): connectAudio bridges both.
      connectAudio(effectNodes[i], effectNodes[i + 1]);
    }
    // Connect last effect to output
    console.log('[ToneEngine] buildInstrumentEffectChain: connecting last effect to output');
    connectAudio(effectNodes[effectNodes.length - 1], output);
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
    const registryKey = instrumentEffectNodeKey(key, config.id);
    ctx.instrumentEffectNodes.set(registryKey, { node: effectNodes[i] as Tone.ToneAudioNode, config });
    let taps = effectTaps.get(ctx.instrumentEffectNodes);
    if (!taps) { taps = new Map(); effectTaps.set(ctx.instrumentEffectNodes, taps); }
    taps.get(registryKey)?.untap();
    taps.set(registryKey, tapInstrumentEffect(effectNodes, i, bridge ?? instrument));
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
      const taps = effectTaps.get(ctx.instrumentEffectNodes);
      taps?.get(effectId)?.untap();
      taps?.delete(effectId);
    }
  }
  chain.effects.forEach((fx) => {
    // Native effects (Buzzmachine) have no disconnect(); dispose() disconnects them, so run it regardless.
    try { fx.disconnect(); } catch { /* native effect or already disposed */ }
    try { fx.dispose(); } catch { /* already disposed */ }
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
