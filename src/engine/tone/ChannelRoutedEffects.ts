/**
 * ChannelRoutedEffects — Pre-mix per-channel effect routing for master effects.
 *
 * When a master effect has `selectedChannels`, it can't run in the post-mix
 * master chain (channels are already summed to stereo). Instead, selected
 * channels get a parallel wet path through the effect:
 *
 *   selected channels → gain(0) on direct path, gain(1) on wet path → effect → masterInput
 *   non-selected channels → masterInput (unchanged)
 *
 * Architecture: Instead of disconnect/reconnect (fragile with Tone.js wrappers),
 * we insert a gain gate on the direct path and add a parallel wet connection.
 * The channel stays connected to masterInput, but its direct gain is set to 0
 * while a parallel connection through the effect carries the signal.
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { InstrumentFactory } from '../InstrumentFactory';
import type { ChannelOutput } from './ChannelRouting';

interface RoutedChannel {
  channelIndex: number;
  /** Gain node inserted between channel and masterInput to mute the direct path */
  directGate: Tone.Gain;
}

interface RoutedEffect {
  config: EffectConfig;
  node: Tone.ToneAudioNode;
  subMix: Tone.Gain;
  channels: RoutedChannel[];
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
    this.teardown();

    const handledIds: string[] = [];

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
      const channels: RoutedChannel[] = [];

      // Connect: subMix → effect → masterInput
      subMix.connect(node);
      node.connect(this.masterInput);

      for (const ch of config.selectedChannels) {
        const output = this.getChannelOutput(ch);
        if (!output) continue;

        try {
          // Insert a gate: channel → directGate(0) → masterInput
          // This replaces the existing channel → masterInput connection
          const directGate = new Tone.Gain(0); // mute direct path

          // First: disconnect channel from masterInput
          output.channel.disconnect(this.masterInput);
          // Reconnect through the gate (muted)
          output.channel.connect(directGate);
          directGate.connect(this.masterInput);
          // Also connect channel to subMix (the wet/effect path)
          output.channel.connect(subMix);

          channels.push({ channelIndex: ch, directGate });
          console.log(`[ChannelRoutedEffects] ✓ ch${ch + 1}: routed through ${config.type}`);
        } catch (e) {
          console.warn(`[ChannelRoutedEffects] Failed to reroute ch${ch}:`, e);
        }
      }

      this.effects.push({ config, node, subMix, channels });
      handledIds.push(config.id);

      console.log(
        `[ChannelRoutedEffects] ${config.type} routed to channels: [${channels.map(c => c.channelIndex + 1).join(',')}]`
      );
    }

    return handledIds;
  }

  /**
   * Tear down all channel-routed effects and restore direct connections.
   */
  teardown(): void {
    for (const effect of this.effects) {
      for (const { channelIndex, directGate } of effect.channels) {
        const output = this.getChannelOutput(channelIndex);
        if (!output) continue;

        try {
          // Disconnect channel from subMix and directGate
          try { output.channel.disconnect(effect.subMix); } catch { /* */ }
          try { output.channel.disconnect(directGate); } catch { /* */ }
          // Dispose gate
          try { directGate.disconnect(); directGate.dispose(); } catch { /* */ }
          // Restore direct connection
          output.channel.connect(this.masterInput);
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

  getEffectNode(effectId: string): Tone.ToneAudioNode | null {
    return this.effects.find(e => e.config.id === effectId)?.node ?? null;
  }

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
