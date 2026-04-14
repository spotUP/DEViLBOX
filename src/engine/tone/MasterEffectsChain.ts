import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { InstrumentFactory } from '../InstrumentFactory';
import { getNativeAudioNode } from '@utils/audio-context';
import { getEffectGainCompensation } from '../factories/effectGainCompensation';
import { useFormatStore } from '../../stores/useFormatStore';
import { supportsChannelIsolation } from './ChannelRoutedEffects';

export interface MasterEffectsContext {
  masterEffectsInput: Tone.Gain;
  blepInput: Tone.Gain;
  masterEffectsNodes: Tone.ToneAudioNode[];
  masterEffectConfigs: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>;
  masterEffectAnalysers: Map<string, { pre: AnalyserNode; post: AnalyserNode }>;
  masterEffectsRebuildVersion: number;
  _isPlaying: boolean;
  _notifyNoiseEffectsPlaying: (playing: boolean) => void;
  applyEffectParametersDiff: (node: Tone.ToneAudioNode, type: string, changed: Record<string, number | string>) => void;
  updateBpmSyncedEffects: (bpm: number) => Promise<void>;
}

// Track previous external sidechain sources so we can disconnect them cleanly
const scExternalSources = new WeakMap<Tone.ToneAudioNode, AudioNode>();
// Track which sidechain effects use isolation taps (for cleanup on source change)
const scIsolationChannels = new WeakMap<Tone.ToneAudioNode, { channel: number; scInput: AudioNode }>();

// Lazy resolver for ToneEngine — avoids circular import deadlock
// (MasterEffectsChain is imported by ToneEngine, so dynamic import hangs)
type ChannelOutputGetter = (index: number) => { channel: Tone.Channel } | null;
type GainGetter = () => Tone.Gain;
let _getChannelOutput: ChannelOutputGetter | null = null;
let _getMasterEffectsInput: GainGetter | null = null;
let _getPostEffectsInput: GainGetter | null = null;

/** Called by ToneEngine during init to provide channel output access without circular import. */
export function registerSidechainResolver(
  getChannelOutput: ChannelOutputGetter,
  getMasterEffectsInput: GainGetter,
  getPostEffectsInput: GainGetter,
): void {
  _getChannelOutput = getChannelOutput;
  _getMasterEffectsInput = getMasterEffectsInput;
  _getPostEffectsInput = getPostEffectsInput;
}

/** Get the post-effects merge point (blepInput) for sidechain tap passthrough. */
export function getPostEffectsInput(): Tone.Gain | null {
  return _getPostEffectsInput?.() ?? null;
}

async function wireMasterSidechain(node: Tone.ToneAudioNode, sourceChannel: number): Promise<void> {
  if (!('getSidechainInput' in node)) return;
  const scInput = (node as any).getSidechainInput() as Tone.Gain;
  const rawScInput = getNativeAudioNode(scInput);
  if (!rawScInput) return;

  // Disconnect previous external source (Tone.js channel output)
  const prevSource = scExternalSources.get(node);
  if (prevSource) {
    try { prevSource.disconnect(rawScInput); } catch { /* already disconnected */ }
    scExternalSources.delete(node);
  }

  // Release previous isolation tap (WASM channel isolation)
  const prevIso = scIsolationChannels.get(node);
  if (prevIso) {
    const { getChannelRoutedEffectsManager: getMgr } = await import('./ChannelRoutedEffects');
    getMgr()?.removeSidechainTap(prevIso.channel, prevIso.scInput);
    scIsolationChannels.delete(node);
  }

  // Enable/disable self-route (input→sidechain) based on mode
  if ('setSelfSidechain' in node) {
    (node as any).setSelfSidechain(sourceChannel < 0);
  }

  if (sourceChannel < 0 || isNaN(sourceChannel)) return;

  let connected = false;
  const editorMode = useFormatStore.getState().editorMode;
  const isoSupported = supportsChannelIsolation(editorMode);

  // Try 1: WASM isolation system (preferred — libopenmpt, Furnace, Hively, UADE)
  // WASM engines mix all channels inside the worklet. Tone.js channel outputs exist
  // but carry no audio. Use the isolation system to get actual per-channel audio.
  if (isoSupported) {
    try {
      const { getChannelRoutedEffectsManager: getMgr } = await import('./ChannelRoutedEffects');
      const masterIn = _getMasterEffectsInput?.();
      const manager = masterIn ? getMgr(masterIn) : getMgr();
      if (manager) {
        const success = await manager.addSidechainTap(sourceChannel, rawScInput);
        if (success) {
          scIsolationChannels.set(node, { channel: sourceChannel, scInput: rawScInput });
          connected = true;
        }
      }
    } catch { /* isolation not available */ }
  }

  // Try 2: Tone.js channel outputs (fallback — sampler-based playback)
  if (!connected && _getChannelOutput) {
    const sourceOutput = _getChannelOutput(sourceChannel);
    if (sourceOutput) {
      const rawSource = getNativeAudioNode(sourceOutput.channel);
      if (rawSource) {
        rawSource.connect(rawScInput);
        scExternalSources.set(node, rawSource);
        connected = true;
      }
    }
  }

  // Fallback: self-routing so the compressor still works
  if (!connected && 'setSelfSidechain' in node) {
    console.warn('[wireMasterSidechain] Channel', sourceChannel, 'not available — falling back to self-routing');
    (node as any).setSelfSidechain(true);
  }
}

/**
 * Rebuild entire master effects chain from config array (now async for neural effects)
 * Called when effects are added, removed, or reordered
 */
export async function rebuildMasterEffects(ctx: MasterEffectsContext, effects: EffectConfig[]): Promise<void> {
  // Fast path: if only parameters changed (no add/remove/reorder), just update params
  if (canUseParameterUpdatePath(ctx, effects)) {
    updateEffectParameters(ctx, effects);
    return;
  }

  // Version guard: if another rebuild starts while we're async, abort this one
  const myVersion = ++ctx.masterEffectsRebuildVersion;
  // Debug log only (verbose in StrictMode due to double-invocation)
  // console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ', effects:', effects.map(e => `${e.type}(${e.id})`));

  // Deep clone effects to avoid Immer proxy revocation issues during async operations
  const effectsCopy = structuredClone(effects) as EffectConfig[];

  // Snapshot old chain so we can tear it down AFTER the new chain is fully built.
  // This eliminates the audio gap that occurred when we disconnected before the async
  // effect-creation work — audio flows through the old chain until the last possible moment.
  const oldNodes = ctx.masterEffectsNodes.slice();
  const oldAnalysers = new Map(ctx.masterEffectAnalysers);
  const oldConfigs = ctx.masterEffectConfigs;

  // Filter to only enabled effects
  const enabledEffects = effectsCopy.filter((fx) => fx.enabled);

  // Check if isolation is available for the current format
  const isolationAvailable = supportsChannelIsolation(useFormatStore.getState().editorMode);

  // Separate global effects from channel-targeted effects.
  // When isolation isn't available, treat all effects as global (ignore selectedChannels).
  const globalEffects = isolationAvailable
    ? enabledEffects.filter(fx => !Array.isArray(fx.selectedChannels) || fx.selectedChannels.length === 0)
    : enabledEffects;
  const hasChannelTargeted = isolationAvailable && enabledEffects.some(
    fx => Array.isArray(fx.selectedChannels) && fx.selectedChannels.length > 0
  );

  // Channel-targeted effects are handled by the WASM isolation system
  if (hasChannelTargeted) {
    import('../../stores/useMixerStore').then(({ scheduleWasmEffectRebuild }) => {
      scheduleWasmEffectRebuild();
    }).catch(() => { /* mixer store not available */ });
  }

  /** Tear down the old chain that was snapshotted before we started async work. */
  const teardownOldChain = () => {
    ctx.masterEffectsInput.disconnect();
    oldNodes.forEach((node) => {
      try { node.disconnect(); node.dispose(); } catch { /* already disposed */ }
    });
    ctx.masterEffectsNodes = ctx.masterEffectsNodes.filter(n => !oldNodes.includes(n));
    // Clear the OLD config map (snapshotted), not the current one
    oldConfigs.clear();
    oldAnalysers.forEach(({ pre, post }) => {
      try { pre.disconnect(); } catch { /* */ }
      try { post.disconnect(); } catch { /* */ }
    });
    oldAnalysers.forEach((_, id) => ctx.masterEffectAnalysers.delete(id));
  };

  if (globalEffects.length === 0) {
    // No global effects — tear down old chain and connect directly to BLEP input
    teardownOldChain();
    ctx.masterEffectsInput.connect(ctx.blepInput);
    return;
  }

  // Ensure AudioContext is running before creating worklet-based effects (BitCrusher, etc.)
  if (Tone.getContext().state === 'suspended') {
    try { await Tone.start(); } catch { /* user gesture required */ }
  }

  // Check if a newer rebuild superseded us
  if (myVersion !== ctx.masterEffectsRebuildVersion) {
    // Debug: console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ' aborted (superseded by v' + ctx.masterEffectsRebuildVersion + ')');
    // Old chain is still live — leave it connected; the superseding rebuild will swap it out.
    return;
  }

  // Create effect nodes individually — skip any that fail (e.g. worklet on suspended context)
  const successNodes: Tone.ToneAudioNode[] = [];
  const successConfigs: EffectConfig[] = [];
  for (const config of globalEffects) {
    try {
      const node = await InstrumentFactory.createEffect(config) as Tone.ToneAudioNode;
      // Check again after each async operation
      if (myVersion !== ctx.masterEffectsRebuildVersion) {
        // Debug: console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ' aborted mid-create');
        // Dispose the node we just created since we're aborting
        try { node.disconnect(); node.dispose(); } catch { /* */ }
        // Dispose any previously created nodes in this batch
        successNodes.forEach(n => { try { n.disconnect(); n.dispose(); } catch { /* */ } });
        // Old chain is still live — leave it for the superseding rebuild to tear down
        return;
      }
      successNodes.push(node);
      successConfigs.push(config);
    } catch (error) {
      console.warn(`[ToneEngine] Failed to create effect ${config.type}, skipping:`, error);
    }
  }

  // Final version check before connecting
  if (myVersion !== ctx.masterEffectsRebuildVersion) {
    // Debug: console.log('[ToneEngine] rebuildMasterEffects v' + myVersion + ' aborted before connect');
    successNodes.forEach(n => { try { n.disconnect(); n.dispose(); } catch { /* */ } });
    return;
  }

  // New chain is fully built — atomically tear down old chain and connect new one.
  // This is the point where audio is momentarily re-routed; the gap is now a single
  // synchronous disconnect+connect block rather than the entire async creation period.
  // Build new config map BEFORE teardown so updateMasterEffectParams never sees an empty map.
  const newConfigs = new Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>();
  successNodes.forEach((node, index) => {
    const config = successConfigs[index];
    newConfigs.set(config.id, { node, config });
  });
  ctx.masterEffectConfigs = newConfigs;
  teardownOldChain();

  if (successNodes.length === 0) {
    // All effects failed — direct connection to BLEP input
    ctx.masterEffectsInput.connect(ctx.blepInput);
    return;
  }

  // Store nodes and configs, interleaving compensation gains for level normalization
  // Chain: masterEffectsInput → [effect → compGain?] → [effect → compGain?] → blepInput
  const chainNodes: Tone.ToneAudioNode[] = [];
  successNodes.forEach((node, index) => {
    const config = successConfigs[index];
    ctx.masterEffectsNodes.push(node);
    ctx.masterEffectConfigs.set(config.id, { node, config });
    chainNodes.push(node);

    // Sidechain source can be at top-level or in parameters (UI stores it in parameters)
    const scSource = config.sidechainSource ?? Number(config.parameters?.sidechainSource);
    if (typeof scSource === 'number' && scSource >= 0 && !isNaN(scSource)) {
      void wireMasterSidechain(node, scSource);
    }

    const compLinear = getEffectGainCompensation(config.type);
    if (compLinear !== 1) {
      const compGain = new Tone.Gain(compLinear);
      ctx.masterEffectsNodes.push(compGain); // tracked for disposal
      chainNodes.push(compGain);
    }
  });

  // Connect chain: masterEffectsInput → chainNodes[0] → ... → blepInput
  // Most effects are Tone.ToneAudioNodes and use Tone's .connect() directly.
  // DevilboxSynth effects (Buzzmachine) have native Web Audio .input/.output
  // GainNodes — bridge those at the native level using getNativeAudioNode.
  const isNativeSynth = (n: any): boolean => !!(n.input && n.output && !(n instanceof Tone.ToneAudioNode));

  /** Connect src → dst, bridging Tone.js ↔ native when one side is a DevilboxSynth */
  const chainConnect = (src: any, dst: any) => {
    const srcIsNative = isNativeSynth(src);
    const dstIsNative = isNativeSynth(dst);

    if (!srcIsNative && !dstIsNative) {
      // Both Tone.js — use Tone's connect (preserves internal routing)
      src.connect(dst);
    } else if (srcIsNative && dstIsNative) {
      // Both native — direct Web Audio connect
      (src.output as AudioNode).connect(dst.input as AudioNode);
    } else if (srcIsNative) {
      // Native → Tone: connect native output to Tone's native input
      const dstNative = getNativeAudioNode(dst);
      if (dstNative) (src.output as AudioNode).connect(dstNative);
      else src.output.connect(dst);
    } else {
      // Tone → Native: connect Tone's native output to native input
      const srcNative = getNativeAudioNode(src);
      if (srcNative) srcNative.connect(dst.input as AudioNode);
      else src.connect(dst.input);
    }
  };

  try {
    chainConnect(ctx.masterEffectsInput, chainNodes[0]);

    for (let i = 0; i < chainNodes.length - 1; i++) {
      chainConnect(chainNodes[i], chainNodes[i + 1]);
    }

    chainConnect(chainNodes[chainNodes.length - 1], ctx.blepInput);
  } catch (e) {
    console.error('[MasterEffectsChain] Chain connection failed:', e,
      'chainNodes:', chainNodes.map(n => n?.name || n?.constructor?.name));
    // Fallback: bypass effects entirely
    ctx.masterEffectsInput.connect(ctx.blepInput);
  }
  // Debug: log chain for diagnosing "effect does nothing" issues
  console.log('[MasterEffectsChain] ⚡ Chain connected:', successConfigs.map(c => c.type).join(' → '),
    '| nodes:', chainNodes.map(n => n?.name || n?.constructor?.name).join(' → '));

  // Create pre/post AnalyserNode taps for each effect (side-branch, non-destructive)
  const rawCtx = Tone.getContext().rawContext as AudioContext;
  for (let i = 0; i < successNodes.length; i++) {
    const config = successConfigs[i];

    const pre = rawCtx.createAnalyser();
    pre.fftSize = 2048;
    pre.smoothingTimeConstant = 0.8;

    const post = rawCtx.createAnalyser();
    post.fftSize = 2048;
    post.smoothingTimeConstant = 0.8;

    // Pre-tap: tap the signal feeding into effect[i]
    // For effect[0]: source is masterEffectsInput; for others: source is the OUTPUT of the previous effect
    const preSourceToneNode = i === 0
      ? ctx.masterEffectsInput
      : successNodes[i - 1];
    const preOutputNode = i === 0
      ? undefined
      : (successNodes[i - 1] as unknown as { output?: unknown }).output;
    const preNative = preOutputNode
      ? getNativeAudioNode(preOutputNode)
      : getNativeAudioNode(preSourceToneNode);
    if (preNative) {
      try { preNative.connect(pre); } catch (e) {
        // Non-fatal: analyser just won't show data for this effect
        console.debug('[ToneEngine] Pre-analyser tap failed for effect', config.id, e);
      }
    } else {
      // Some effect types don't expose their internal AudioNode — analyser won't display
      console.debug('[ToneEngine] Pre-analyser: could not get native node for effect', config.id);
    }

    // Post-tap: tap the output of effect[i]
    const postOutputNode = (successNodes[i] as unknown as { output?: unknown }).output;
    const postNative = postOutputNode
      ? getNativeAudioNode(postOutputNode)
      : getNativeAudioNode(successNodes[i]);
    if (postNative) {
      try { postNative.connect(post); } catch (e) {
        console.debug('[ToneEngine] Post-analyser tap failed for effect', config.id, e);
      }
    } else {
      console.debug('[ToneEngine] Post-analyser: could not get native node for effect', config.id);
    }

    ctx.masterEffectAnalysers.set(config.id, { pre, post });
  }

  // Sync playback state into freshly created noise-generating nodes
  ctx._notifyNoiseEffectsPlaying(ctx._isPlaying);
}

export function canUseParameterUpdatePath(ctx: MasterEffectsContext, newEffects: EffectConfig[]): boolean {
  // Filter to enabled effects (like rebuild does)
  const enabledNew = newEffects.filter((fx) => fx.enabled);
  // For the fast path, compare GLOBAL effects (no selectedChannels) against current chain.
  // If selectedChannels changed, we need a full rebuild to move effects between
  // the global serial chain and the per-channel WASM isolation system.
  // When isolation isn't available, all effects are global.
  const isolationAvailable = supportsChannelIsolation(useFormatStore.getState().editorMode);
  const globalNew = isolationAvailable
    ? enabledNew.filter(fx => !Array.isArray(fx.selectedChannels) || fx.selectedChannels.length === 0)
    : enabledNew;
  const currentIds = Array.from(ctx.masterEffectConfigs.keys());

  // Different number of global effects - need full rebuild
  if (globalNew.length !== currentIds.length) {
    return false;
  }

  // Check if IDs and order match
  for (let i = 0; i < globalNew.length; i++) {
    if (globalNew[i].id !== currentIds[i]) {
      return false; // Order changed or different effect
    }

    const current = ctx.masterEffectConfigs.get(currentIds[i]);
    if (!current) return false;

    // Type changed - need rebuild
    if (globalNew[i].type !== current.config.type) {
      return false;
    }
  }

  return true; // Only parameters changed - safe for fast path
}

/**
 * Update effect parameters without rebuilding the chain (fast path).
 */
export function updateEffectParameters(ctx: MasterEffectsContext, newEffects: EffectConfig[]): void {
  const enabledNew = newEffects.filter((fx) => fx.enabled);

  for (const newConfig of enabledNew) {
    const existing = ctx.masterEffectConfigs.get(newConfig.id);
    if (!existing) continue;

    // Update parameters on the existing node
    Object.entries(newConfig.parameters || {}).forEach(([key, value]) => {
      const nodeAny = existing.node as any;
      // Prefer setParam() dispatch method (WASM effects use this)
      if (typeof nodeAny.setParam === 'function') {
        nodeAny.setParam(key, value as number);
      } else if (key in existing.node) {
        // Handle Tone.js Signal/Param types
        if (nodeAny[key]?.value !== undefined) {
          nodeAny[key].value = value;
        } else {
          nodeAny[key] = value;
        }
      }
    });

    // Update wet level — respect the user's configured value (0-100 → 0-1)
    if ('wet' in existing.node && existing.config.wet !== newConfig.wet) {
      const wetValue = newConfig.wet / 100;
      const node = existing.node as any;
      if (node.wet instanceof Tone.Signal) {
        node.wet.rampTo(wetValue, 0.02);
      } else if (typeof node.wet === 'number') {
        node.wet = wetValue;
      }
    }

    // Update stored config
    existing.config = newConfig;
  }
}

/**
 * Get the audio node for a master effect by ID (used by WAM GUI rendering)
 */
export function getMasterEffectNode(ctx: MasterEffectsContext, effectId: string): Tone.ToneAudioNode | null {
  return ctx.masterEffectConfigs.get(effectId)?.node ?? null;
}

/**
 * Returns the pre/post AnalyserNodes for a master effect by ID.
 * Pre-analyser receives the signal before the effect; post receives after.
 * Returns null if the effect ID is not found (effect disabled or not yet built).
 */
export function getMasterEffectAnalysers(ctx: MasterEffectsContext, id: string): { pre: AnalyserNode; post: AnalyserNode } | null {
  return ctx.masterEffectAnalysers.get(id) ?? null;
}

/**
 * Update parameters for a single master effect
 * Called when effect parameters change (wet, specific params)
 */
export function updateMasterEffectParams(ctx: MasterEffectsContext, effectId: string, config: EffectConfig): void {
  const effectData = ctx.masterEffectConfigs.get(effectId);
  if (!effectData) {
    // Suppress during async chain rebuild — the effect will appear once the rebuild completes.
    // Only warn when no rebuild is in progress (version stable) and the map is non-empty.
    if (ctx.masterEffectConfigs.size > 0) {
      console.warn('[ToneEngine] Effect not found for update:', effectId, 'available:', [...ctx.masterEffectConfigs.keys()]);
    }
    return;
  }

  const { node, config: prevConfig } = effectData;
  // Unwrap gain-compensation wrapper to reach the real effect for wet/sidechain updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const innerNode = (node as any)._innerEffect ?? node;

  try {
    // Only update wet if it actually changed
    if (config.wet !== prevConfig.wet) {
      const wetValue = config.wet / 100;
      if ('wet' in innerNode && innerNode.wet instanceof Tone.Signal) {
        innerNode.wet.rampTo(wetValue, 0.02);
      } else if ('wet' in innerNode && typeof (innerNode as Record<string, unknown>).wet === 'number') {
        // Custom WASM effects (MoogFilter, MVerb, Leslie, SpringReverb) use a plain setter
        (innerNode as Record<string, unknown>).wet = wetValue;
      }
    }

    // Compute which parameters actually changed
    const changedParams: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(config.parameters)) {
      if (prevConfig.parameters[key] !== value) {
        changedParams[key] = value;
      }
    }

    // Re-wire sidechain routing if sidechainSource changed
    if ('sidechainSource' in changedParams && 'getSidechainInput' in innerNode) {
      void wireMasterSidechain(innerNode as Tone.ToneAudioNode, Number(changedParams.sidechainSource));
    }

    // Strip routing params before sending to DSP
    const dspParams = { ...changedParams };
    delete dspParams.sidechainSource;

    // Only apply effect params if something actually changed
    if (Object.keys(dspParams).length > 0) {
      ctx.applyEffectParametersDiff(node, config.type, dspParams);

      // If bpmSync or syncDivision changed, immediately recompute synced params
      if ('bpmSync' in changedParams || 'syncDivision' in changedParams) {
        const currentBpm = Tone.getTransport().bpm.value;
        ctx.updateBpmSyncedEffects(currentBpm).catch(() => {});
      }
    }

    // Update stored config
    effectData.config = config;

  } catch (error) {
    console.error('[ToneEngine] Failed to update effect params:', error);
  }
}

/**
 * Update parameters for a per-instrument effect in real-time
 */
export function updateInstrumentEffectParams(
  instrumentEffectNodes: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>,
  applyDiff: (node: Tone.ToneAudioNode, type: string, changed: Record<string, number | string>) => void,
  effectId: string,
  config: EffectConfig
): void {
  const effectData = instrumentEffectNodes.get(effectId);
  if (!effectData) return; // Effect not in active chain

  const { node, config: prevConfig } = effectData;
  // Unwrap gain-compensation wrapper for wet/param updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const innerNode = (node as any)._innerEffect ?? node;

  try {
    // Only update wet if it actually changed
    if (config.wet !== prevConfig.wet) {
      const wetValue = config.wet / 100;
      if ('wet' in innerNode && innerNode.wet instanceof Tone.Signal) {
        innerNode.wet.rampTo(wetValue, 0.02);
      } else if ('wet' in innerNode && typeof (innerNode as Record<string, unknown>).wet === 'number') {
        (innerNode as Record<string, unknown>).wet = wetValue;
      }
    }

    // Compute which parameters actually changed
    const changedParams: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(config.parameters)) {
      if (prevConfig.parameters[key] !== value) {
        changedParams[key] = value;
      }
    }

    // Only apply effect params if something actually changed
    if (Object.keys(changedParams).length > 0) {
      applyDiff(node, config.type, changedParams);
    }

    effectData.config = config;
  } catch (error) {
    console.error('[ToneEngine] Failed to update instrument effect params:', error);
  }
}
