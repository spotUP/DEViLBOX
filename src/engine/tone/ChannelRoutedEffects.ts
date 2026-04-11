/**
 * ChannelRoutedEffects — Pre-mix per-channel effect routing for master effects.
 *
 * When a master effect has `selectedChannels`, it can't run in the post-mix
 * master chain (channels are already summed to stereo). Instead, selected
 * channels are disconnected from masterInput and routed through a sub-mix:
 *
 *   selected channels → subMix → effect → masterInput
 *   non-selected channels → masterInput (unchanged)
 *   masterInput → [global master effects] → output
 *
 * Uses native Web Audio API disconnect(destination) for surgical routing,
 * bypassing Tone.js wrappers which may not support targeted disconnection.
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { InstrumentFactory } from '../InstrumentFactory';
import type { ChannelOutput } from './ChannelRouting';

/** Get the underlying AudioNode from a Tone node by traversing the output chain */
function getNativeOutput(toneNode: Tone.ToneAudioNode): AudioNode | null {
  let current: any = toneNode;
  // Traverse: ToneAudioNode.output → .output → ... until we find a native AudioNode
  for (let i = 0; i < 5; i++) {
    if (!current) return null;
    // If this is already a native AudioNode, return it
    if (current instanceof AudioNode) return current;
    // Tone.Gain wraps a native GainNode as _gainNode
    if (current._gainNode instanceof AudioNode) return current._gainNode;
    // Traverse to .output
    current = current.output;
  }
  return null;
}

function getNativeInput(toneNode: Tone.ToneAudioNode): AudioNode | null {
  let current: any = toneNode;
  for (let i = 0; i < 5; i++) {
    if (!current) return null;
    if (current instanceof AudioNode) return current;
    if (current._gainNode instanceof AudioNode) return current._gainNode;
    current = current.input;
  }
  return null;
}

interface RoutedEffect {
  config: EffectConfig;
  node: Tone.ToneAudioNode;
  subMix: Tone.Gain;
  rerouted: number[]; // channel indices we disconnected from masterInput
}

export class ChannelRoutedEffectsManager {
  private effects: RoutedEffect[] = [];
  private masterInput: Tone.Gain;
  private getChannelOutput: (index: number) => ChannelOutput | null;

  constructor(
    masterInput: Tone.Gain,
    getChannelOutput: (index: number) => ChannelOutput | null,
  ) {
    this.masterInput = masterInput;
    this.getChannelOutput = getChannelOutput;
  }

  /**
   * Rebuild all channel-routed effects. Called during rebuildMasterEffects.
   * Returns the configs that were handled (so they can be excluded from the global chain).
   */
  async rebuild(configs: EffectConfig[]): Promise<string[]> {
    // Tear down old routing first
    this.teardown();

    const handledIds: string[] = [];
    const masterInputNative = getNativeInput(this.masterInput);

    for (const config of configs) {
      if (!config.enabled || !config.selectedChannels?.length) continue;

      let node: Tone.ToneAudioNode;
      try {
        node = await InstrumentFactory.createEffect(config) as Tone.ToneAudioNode;
      } catch (e) {
        console.warn(`[ChannelRoutedEffects] Failed to create ${config.type}:`, e);
        continue;
      }

      const subMix = new Tone.Gain(1);
      const rerouted: number[] = [];

      // Connect: subMix → effect → masterInput
      subMix.connect(node);
      node.connect(this.masterInput);

      // Reroute selected channels using native Web Audio API for surgical disconnect
      for (const ch of config.selectedChannels) {
        const output = this.getChannelOutput(ch);
        if (!output) continue;

        const channelNativeOut = getNativeOutput(output.channel);
        const subMixNativeIn = getNativeInput(subMix);

        if (!channelNativeOut || !masterInputNative || !subMixNativeIn) {
          console.warn(`[ChannelRoutedEffects] Could not get native nodes for ch${ch}`,
            { channelNativeOut: !!channelNativeOut, masterInputNative: !!masterInputNative, subMixNativeIn: !!subMixNativeIn });
          continue;
        }

        try {
          // Add the new route first (avoids brief dropout)
          channelNativeOut.connect(subMixNativeIn);
          // Then surgically disconnect ONLY the masterInput connection
          channelNativeOut.disconnect(masterInputNative);
          rerouted.push(ch);
          console.log(`[ChannelRoutedEffects] ✓ ch${ch}: native disconnect+connect OK`);
        } catch (e) {
          console.warn(`[ChannelRoutedEffects] Failed to reroute ch${ch}:`, e);
          // If disconnect failed, undo the connect to avoid signal doubling
          try { channelNativeOut.disconnect(subMixNativeIn); } catch { /* */ }
        }
      }

      this.effects.push({ config, node, subMix, rerouted });
      handledIds.push(config.id);

      console.log(
        `[ChannelRoutedEffects] ${config.type} routed to channels: [${rerouted.map(c => c + 1).join(',')}]`
      );
    }

    return handledIds;
  }

  /**
   * Tear down all channel-routed effects and restore direct connections.
   */
  teardown(): void {
    const masterInputNative = getNativeInput(this.masterInput);

    for (const effect of this.effects) {
      // Restore direct channel → masterInput connections using native API
      for (const ch of effect.rerouted) {
        const output = this.getChannelOutput(ch);
        if (!output) continue;

        const channelNativeOut = getNativeOutput(output.channel);
        const subMixNativeIn = getNativeInput(effect.subMix);

        if (!channelNativeOut || !masterInputNative) continue;

        try {
          // Disconnect from sub-mix first, then restore direct path
          if (subMixNativeIn) {
            channelNativeOut.disconnect(subMixNativeIn);
          }
          channelNativeOut.connect(masterInputNative);
        } catch {
          // Connection may have already been changed
        }
      }

      // Dispose effect and sub-mix
      try { effect.node.disconnect(); } catch { /* */ }
      try { effect.node.dispose(); } catch { /* */ }
      try { effect.subMix.disconnect(); } catch { /* */ }
      try { effect.subMix.dispose(); } catch { /* */ }
    }
    this.effects = [];
  }

  /**
   * Get a routed effect's audio node (for parameter updates).
   */
  getEffectNode(effectId: string): Tone.ToneAudioNode | null {
    return this.effects.find(e => e.config.id === effectId)?.node ?? null;
  }

  /**
   * Get all routed effect configs (for parameter update path).
   */
  getRoutedConfigs(): Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }> {
    const map = new Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>();
    for (const e of this.effects) {
      map.set(e.config.id, { node: e.node, config: e.config });
    }
    return map;
  }

  dispose(): void {
    this.teardown();
  }
}
