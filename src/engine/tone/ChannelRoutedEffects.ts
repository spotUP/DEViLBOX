/**
 * ChannelRoutedEffects — Per-channel effect routing via multi-output worklet.
 *
 * Architecture: Any engine implementing IsolationCapableEngine can provide
 * per-channel isolation. The worklet has 5 outputs: output[0] = main mix,
 * outputs[1-4] = isolation slots. Each slot renders ONLY the target channels.
 *
 * Supported engines:
 *   - LibOpenMPT: secondary openmpt module instances in lockstep
 *   - FurnaceDispatch: mute-and-re-render per slot (same sequencer instance)
 *   - Hively: secondary player instances with channel gain isolation
 *   - UADE: internal Paula per-channel buffer splitting
 *
 *   worklet output[0] (main mix, isolated ch muted) → gainNode → synthBus → master
 *   worklet output[1] (ch1 only) → BitCrusher → masterEffectsInput
 *   worklet output[2] (ch3 only) → Reverb → masterEffectsInput
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { createEffect } from '../factories/EffectFactory';
import { getNativeAudioNode } from '@utils/audio-context';
import { applyEffectParametersDiff } from './EffectParameterEngine';

/**
 * Interface for any WASM engine that supports per-channel isolation via
 * multi-output AudioWorkletNode. Engines implement this to participate in
 * the per-channel effects routing system.
 */
export interface IsolationCapableEngine {
  addIsolation(slotIndex: number, channelMask: number): void;
  removeIsolation(slotIndex: number): void;
  diagIsolation?(): void;
  getWorkletNode(): AudioWorkletNode | null;
  getAudioContext(): AudioContext | null;
  isAvailable(): boolean;
}

interface IsolationSlot {
  slotIndex: number;
  channels: number[];
  channelMask: number;
  effectConfigs: EffectConfig[];
  effectNodes: (Tone.ToneAudioNode | { input: AudioNode; output: AudioNode; dispose(): void })[];
  /** Native GainNode connected between worklet output and effect chain */
  outputGain: GainNode;
}

/** Returns true if node is a native DevilboxSynth (has input/output GainNodes but is not a ToneAudioNode) */
const isNativeSynth = (n: any): boolean => !!(n.input && n.output && !(n instanceof Tone.ToneAudioNode));

/** Connect src → dst, bridging Tone.js ↔ native DevilboxSynth nodes */
const chainConnect = (src: any, dst: any) => {
  const srcIsNative = isNativeSynth(src) || src instanceof AudioNode;
  const dstIsNative = isNativeSynth(dst) || dst instanceof AudioNode;

  if (!srcIsNative && !dstIsNative) {
    src.connect(dst);
  } else if (srcIsNative && dstIsNative) {
    const srcOut = src instanceof AudioNode ? src : src.output as AudioNode;
    const dstIn = dst instanceof AudioNode ? dst : dst.input as AudioNode;
    srcOut.connect(dstIn);
  } else if (srcIsNative) {
    const srcOut = src instanceof AudioNode ? src : src.output as AudioNode;
    const dstNative = getNativeAudioNode(dst);
    if (dstNative) srcOut.connect(dstNative);
    else srcOut.connect(dst);
  } else {
    const dstIn = dst instanceof AudioNode ? dst : dst.input as AudioNode;
    const srcNative = getNativeAudioNode(src);
    if (srcNative) srcNative.connect(dstIn);
    else src.connect(dstIn);
  }
};

export class ChannelRoutedEffectsManager {
  private slots: (IsolationSlot | null)[] = [null, null, null, null];
  private masterEffectsInput: Tone.Gain;

  /**
   * Sidechain tap system — allows sidechain compressors to tap per-channel audio
   * from WASM engines via the isolation system.
   *
   * sidechainConsumers: channelIndex → set of AudioNodes (sidechain inputs) to feed.
   *   Survives teardown/rebuild so taps are re-established automatically.
   * sidechainTaps: channelIndex → active isolation slot + outputGain for that channel.
   *   Torn down and rebuilt alongside per-channel effect slots.
   */
  private sidechainConsumers = new Map<number, Set<AudioNode>>();
  private sidechainTaps = new Map<number, { slotIndex: number; outputGain: GainNode }>();

  constructor(masterEffectsInput: Tone.Gain) {
    this.masterEffectsInput = masterEffectsInput;
  }

  // ── Sidechain tap API ─────────────────────────────────────────────

  /**
   * Register an AudioNode (sidechain input) as a consumer of isolated channel audio.
   * Allocates an isolation slot if one isn't already active for this channel.
   * Returns true if the tap is connected (or was already connected).
   */
  async addSidechainTap(channelIndex: number, scInputNode: AudioNode): Promise<boolean> {
    let consumers = this.sidechainConsumers.get(channelIndex);
    if (!consumers) {
      consumers = new Set();
      this.sidechainConsumers.set(channelIndex, consumers);
    }
    consumers.add(scInputNode);

    // If we already have an active tap for this channel, just connect the new consumer
    const existing = this.sidechainTaps.get(channelIndex);
    if (existing) {
      try { existing.outputGain.connect(scInputNode); } catch { /* */ }
      return true;
    }

    // Allocate a new isolation slot
    return this._allocateSidechainSlot(channelIndex);
  }

  /**
   * Unregister an AudioNode from a sidechain tap. Frees the isolation slot
   * when the last consumer for a channel is removed.
   */
  removeSidechainTap(channelIndex: number, scInputNode: AudioNode): void {
    const consumers = this.sidechainConsumers.get(channelIndex);
    if (!consumers) return;
    consumers.delete(scInputNode);

    // Disconnect this specific consumer
    const tap = this.sidechainTaps.get(channelIndex);
    if (tap) {
      try { tap.outputGain.disconnect(scInputNode); } catch { /* */ }
    }

    if (consumers.size === 0) {
      this.sidechainConsumers.delete(channelIndex);
      // No more consumers — free the isolation slot
      if (tap) {
        try { tap.outputGain.disconnect(); } catch { /* */ }
        this.sidechainTaps.delete(channelIndex);
        void getActiveIsolationEngine().then(e => {
          if (e) e.removeIsolation(tap.slotIndex);
        });
        console.log(`[ChannelRoutedEffects] Released sidechain tap: slot ${tap.slotIndex} (ch${channelIndex + 1})`);
      }
    }
  }

  /** Allocate an isolation slot for a sidechain tap, connect worklet output → consumers. */
  private async _allocateSidechainSlot(channelIndex: number, engine?: IsolationCapableEngine): Promise<boolean> {
    if (!engine) engine = (await getActiveIsolationEngine()) ?? undefined;
    if (!engine?.isAvailable()) return false;

    const workletNode = engine.getWorkletNode();
    const audioContext = engine.getAudioContext();
    if (!workletNode || !audioContext) return false;

    // Find a free slot (not used by effects or other sidechain taps)
    const usedSlots = new Set<number>();
    for (const slot of this.slots) { if (slot) usedSlots.add(slot.slotIndex); }
    for (const tap of this.sidechainTaps.values()) usedSlots.add(tap.slotIndex);

    let freeSlot = -1;
    for (let i = 0; i < 4; i++) {
      if (!usedSlots.has(i)) { freeSlot = i; break; }
    }
    if (freeSlot < 0) {
      console.warn('[ChannelRoutedEffects] No free isolation slots for sidechain tap ch' + (channelIndex + 1));
      return false;
    }

    const channelMask = 1 << channelIndex;
    engine.addIsolation(freeSlot, channelMask);

    const outputGain = audioContext.createGain();
    outputGain.gain.value = 1;

    try {
      workletNode.connect(outputGain, freeSlot + 1);
    } catch (e) {
      console.warn('[ChannelRoutedEffects] Sidechain tap connect failed:', e);
      engine.removeIsolation(freeSlot);
      return false;
    }

    // Connect to all registered consumers for this channel (sidechain inputs)
    const consumers = this.sidechainConsumers.get(channelIndex);
    if (consumers) {
      for (const node of consumers) {
        try { outputGain.connect(node); } catch { /* */ }
      }
    }

    // Route the isolated channel back into the mix AFTER the master effects chain.
    // Isolation removes the channel from worklet output[0] (main mix). We re-inject it
    // at blepInput (post-effects) so it bypasses the sidechain compressor — otherwise
    // the kick would duck itself (the compressor detects the kick AND ducks its own input).
    try {
      const { getPostEffectsInput } = await import('./MasterEffectsChain');
      const postFx = getPostEffectsInput();
      if (postFx) {
        const postFxNative = getNativeAudioNode(postFx);
        if (postFxNative) outputGain.connect(postFxNative);
      } else {
        // Fallback: route to masterEffectsInput (kick will be ducked, but at least audible)
        const masterIn = getNativeAudioNode(this.masterEffectsInput);
        if (masterIn) outputGain.connect(masterIn);
      }
    } catch {
      const masterIn = getNativeAudioNode(this.masterEffectsInput);
      if (masterIn) outputGain.connect(masterIn);
    }

    this.sidechainTaps.set(channelIndex, { slotIndex: freeSlot, outputGain });
    console.log(`[ChannelRoutedEffects] Sidechain tap: slot ${freeSlot} → ch${channelIndex + 1} (routed back to mix)`);
    return true;
  }

  // ── Per-channel effect routing ──────────────────────────────────

  /**
   * Rebuild per-channel effect routing based on mixer store state.
   * Connects worklet outputs[1..4] → per-channel effect chains → masterEffectsInput.
   * @param channelEffects Map of channel index → effect configs to apply
   * @param engine The isolation-capable engine to route through (auto-detected if omitted)
   */
  async rebuild(
    channelEffects: Map<number, EffectConfig[]>,
    engine?: IsolationCapableEngine,
  ): Promise<void> {
    console.log(`[ChannelRoutedEffects] rebuild() called with ${channelEffects.size} channels:`,
      [...channelEffects.entries()].map(([ch, fx]) => `ch${ch}: ${fx.length} effects (${fx.filter(e=>e.enabled).length} enabled)`));

    // If no engine passed, try to find one
    if (!engine) {
      engine = await getActiveIsolationEngine() ?? undefined;
    }
    if (!engine) { console.warn('[ChannelRoutedEffects] No isolation-capable engine available'); return; }
    if (!engine.isAvailable()) { console.warn('[ChannelRoutedEffects] Engine not available'); return; }

    const workletNode = engine.getWorkletNode();
    if (!workletNode) { console.warn('[ChannelRoutedEffects] No worklet node'); return; }

    // Tear down existing slots
    this.teardown(engine);

    let slotIdx = 0;
    for (const [channelIndex, effects] of channelEffects) {
      if (slotIdx >= 4) {
        console.warn('[ChannelRoutedEffects] Only 4 isolation slots available, skipping remaining channels');
        break;
      }

      const enabledEffects = effects.filter(e => e.enabled);
      if (enabledEffects.length === 0) continue;

      const channelMask = 1 << channelIndex;

      // Tell worklet to create isolation module for this channel
      engine.addIsolation(slotIdx, channelMask);

      // Create effect nodes (may be Tone.js or native DevilboxSynth like BuzzmachineSynth)
      const effectNodes: IsolationSlot['effectNodes'] = [];
      for (const config of enabledEffects) {
        try {
          const node = await createEffect(config) as Tone.ToneAudioNode | { input: AudioNode; output: AudioNode; dispose(): void };
          if (node) {
            if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
              ((node as any).wet as Tone.Signal).value = config.wet / 100;
            }
            effectNodes.push(node);
          }
        } catch (e) {
          console.warn(`[ChannelRoutedEffects] Failed to create ${config.type}:`, e);
        }
      }

      if (effectNodes.length === 0) {
        engine.removeIsolation(slotIdx);
        continue;
      }

      // Create output gain for this slot
      const audioContext = engine.getAudioContext();
      if (!audioContext) { engine.removeIsolation(slotIdx); continue; }
      const outputGain = audioContext.createGain();
      outputGain.gain.value = 1;

      // Connect worklet output[slotIdx+1] → outputGain → effect chain → masterEffectsInput
      const outputIndex = slotIdx + 1;
      try {
        workletNode.connect(outputGain, outputIndex);
        console.log(`[ChannelRoutedEffects] Connected worklet output[${outputIndex}] → outputGain → effects`);
      } catch (e) {
        console.warn(`[ChannelRoutedEffects] Failed to connect worklet output ${outputIndex}:`, e);
        engine.removeIsolation(slotIdx);
        for (const n of effectNodes) { try { n.dispose(); } catch { /* */ } }
        continue;
      }

      // Chain: outputGain → effect1 → effect2 → ... → masterEffectsInput
      // Uses chainConnect to bridge Tone.js ↔ native DevilboxSynth (Buzzmachine) nodes
      chainConnect(outputGain, effectNodes[0]);
      for (let i = 0; i < effectNodes.length - 1; i++) {
        chainConnect(effectNodes[i], effectNodes[i + 1]);
      }
      chainConnect(effectNodes[effectNodes.length - 1], this.masterEffectsInput);

      this.slots[slotIdx] = {
        slotIndex: slotIdx,
        channels: [channelIndex],
        channelMask,
        effectConfigs: enabledEffects,
        effectNodes,
        outputGain,
      };

      console.log(`[ChannelRoutedEffects] Slot ${slotIdx}: ch${channelIndex + 1} → ${enabledEffects.map(e => e.type).join(' → ')} (mask=0x${channelMask.toString(16)}) via worklet output[${outputIndex}]`);
      slotIdx++;
    }

    // Re-establish sidechain taps that were torn down
    if (this.sidechainConsumers.size > 0) {
      for (const channelIndex of this.sidechainConsumers.keys()) {
        await this._allocateSidechainSlot(channelIndex, engine);
      }
    }

    // Request diagnostic from worklet after a short delay to let messages settle
    const activeSlots = slotIdx + this.sidechainTaps.size;
    if (activeSlots > 0 && engine.diagIsolation) {
      const diagEngine = engine;
      setTimeout(() => diagEngine.diagIsolation!(), 200);
    }
  }

  /**
   * Update parameters for a specific effect on a specific channel without rebuilding.
   */
  updateEffectParams(channelIndex: number, effectIndex: number, config: EffectConfig): void {
    const slot = this.slots.find(s => s && s.channels.includes(channelIndex));
    if (!slot || effectIndex >= slot.effectNodes.length) return;

    const node = slot.effectNodes[effectIndex];

    // Update wet
    if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
      ((node as any).wet as Tone.Signal).rampTo(config.wet / 100, 0.02);
    }

    // Apply parameter diff
    const prevConfig = slot.effectConfigs[effectIndex];
    const changed: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(config.parameters)) {
      if (prevConfig.parameters[key] !== value) {
        changed[key] = value;
      }
    }
    if (Object.keys(changed).length > 0) {
      applyEffectParametersDiff(node as Tone.ToneAudioNode, config.type, changed);
    }

    slot.effectConfigs[effectIndex] = config;
  }

  /**
   * Tear down all isolation slots and disconnect effects.
   * Sidechain consumer requests are preserved so taps are re-established on rebuild.
   */
  teardown(engine?: { removeIsolation: (slotIndex: number) => void }): void {
    // Tear down per-channel effect slots
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;

      // Disconnect effects
      for (const node of slot.effectNodes) {
        try { (node as any).disconnect?.(); } catch { /* */ }
        try { node.dispose(); } catch { /* */ }
      }
      try { slot.outputGain.disconnect(); } catch { /* */ }

      // Tell engine to remove the worklet isolation module
      if (engine) {
        engine.removeIsolation(i);
      }

      this.slots[i] = null;
    }

    // Tear down sidechain tap slots (but keep sidechainConsumers for rebuild)
    for (const [, tap] of this.sidechainTaps) {
      try { tap.outputGain.disconnect(); } catch { /* */ }
      if (engine) engine.removeIsolation(tap.slotIndex);
    }
    this.sidechainTaps.clear();
  }

  /** Whether any slots are active. */
  get hasActiveSlots(): boolean {
    return this.slots.some(s => s !== null);
  }

  /** Get the slot for a specific channel (if isolated). */
  getSlotForChannel(channelIndex: number): IsolationSlot | null {
    return this.slots.find(s => s && s.channels.includes(channelIndex)) ?? null;
  }

  async dispose(): Promise<void> {
    try {
      const engine = await getActiveIsolationEngine();
      if (engine) {
        this.teardown(engine);
      } else {
        this.teardown();
      }
    } catch {
      this.teardown();
    }
    // On dispose, also clear consumer requests (they won't survive a new manager)
    this.sidechainConsumers.clear();
  }
}

/**
 * Registry of engine resolvers keyed by editor mode.
 * Each resolver returns an IsolationCapableEngine if that engine is
 * currently active and available, or null otherwise.
 */
const engineResolversByMode: Record<string, () => Promise<IsolationCapableEngine | null>> = {
  classic: async () => {
    const { LibopenmptEngine } = await import('../libopenmpt/LibopenmptEngine');
    if (LibopenmptEngine.hasInstance()) {
      const engine = LibopenmptEngine.getInstance();
      if (engine.isAvailable()) return engine;
    }
    const { PreTrackerEngine } = await import('../pretracker/PreTrackerEngine');
    if (PreTrackerEngine.hasInstance()) {
      return PreTrackerEngine.getInstance() as IsolationCapableEngine;
    }
    return null;
  },
};

/**
 * Register an engine resolver for per-channel isolation, keyed by editor mode.
 * Called by engines that implement IsolationCapableEngine during their module init.
 */
export function registerIsolationEngineResolver(
  resolver: () => Promise<IsolationCapableEngine | null>,
  editorMode?: string,
): void {
  if (editorMode) {
    engineResolversByMode[editorMode] = resolver;
  } else {
    // Legacy: add as fallback (checked after mode-specific resolver)
    _fallbackResolvers.push(resolver);
  }
}
const _fallbackResolvers: (() => Promise<IsolationCapableEngine | null>)[] = [];

/**
 * Detect which isolation-capable engine is currently active and available.
 * Uses the format store's editorMode to pick the right engine directly,
 * avoiding false positives from stale singleton instances.
 */
export async function getActiveIsolationEngine(): Promise<IsolationCapableEngine | null> {
  // Get current editor mode from format store
  let editorMode = 'classic';
  try {
    const { useFormatStore } = await import('../../stores/useFormatStore');
    editorMode = useFormatStore.getState().editorMode;
  } catch { /* fallback to classic */ }

  // Try mode-specific resolver first
  const modeResolver = engineResolversByMode[editorMode];
  if (modeResolver) {
    try {
      const engine = await modeResolver();
      if (engine) return engine;
    } catch { /* resolver failed */ }
  }

  // Fallback: try all registered resolvers
  for (const resolver of _fallbackResolvers) {
    try {
      const engine = await resolver();
      if (engine) return engine;
    } catch { /* engine module not loaded */ }
  }
  return null;
}

/**
 * Editor modes that support per-channel isolation via multi-output worklet.
 * Used by UI to gate the channel routing selector.
 */
const ISOLATION_CAPABLE_MODES = new Set(['classic', 'furnace', 'hively', 'tfmx']);

/**
 * Check if the current format/editor mode supports per-channel isolation.
 * Returns true for formats with multi-output worklet engines (LibOpenMPT, Furnace).
 * Returns false for single-output WASM engines (SID, Hively, UADE, etc.).
 */
export function supportsChannelIsolation(editorMode: string): boolean {
  return ISOLATION_CAPABLE_MODES.has(editorMode);
}

// Singleton
let routedEffectsInstance: ChannelRoutedEffectsManager | null = null;

export function getChannelRoutedEffectsManager(masterEffectsInput?: Tone.Gain): ChannelRoutedEffectsManager {
  if (!routedEffectsInstance && masterEffectsInput) {
    routedEffectsInstance = new ChannelRoutedEffectsManager(masterEffectsInput);
  }
  return routedEffectsInstance!;
}

export function disposeChannelRoutedEffectsManager(): void {
  if (routedEffectsInstance) {
    void routedEffectsInstance.dispose();
    routedEffectsInstance = null;
  }
}
