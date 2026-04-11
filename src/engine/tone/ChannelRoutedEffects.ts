/**
 * ChannelRoutedEffects — Per-channel effect routing via worklet isolation.
 *
 * Architecture:
 *   For each channel-routed effect, a secondary libopenmpt worklet instance
 *   is spawned playing ONLY the target channels. The main engine mutes those
 *   channels to avoid doubling. The isolated audio routes through the effect
 *   before joining the master bus.
 *
 *   Main worklet (ch1 muted) → separationNode → masterInput → [global FX] → output
 *   Isolation worklet (ch1 only) → effect → masterInput → [global FX] → output
 *
 * This gives TRUE per-channel effect isolation using the existing libopenmpt
 * mute API — no C++ changes needed.
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { InstrumentFactory } from '../InstrumentFactory';
import { ChannelIsolationNode } from './ChannelIsolationNode';

interface RoutedEffect {
  config: EffectConfig;
  effectNode: Tone.ToneAudioNode;
  isolationNode: ChannelIsolationNode;
  channels: number[];
}

export class ChannelRoutedEffectsManager {
  private effects: RoutedEffect[] = [];
  private masterInput: Tone.Gain;
  /** Combined mask of ALL channels currently isolated (for updating main engine). */
  private _isolatedChannelsMask = 0;

  constructor(masterInput: Tone.Gain) {
    this.masterInput = masterInput;
  }

  /**
   * Rebuild channel-routed effects using isolation worklets.
   * Returns { routedIds, isolatedChannelsMask } — the caller must update the
   * main engine's mute mask to exclude isolatedChannelsMask.
   */
  async rebuild(
    configs: EffectConfig[],
    moduleBuffer: ArrayBuffer | null,
    audioContext: AudioContext | null,
    currentPosition: { order: number; row: number } | null,
  ): Promise<{ routedIds: string[]; isolatedChannelsMask: number }> {
    this.teardown();

    const routedIds: string[] = [];
    let combinedMask = 0;

    // Can't create isolation nodes without module data or audio context
    if (!moduleBuffer || !audioContext) {
      console.log('[ChannelRoutedEffects] No module buffer or AudioContext — cannot create isolation nodes');
      return { routedIds, isolatedChannelsMask: 0 };
    }

    for (const config of configs) {
      if (!config.enabled || !config.selectedChannels?.length) continue;

      // Create isolation worklet for this effect's channels
      const isolationNode = new ChannelIsolationNode(
        audioContext,
        moduleBuffer,
        config.selectedChannels,
      );

      const ok = await isolationNode.init(currentPosition ?? undefined);
      if (!ok) {
        console.warn(`[ChannelRoutedEffects] Failed to init isolation node for ${config.type}`);
        isolationNode.dispose();
        continue;
      }

      // Create the effect node
      let effectNode: Tone.ToneAudioNode;
      try {
        effectNode = await InstrumentFactory.createEffect(config) as Tone.ToneAudioNode;
      } catch (e) {
        console.warn(`[ChannelRoutedEffects] Failed to create ${config.type}:`, e);
        isolationNode.dispose();
        continue;
      }

      // Set effect wet level
      try {
        if ('wet' in effectNode && (effectNode as any).wet instanceof Tone.Signal) {
          ((effectNode as any).wet as Tone.Signal).value = config.wet / 100;
        }
      } catch { /* some effects don't have wet */ }

      // Connect: isolationNode.output → effectNode → masterInput
      // Bridge native AudioNode (isolation GainNode) to Tone.js effect input
      const effectInput = (effectNode as any).input as AudioNode | undefined;
      if (effectInput) {
        isolationNode.output.connect(effectInput);
      } else {
        // Fallback: try connecting to the node directly
        const rawNode = (effectNode as any)._gainNode || (effectNode as any)._waveShaperNode || effectNode;
        try {
          isolationNode.output.connect(rawNode as AudioNode);
        } catch {
          console.warn(`[ChannelRoutedEffects] Cannot connect isolation to ${config.type} — no input node`);
          isolationNode.dispose();
          try { effectNode.disconnect(); effectNode.dispose(); } catch { /* */ }
          continue;
        }
      }
      effectNode.connect(this.masterInput);

      // Track this routed effect
      this.effects.push({
        config,
        effectNode,
        isolationNode,
        channels: [...config.selectedChannels],
      });
      routedIds.push(config.id);

      // Accumulate the isolation mask
      combinedMask |= isolationNode.channelMask;

      console.log(`[ChannelRoutedEffects] ✓ ${config.type} isolated on ch[${config.selectedChannels.map(c => c + 1).join(',')}]`);
    }

    this._isolatedChannelsMask = combinedMask;
    return { routedIds, isolatedChannelsMask: combinedMask };
  }

  /** Get the combined mask of all isolated channels (for updating main engine mute mask). */
  get isolatedChannelsMask(): number {
    return this._isolatedChannelsMask;
  }

  /** Forward seek to all isolation nodes (call when main engine seeks). */
  seekTo(order: number, row: number): void {
    for (const effect of this.effects) {
      effect.isolationNode.seekTo(order, row);
    }
  }

  /** Forward pause to all isolation nodes. */
  pause(): void {
    for (const effect of this.effects) {
      effect.isolationNode.pause();
    }
  }

  /** Forward unpause to all isolation nodes. */
  unpause(): void {
    for (const effect of this.effects) {
      effect.isolationNode.unpause();
    }
  }

  teardown(): void {
    for (const effect of this.effects) {
      effect.isolationNode.dispose();
      try { effect.effectNode.disconnect(); } catch { /* */ }
      try { effect.effectNode.dispose(); } catch { /* */ }
    }
    this.effects = [];
    this._isolatedChannelsMask = 0;
  }

  getEffectNode(effectId: string): Tone.ToneAudioNode | null {
    return this.effects.find(e => e.config.id === effectId)?.effectNode ?? null;
  }

  getRoutedConfigs(): Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }> {
    const map = new Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>();
    for (const e of this.effects) {
      map.set(e.config.id, { node: e.effectNode, config: e.config });
    }
    return map;
  }

  /** Whether any effects are currently using isolation nodes. */
  get hasActiveIsolation(): boolean {
    return this.effects.length > 0;
  }

  dispose(): void {
    this.teardown();
  }
}

