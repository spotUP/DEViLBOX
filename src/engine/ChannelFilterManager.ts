/**
 * ChannelFilterManager — Per-channel DJ-style filter sweeps for automation.
 *
 * Provides a bipolar filter position (-1 to +1) per channel:
 *   -1 = full highpass (bass removed)
 *    0 = bypass (transparent)
 *   +1 = full lowpass (treble removed)
 *
 * Uses dual HPF+LPF topology (same as DJ DeckEngine) so sweeps sound
 * musical and natural. Works with ALL formats — no WASM changes needed
 * since filters are pure Web Audio nodes on the output chain.
 *
 * Architecture:
 *   [channel effects chain output] → HPF → LPF → [Tone.Channel]
 *
 * Native BiquadFilterNodes, not Tone.Filter: each Tone.Filter carries its
 * frequency, Q, gain and detune as Tone signals, which are ConstantSourceNodes
 * - sources that run every audio quantum whether anything plays. Two per
 * channel came to 136 always-running sources (measured 2026-09-28), part of
 * an audio thread ~50 % busy with the song stopped. Wire these with
 * connectAudio (they are raw AudioNodes).
 */

import { getDevilboxAudioContext } from '@utils/audio-context';

interface ChannelFilter {
  hpf: BiquadFilterNode;
  lpf: BiquadFilterNode;
  position: number;   // -1..+1
  resonance: number;  // 0.5..15
}

const RAMP_TIME = 0.03; // 30ms for smooth sweeps

/** Glide an AudioParam to `value` over roughly `seconds`. */
function glide(param: AudioParam, value: number, seconds: number): void {
  const ctx = getDevilboxAudioContext();
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, seconds / 3);
}

function biquad(type: BiquadFilterType, frequency: number): BiquadFilterNode {
  const f = getDevilboxAudioContext().createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = 1;
  return f;
}

class ChannelFilterManager {
  private filters: Map<number, ChannelFilter> = new Map();

  /**
   * Get or create the HPF+LPF pair for a channel.
   * Returns { hpf, lpf } — caller wires them into the audio chain.
   */
  getOrCreate(channelIndex: number): ChannelFilter {
    let cf = this.filters.get(channelIndex);
    if (!cf) {
      cf = {
        hpf: biquad('highpass', 20),
        lpf: biquad('lowpass', 20000),
        position: 0,
        resonance: 1,
      };
      // Chain: HPF → LPF
      cf.hpf.connect(cf.lpf);
      this.filters.set(channelIndex, cf);
    }
    return cf;
  }

  /**
   * Check if a channel has filter nodes created.
   */
  has(channelIndex: number): boolean {
    return this.filters.has(channelIndex);
  }

  /**
   * Get the input node (HPF) for wiring into the channel chain.
   */
  getInput(channelIndex: number): BiquadFilterNode {
    return this.getOrCreate(channelIndex).hpf;
  }

  /**
   * Get the output node (LPF) for wiring into the channel chain.
   */
  getOutput(channelIndex: number): BiquadFilterNode {
    return this.getOrCreate(channelIndex).lpf;
  }

  /**
   * Set filter position: -1 (full HP) to +1 (full LP), 0 = bypass.
   * Matches DJ DeckEngine.setFilterPosition() behavior exactly.
   */
  setPosition(channelIndex: number, position: number): void {
    const cf = this.getOrCreate(channelIndex);
    cf.position = Math.max(-1, Math.min(1, position));

    if (cf.position >= 0) {
      // LPF active: sweep 20kHz → 100Hz as position goes 0 → 1
      const lpfFreq = Math.max(80, 20000 * Math.pow(100 / 20000, cf.position));
      glide(cf.lpf.frequency, lpfFreq, RAMP_TIME);
      glide(cf.hpf.frequency, 20, RAMP_TIME);
    } else {
      // HPF active: sweep 20Hz → 10kHz as position goes 0 → -1
      const amount = -cf.position;
      const hpfFreq = Math.min(18000, 20 * Math.pow(10000 / 20, amount));
      glide(cf.hpf.frequency, hpfFreq, RAMP_TIME);
      glide(cf.lpf.frequency, 20000, RAMP_TIME);
    }
  }

  /**
   * Set filter resonance (Q factor). Higher = more pronounced sweep.
   * Value 0-1 normalized → mapped to Q 0.5..15.
   */
  setResonance(channelIndex: number, resonance01: number): void {
    const cf = this.getOrCreate(channelIndex);
    cf.resonance = 0.5 + resonance01 * 9.5; // 0-1 → 0.5-10 (capped to prevent biquad instability)
    glide(cf.hpf.Q, cf.resonance, 0.05);
    glide(cf.lpf.Q, cf.resonance, 0.05);
  }

  /**
   * Set filter position or resonance on ALL active channels at once.
   * Used by MIDI controller routing for global filter sweeps.
   */
  setAll(filterParam: 'position' | 'resonance', value: number): void {
    for (const channelIndex of this.filters.keys()) {
      if (filterParam === 'position') {
        this.setPosition(channelIndex, value);
      } else {
        this.setResonance(channelIndex, value);
      }
    }
  }

  /**
   * Dispose all filter nodes for cleanup.
   */
  disposeAll(): void {
    for (const cf of this.filters.values()) {
      try { cf.hpf.disconnect(); } catch { /* ok */ }
      try { cf.lpf.disconnect(); } catch { /* ok */ }
    }
    this.filters.clear();
  }

  /**
   * Dispose a single channel's filter.
   */
  dispose(channelIndex: number): void {
    const cf = this.filters.get(channelIndex);
    if (!cf) return;
    try { cf.hpf.disconnect(); } catch { /* ok */ }
    try { cf.lpf.disconnect(); } catch { /* ok */ }
    this.filters.delete(channelIndex);
  }
}

// Singleton
let instance: ChannelFilterManager | null = null;

export function getChannelFilterManager(): ChannelFilterManager {
  if (!instance) instance = new ChannelFilterManager();
  return instance;
}

export type { ChannelFilter };
