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
   * Dispose all channel effect chains.
   */
  disposeAll(): void {
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
