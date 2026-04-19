/**
 * ChannelEffectsManager — Per-channel insert effects for the mixer.
 *
 * Creates and manages audio effect chains per channel. Each channel can have
 * up to 4 insert effects. The effect chain is inserted between the channel's
 * output and the master bus.
 *
 * Architecture:
 *   instrument → channelGain → channelPan → [effect1 → effect2 → ...] → masterInput
 *
 * Uses the same effect creation functions as the master effects chain.
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import type { DubBus } from './dub/DubBus';
import { createEffect } from './factories/EffectFactory';
import { applyEffectParametersDiff } from './tone/EffectParameterEngine';

export const MAX_CHANNEL_FX_SLOTS = 4;

interface ChannelFXChain {
  effects: Array<{
    config: EffectConfig;
    node: Tone.ToneAudioNode;
    enabled: boolean;
  }>;
  input: Tone.Gain;
  output: Tone.Gain;
}

class ChannelEffectsManager {
  private chains: Map<number, ChannelFXChain> = new Map();
  // Per-channel dub-send taps. Each tap sits on the channel's FX-chain output,
  // fans audio into DubBus.inputNode at the channel's dubSend gain. Created
  // lazily on first non-zero setChannelDubSend call; destroyed when amount → 0.
  private dubSendTaps: Map<number, Tone.Gain> = new Map();

  /**
   * Get or create the effect chain for a channel.
   * The chain has an input and output GainNode that can be wired into the signal path.
   */
  getOrCreateChain(channelIndex: number): ChannelFXChain {
    let chain = this.chains.get(channelIndex);
    if (!chain) {
      chain = {
        effects: [],
        input: new Tone.Gain(1),
        output: new Tone.Gain(1),
      };
      // Direct passthrough when no effects
      chain.input.connect(chain.output);
      this.chains.set(channelIndex, chain);
    }
    return chain;
  }

  /**
   * Add an effect to a channel's insert chain.
   */
  async addEffect(channelIndex: number, config: EffectConfig): Promise<void> {
    const chain = this.getOrCreateChain(channelIndex);
    if (chain.effects.length >= MAX_CHANNEL_FX_SLOTS) return;

    const node = await createEffect(config) as Tone.ToneAudioNode;
    if (!node) return;

    chain.effects.push({ config, node, enabled: true });
    this.rebuildChainRouting(chain);

    // Wire sidechain source if this effect supports external sidechain input
    const scSource = config.sidechainSource ?? Number(config.parameters?.sidechainSource);
    if (!isNaN(scSource) && scSource >= 0) {
      await this.wireSidechain(node, scSource);
    }
  }

  /**
   * Remove an effect from a channel's insert chain by index.
   */
  removeEffect(channelIndex: number, effectIndex: number): void {
    const chain = this.chains.get(channelIndex);
    if (!chain || effectIndex < 0 || effectIndex >= chain.effects.length) return;

    const removed = chain.effects.splice(effectIndex, 1)[0];
    if (removed) {
      try { removed.node.disconnect(); } catch { /* already disconnected */ }
      removed.node.dispose();
    }
    this.rebuildChainRouting(chain);
  }

  /**
   * Toggle bypass for an effect.
   */
  toggleEffect(channelIndex: number, effectIndex: number): void {
    const chain = this.chains.get(channelIndex);
    if (!chain || !chain.effects[effectIndex]) return;
    chain.effects[effectIndex].enabled = !chain.effects[effectIndex].enabled;
    this.rebuildChainRouting(chain);
  }

  /**
   * Move an effect within the chain (reorder).
   */
  moveEffect(channelIndex: number, fromIndex: number, toIndex: number): void {
    const chain = this.chains.get(channelIndex);
    if (!chain) return;
    const [item] = chain.effects.splice(fromIndex, 1);
    if (item) {
      chain.effects.splice(toIndex, 0, item);
      this.rebuildChainRouting(chain);
    }
  }

  /**
   * Get effects list for a channel (for UI display).
   */
  getEffects(channelIndex: number): Array<{ config: EffectConfig; enabled: boolean }> {
    const chain = this.chains.get(channelIndex);
    if (!chain) return [];
    return chain.effects.map(e => ({ config: e.config, enabled: e.enabled }));
  }

  /**
   * Get the input node for a channel's effect chain.
   * Wire the channel's audio output to this node.
   */
  getChainInput(channelIndex: number): Tone.Gain {
    return this.getOrCreateChain(channelIndex).input;
  }

  /**
   * Get the output node for a channel's effect chain.
   * Wire this to the master bus.
   */
  getChainOutput(channelIndex: number): Tone.Gain {
    return this.getOrCreateChain(channelIndex).output;
  }

  /**
   * Rebuild internal routing when effects are added/removed/toggled.
   */
  private rebuildChainRouting(chain: ChannelFXChain): void {
    // Disconnect everything
    try { chain.input.disconnect(); } catch { /* ok */ }
    for (const fx of chain.effects) {
      try { fx.node.disconnect(); } catch { /* ok */ }
    }

    // Build chain: input → [enabled effects] → output
    const enabledEffects = chain.effects.filter(e => e.enabled);

    if (enabledEffects.length === 0) {
      // Direct passthrough
      chain.input.connect(chain.output);
      return;
    }

    // Input → first effect
    chain.input.connect(enabledEffects[0].node);

    // Chain effects together
    for (let i = 0; i < enabledEffects.length - 1; i++) {
      enabledEffects[i].node.connect(enabledEffects[i + 1].node);
    }

    // Last effect → output
    enabledEffects[enabledEffects.length - 1].node.connect(chain.output);
  }

  /**
   * Get a specific effect's audio node for parameter updates.
   */
  getEffectNode(channelIndex: number, effectIndex: number): Tone.ToneAudioNode | null {
    const chain = this.chains.get(channelIndex);
    if (!chain || effectIndex < 0 || effectIndex >= chain.effects.length) return null;
    return chain.effects[effectIndex].node;
  }

  /**
   * Update parameters for a specific channel insert effect.
   * Mirrors MasterEffectsChain.updateMasterEffectParams() pattern.
   */
  updateEffectParams(channelIndex: number, effectIndex: number, config: EffectConfig): void {
    const chain = this.chains.get(channelIndex);
    if (!chain || effectIndex < 0 || effectIndex >= chain.effects.length) return;

    const effect = chain.effects[effectIndex];
    const prevConfig = effect.config;

    // Update wet if changed
    if (config.wet !== prevConfig.wet) {
      const wetValue = config.wet / 100;
      if ('wet' in effect.node && effect.node.wet instanceof Tone.Signal) {
        effect.node.wet.rampTo(wetValue, 0.02);
      } else if ('wet' in effect.node && typeof (effect.node as Record<string, unknown>).wet === 'number') {
        (effect.node as Record<string, unknown>).wet = wetValue;
      }
    }

    // Compute changed parameters
    const changedParams: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(config.parameters)) {
      if (prevConfig.parameters[key] !== value) {
        changedParams[key] = value;
      }
    }

    // Re-wire sidechain routing if sidechainSource changed
    if ('sidechainSource' in changedParams && 'getSidechainInput' in effect.node) {
      void this.wireSidechain(effect.node as Tone.ToneAudioNode, Number(changedParams.sidechainSource));
    }

    // Apply diff to audio node (skip sidechainSource — it's a routing param, not a DSP param)
    const dspParams = { ...changedParams };
    delete dspParams.sidechainSource;
    if (Object.keys(dspParams).length > 0) {
      applyEffectParametersDiff(effect.node, config.type, dspParams);
    }

    // Update stored config
    effect.config = config;
  }

  /**
   * Wire or re-wire the sidechain input of an effect to a source channel.
   */
  private async wireSidechain(node: Tone.ToneAudioNode, sourceChannel: number): Promise<void> {
    if (!('getSidechainInput' in node)) return;
    const scInput = (node as any).getSidechainInput() as Tone.Gain;

    // Disconnect any existing sidechain source
    try { scInput.disconnect(); } catch { /* nothing connected */ }

    if (sourceChannel < 0 || isNaN(sourceChannel)) return;

    try {
      const { getToneEngine } = await import('./ToneEngine');
      const engine = getToneEngine();
      const sourceOutput = engine.getChannelOutputByIndex(sourceChannel);
      if (sourceOutput) {
        sourceOutput.channel.connect(scInput);
      }
    } catch {
      // Engine not ready
    }
  }

  /**
   * Set the dub-send level for a channel. Creates the tap on first non-zero
   * call; updates its gain on subsequent calls; tears down when amount=0.
   *
   * The tap reads from the channel's FX-chain output (post-effects) and writes
   * into the shared DubBus via getDubBus(). Mirrors the pattern used by
   * DrumPadEngine.attachSynthPadDubSend().
   *
   * Also registers the tap with DubBus so openChannelTap (echoThrow) can
   * address this channel's send by ID.
   */
  setChannelDubSend(channelIndex: number, amount: number): void {
    const clamped = Math.max(0, Math.min(1, amount));
    const existing = this.dubSendTaps.get(channelIndex);

    if (clamped <= 0) {
      // Teardown path
      if (!existing) return;
      try { existing.disconnect(); existing.dispose(); } catch { /* ok */ }
      this.dubSendTaps.delete(channelIndex);
      try { this.getDubBus()?.unregisterChannelTap(channelIndex); } catch { /* ok */ }
      return;
    }

    if (existing) {
      // Update gain smoothly — no node rebuild
      existing.gain.rampTo(clamped, 0.02);
      return;
    }

    // Create path: first non-zero call for this channel
    const dubBus = this.getDubBus();
    if (!dubBus) {
      console.warn(`[ChannelFX] setChannelDubSend(ch=${channelIndex}): no DubBus available — engine not ready yet`);
      return;
    }
    const chain = this.getOrCreateChain(channelIndex);
    const tap = new Tone.Gain(clamped);
    chain.output.connect(tap);
    // Tone.Gain → native GainNode: use Tone.connect with cast (same pattern as DubBus internal wiring)
    Tone.connect(tap, dubBus.inputNode as unknown as Tone.InputNode);
    this.dubSendTaps.set(channelIndex, tap);
    dubBus.registerChannelTap(channelIndex, tap);
  }

  /**
   * Resolve the shared DubBus via DrumPadEngine. Returns null until the engine
   * has been created (first pad trigger or DJ view open). Uses a lazy dynamic
   * import of getDrumPadEngine to avoid a hard module-load circular dep between
   * the engine layer and the hook layer.
   */
  private getDubBus(): DubBus | null {
    try {
      // Lazy import: getDrumPadEngine is only needed at runtime, not at module
      // load time. The dynamic require avoids a load-time circular dependency
      // since useMIDIPadRouting imports DrumPadEngine which doesn't import us.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDrumPadEngine } = require('../hooks/drumpad/useMIDIPadRouting') as {
        getDrumPadEngine: () => import('../engine/drumpad/DrumPadEngine').DrumPadEngine | null;
      };
      return getDrumPadEngine()?.getDubBus() ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Dispose all channel effect chains.
   */
  disposeAll(): void {
    // Tear down dub-send taps first (they connect output → dubBus.inputNode)
    for (const tap of this.dubSendTaps.values()) {
      try { tap.disconnect(); tap.dispose(); } catch { /* ok */ }
    }
    this.dubSendTaps.clear();
    for (const chain of this.chains.values()) {
      for (const fx of chain.effects) {
        try { fx.node.disconnect(); } catch { /* ok */ }
        fx.node.dispose();
      }
      chain.input.disconnect();
      chain.output.disconnect();
      chain.input.dispose();
      chain.output.dispose();
    }
    this.chains.clear();
  }

  /**
   * Dispose a single channel's effects.
   */
  disposeChannel(channelIndex: number): void {
    // Tear down dub-send tap for this channel if present
    const tap = this.dubSendTaps.get(channelIndex);
    if (tap) {
      try { tap.disconnect(); tap.dispose(); } catch { /* ok */ }
      this.dubSendTaps.delete(channelIndex);
      try { this.getDubBus()?.unregisterChannelTap(channelIndex); } catch { /* ok */ }
    }
    const chain = this.chains.get(channelIndex);
    if (!chain) return;
    for (const fx of chain.effects) {
      try { fx.node.disconnect(); } catch { /* ok */ }
      fx.node.dispose();
    }
    chain.input.disconnect();
    chain.output.disconnect();
    chain.input.dispose();
    chain.output.dispose();
    this.chains.delete(channelIndex);
  }
}

// Singleton
let instance: ChannelEffectsManager | null = null;

export function getChannelEffectsManager(): ChannelEffectsManager {
  if (!instance) {
    instance = new ChannelEffectsManager();
  }
  return instance;
}
