/**
 * ChannelRoutedEffects — Per-channel effect routing via parallel send.
 *
 * Architecture: NO disconnects, NO volume manipulation. Instead:
 *   - Selected channels get an additional parallel connection:
 *     channel → subMix → effect(wet=100%) → effectOut → masterInput
 *   - The effect's own wet/dry controls determine how much processing is applied
 *   - The channel's normal path (channel → masterInput) stays untouched
 *   - effectOut gain compensates for signal doubling (set to effect wet level)
 *
 * This is a parallel send architecture (like a send bus), which is the safest
 * approach since we never disconnect or modify existing connections.
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { InstrumentFactory } from '../InstrumentFactory';
import type { ChannelOutput } from './ChannelRouting';

interface RoutedChannel {
  channelIndex: number;
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

      // Force the effect to 100% wet internally — we control send level via subMix
      try {
        if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
          ((node as any).wet as Tone.Signal).value = 1;
        } else if ('wet' in node && typeof (node as any).wet === 'number') {
          (node as any).wet = 1;
        }
      } catch { /* some effects don't have wet */ }

      const subMix = new Tone.Gain(config.wet / 100); // send level = effect wet%
      const channels: RoutedChannel[] = [];

      // Connect: subMix → effect → masterInput
      subMix.connect(node);
      node.connect(this.masterInput);

      for (const ch of config.selectedChannels) {
        const output = this.getChannelOutput(ch);
        if (!output) continue;

        try {
          // Parallel send: tap the channel output into the subMix
          // (channel → masterInput stays untouched)
          output.channel.connect(subMix);
          channels.push({ channelIndex: ch });
          console.log(`[ChannelRoutedEffects] ✓ ch${ch + 1}: send to ${config.type} (${config.wet}% wet)`);
        } catch (e) {
          console.warn(`[ChannelRoutedEffects] Failed to send ch${ch}:`, e);
        }
      }

      this.effects.push({ config, node, subMix, channels });
      handledIds.push(config.id);
    }

    return handledIds;
  }

  teardown(): void {
    for (const effect of this.effects) {
      for (const { channelIndex } of effect.channels) {
        const output = this.getChannelOutput(channelIndex);
        if (!output) continue;
        try { output.channel.disconnect(effect.subMix); } catch { /* */ }
      }

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
