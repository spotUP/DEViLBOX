/**
 * SendBusManager — Auxiliary send/return buses for parallel effects processing.
 *
 * Creates up to 4 return buses, each with its own effect chain + volume/pan.
 * Channels send audio to these buses via send level knobs.
 * Return buses mix into the master effects input.
 *
 * Architecture:
 *   channel → sendGain[busN] (controlled by send level) → returnBus[N] → returnEffects → master
 *
 * Common usage:
 *   Bus A: Shared reverb (all channels send varying amounts)
 *   Bus B: Shared delay
 *   Bus C: Parallel compression
 *   Bus D: Special FX
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { createEffect } from './factories/EffectFactory';

export const NUM_SEND_BUSES = 4;

interface SendBus {
  name: string;
  input: Tone.Gain;    // Sum of all channel sends
  output: Tone.Gain;   // After effects, before master
  volume: Tone.Gain;   // Return level
  effects: Array<{ config: EffectConfig; node: Tone.ToneAudioNode }>;
  muted: boolean;
}

class SendBusManager {
  private buses: SendBus[] = [];
  private sendGainCache = new Map<string, Tone.Gain>(); // key: `${channelIndex}-${busIndex}`

  /**
   * Initialize send buses. Call after ToneEngine is ready.
   * @param masterEffectsInput — The node to connect return bus outputs to
   */
  init(masterEffectsInput: Tone.Gain): void {
    this.dispose(); // Clean up any existing buses

    const names = ['Send A', 'Send B', 'Send C', 'Send D'];
    for (let i = 0; i < NUM_SEND_BUSES; i++) {
      const input = new Tone.Gain(1);
      const output = new Tone.Gain(1);
      const volume = new Tone.Gain(1);

      // Default routing: input → volume → output → master
      input.connect(volume);
      volume.connect(output);
      output.connect(masterEffectsInput);

      this.buses.push({
        name: names[i],
        input,
        output,
        volume,
        effects: [],
        muted: false,
      });
    }
  }

  /**
   * Get the input node for a send bus (channels connect their send gains here).
   */
  getBusInput(busIndex: number): Tone.Gain | null {
    return this.buses[busIndex]?.input ?? null;
  }

  /**
   * Set return level for a bus.
   */
  setBusVolume(busIndex: number, level: number): void {
    const bus = this.buses[busIndex];
    if (!bus) return;
    bus.volume.gain.rampTo(level, 0.05);
  }

  /**
   * Mute/unmute a return bus.
   */
  setBusMute(busIndex: number, muted: boolean): void {
    const bus = this.buses[busIndex];
    if (!bus) return;
    bus.muted = muted;
    bus.output.gain.rampTo(muted ? 0 : 1, 0.05);
  }

  /**
   * Add an effect to a return bus's chain.
   */
  async addBusEffect(busIndex: number, config: EffectConfig): Promise<void> {
    const bus = this.buses[busIndex];
    if (!bus) return;

    const node = await createEffect(config) as Tone.ToneAudioNode;
    if (!node) return;

    bus.effects.push({ config, node });
    this.rebuildBusRouting(bus);
  }

  /**
   * Remove an effect from a return bus.
   */
  removeBusEffect(busIndex: number, effectIndex: number): void {
    const bus = this.buses[busIndex];
    if (!bus || effectIndex < 0 || effectIndex >= bus.effects.length) return;

    const removed = bus.effects.splice(effectIndex, 1)[0];
    if (removed) {
      try { removed.node.disconnect(); } catch { /* ok */ }
      removed.node.dispose();
    }
    this.rebuildBusRouting(bus);
  }

  /**
   * Get bus info for UI.
   */
  getBusInfo(): Array<{ name: string; muted: boolean; effectCount: number }> {
    return this.buses.map(b => ({
      name: b.name,
      muted: b.muted,
      effectCount: b.effects.length,
    }));
  }

  /**
   * Get or create a send gain for a channel → bus connection.
   * On first call, connects the channel's Tone.Channel to the bus input.
   */
  getOrCreateSendGainForChannel(
    channelIndex: number,
    busIndex: number,
    channelNode: Tone.Channel
  ): Tone.Gain | null {
    const bus = this.buses[busIndex];
    if (!bus) return null;

    const key = `${channelIndex}-${busIndex}`;
    let sendGain = this.sendGainCache.get(key);
    if (!sendGain) {
      sendGain = new Tone.Gain(0);
      channelNode.connect(sendGain);
      sendGain.connect(bus.input);
      this.sendGainCache.set(key, sendGain);
    }
    return sendGain;
  }

  private rebuildBusRouting(bus: SendBus): void {
    // Disconnect input from everything
    try { bus.input.disconnect(); } catch { /* ok */ }
    for (const fx of bus.effects) {
      try { fx.node.disconnect(); } catch { /* ok */ }
    }

    if (bus.effects.length === 0) {
      // Direct: input → volume → output
      bus.input.connect(bus.volume);
    } else {
      // input → effects chain → volume
      bus.input.connect(bus.effects[0].node);
      for (let i = 0; i < bus.effects.length - 1; i++) {
        bus.effects[i].node.connect(bus.effects[i + 1].node);
      }
      bus.effects[bus.effects.length - 1].node.connect(bus.volume);
    }
  }

  dispose(): void {
    for (const gain of this.sendGainCache.values()) {
      try { gain.disconnect(); } catch { /* ok */ }
      gain.dispose();
    }
    this.sendGainCache.clear();

    for (const bus of this.buses) {
      for (const fx of bus.effects) {
        try { fx.node.disconnect(); } catch { /* ok */ }
        fx.node.dispose();
      }
      bus.input.disconnect();
      bus.output.disconnect();
      bus.volume.disconnect();
      bus.input.dispose();
      bus.output.dispose();
      bus.volume.dispose();
    }
    this.buses = [];
  }
}

// Singleton
let instance: SendBusManager | null = null;

export function getSendBusManager(): SendBusManager {
  if (!instance) {
    instance = new SendBusManager();
  }
  return instance;
}
