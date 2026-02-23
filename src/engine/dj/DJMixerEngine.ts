/**
 * DJMixerEngine - Crossfader, master gain, master FX chain, and limiter
 *
 * Audio graph:
 *   Deck A channelGain ──> inputA (crossfader) ──┐
 *                                                  ├──> masterGain ──> [master FX] ──> limiter ──> mainOut
 *   Deck B channelGain ──> inputB (crossfader) ──┘
 *   Deck C channelGain ──> inputC (thru, no xfader) ──┘
 *   Sampler (DrumPads) ──> samplerInput (thru) ──────┘
 *
 * Master FX preset effects (reverb, delay, chorus, etc.) are inserted between
 * masterGain and limiter via rebuildMasterEffects().
 *
 * Crossfader curves:
 *   - linear: gainA = 1-pos, gainB = pos
 *   - cut: hard cut at ~5% from each end (DJ battle style)
 *   - smooth: constant-power (cos/sin)
 *
 * Deck C bypasses the crossfader entirely — always audible at channel volume.
 * Sampler input also bypasses the crossfader — always at unity gain.
 */

import * as Tone from 'tone';
import { InstrumentFactory } from '@/engine/InstrumentFactory';
import type { EffectConfig } from '@typedefs/instrument';

export type CrossfaderCurve = 'linear' | 'cut' | 'smooth';

export class DJMixerEngine {
  // Crossfader inputs — Deck engines connect to these
  readonly inputA: Tone.Gain;
  readonly inputB: Tone.Gain;
  // Deck C thru input — bypasses crossfader, always at unity
  readonly inputC: Tone.Gain;
  // Sampler thru input — bypasses crossfader, for DrumPadEngine in DJ mode
  readonly samplerInput: GainNode;

  // Master chain
  private masterGain: Tone.Gain;
  private limiter: Tone.Compressor;
  readonly masterMeter: Tone.Meter;

  // Master FX chain (inserted between masterGain and limiter)
  private masterEffectsNodes: Tone.ToneAudioNode[] = [];
  private masterEffectsRebuildVersion = 0;

  // State
  private position = 0.5;
  private curve: CrossfaderCurve = 'smooth';

  constructor() {
    this.inputA = new Tone.Gain(1);
    this.inputB = new Tone.Gain(1);
    this.inputC = new Tone.Gain(1);

    // Raw Web Audio GainNode for DrumPadEngine (which uses raw Web Audio, not Tone.js)
    const ctx = Tone.getContext().rawContext;
    this.samplerInput = (ctx as AudioContext).createGain();
    this.samplerInput.gain.value = 1;

    this.masterGain = new Tone.Gain(1);

    // Limiter: fast attack, high ratio compressor acting as a brickwall
    this.limiter = new Tone.Compressor({
      threshold: -1,
      ratio: 20,
      attack: 0.003,
      release: 0.1,
    });

    this.masterMeter = new Tone.Meter({ smoothing: 0.8 });

    // Wire: inputs → masterGain → limiter → destination + meter
    this.inputA.connect(this.masterGain);
    this.inputB.connect(this.masterGain);
    this.inputC.connect(this.masterGain);  // thru — no crossfader

    // Connect raw Web Audio sampler input to Tone.js master gain
    const masterGainRaw = this.masterGain.input as AudioNode;
    this.samplerInput.connect(masterGainRaw);

    this.masterGain.connect(this.limiter);
    this.limiter.toDestination();
    this.limiter.connect(this.masterMeter);

    // Apply initial crossfader position
    this.applyCrossfader();
  }

  // ==========================================================================
  // CROSSFADER
  // ==========================================================================

  setCrossfader(position: number): void {
    this.position = Math.max(0, Math.min(1, position));
    this.applyCrossfader();
  }

  getCrossfader(): number {
    return this.position;
  }

  setCurve(curve: CrossfaderCurve): void {
    this.curve = curve;
    this.applyCrossfader();
  }

  getCurve(): CrossfaderCurve {
    return this.curve;
  }

  private applyCrossfader(): void {
    let gainA: number;
    let gainB: number;

    switch (this.curve) {
      case 'linear':
        gainA = 1 - this.position;
        gainB = this.position;
        break;

      case 'cut': {
        // Hard cut: full volume except near the opposite end
        const cutThreshold = 0.05;
        gainA = this.position > (1 - cutThreshold) ? 0 : 1;
        gainB = this.position < cutThreshold ? 0 : 1;
        break;
      }

      case 'smooth':
      default:
        // Constant power: cos/sin curve (no volume dip in the middle)
        gainA = Math.cos(this.position * Math.PI / 2);
        gainB = Math.sin(this.position * Math.PI / 2);
        break;
    }

    // Smooth ramp to avoid clicks
    this.inputA.gain.rampTo(gainA, 0.01);
    this.inputB.gain.rampTo(gainB, 0.01);
  }

  // ==========================================================================
  // MASTER
  // ==========================================================================

  setMasterVolume(value: number): void {
    this.masterGain.gain.rampTo(Math.max(0, Math.min(1.5, value)), 0.02);
  }

  getMasterVolume(): number {
    return this.masterGain.gain.value;
  }

  getMasterLevel(): number | number[] {
    return this.masterMeter.getValue();
  }

  /** Get the master gain node (for PFL/cue routing) */
  getMasterGain(): Tone.Gain {
    return this.masterGain;
  }

  // ==========================================================================
  // MASTER FX CHAIN
  // ==========================================================================

  /**
   * Rebuild the master effects chain from a list of EffectConfig.
   * Inserts effects between masterGain and limiter.
   * Called when the user selects/changes FX presets in the DJ view.
   */
  async rebuildMasterEffects(effects: EffectConfig[]): Promise<void> {
    const myVersion = ++this.masterEffectsRebuildVersion;

    // Disconnect masterGain's output (preserves upstream from deck inputs)
    this.masterGain.disconnect();

    // Dispose old effect nodes
    for (const node of this.masterEffectsNodes) {
      try { node.disconnect(); node.dispose(); } catch { /* already disposed */ }
    }
    this.masterEffectsNodes = [];

    // Filter to enabled effects only
    const enabled = effects.filter((fx) => fx.enabled);

    if (enabled.length === 0) {
      // No effects — direct path
      this.masterGain.connect(this.limiter);
      return;
    }

    // Ensure AudioContext is running
    if (Tone.getContext().state === 'suspended') {
      try { await Tone.start(); } catch { /* user gesture required */ }
    }

    // Create effect nodes
    const nodes: Tone.ToneAudioNode[] = [];
    for (const config of enabled) {
      if (myVersion !== this.masterEffectsRebuildVersion) {
        // Superseded by newer rebuild — abort
        nodes.forEach(n => { try { n.disconnect(); n.dispose(); } catch { /* */ } });
        return;
      }
      try {
        const node = await InstrumentFactory.createEffect(config) as Tone.ToneAudioNode;
        nodes.push(node);
      } catch (err) {
        console.warn(`[DJMixer] Failed to create effect ${config.type}:`, err);
      }
    }

    // Final version check
    if (myVersion !== this.masterEffectsRebuildVersion) {
      nodes.forEach(n => { try { n.disconnect(); n.dispose(); } catch { /* */ } });
      return;
    }

    if (nodes.length === 0) {
      this.masterGain.connect(this.limiter);
      return;
    }

    this.masterEffectsNodes = nodes;

    // Chain: masterGain → fx[0] → fx[1] → ... → limiter
    this.masterGain.connect(nodes[0]);
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].connect(nodes[i + 1]);
    }
    nodes[nodes.length - 1].connect(this.limiter);

    console.log(`[DJMixer] Master FX chain: ${enabled.map(e => e.type).join(' → ')}`);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    // Dispose FX nodes
    for (const node of this.masterEffectsNodes) {
      try { node.disconnect(); node.dispose(); } catch { /* */ }
    }
    this.masterEffectsNodes = [];

    this.inputA.dispose();
    this.inputB.dispose();
    this.inputC.dispose();
    this.samplerInput.disconnect();
    this.masterGain.dispose();
    this.limiter.dispose();
    this.masterMeter.dispose();
  }
}
