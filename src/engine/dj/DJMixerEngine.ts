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
import type { DJCueEngine } from './DJCueEngine';
import type { DeckId } from './DeckEngine';

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
  private duckGain: Tone.Gain; // separate from masterGain — for mic ducking
  private limiter: Tone.Compressor;
  readonly masterMeter: Tone.Meter;

  // Master FX chain (inserted between masterGain and limiter)
  private masterEffectsNodes: Tone.ToneAudioNode[] = [];
  private masterEffectsRebuildVersion = 0;

  // Cue engine (injected from DJEngine)
  private cueEngine: DJCueEngine | null = null;
  
  // PFL connections: deck input → cue output (pre-fader tap)
  private pflConnections = new Map<DeckId, Tone.Gain>();

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
    this.duckGain = new Tone.Gain(1);

    // Limiter: fast attack, high ratio compressor acting as a brickwall
    // Attack 1ms catches crossfader transient spikes (10ms ramps) — matches DB303Synth limiter pattern
    this.limiter = new Tone.Compressor({
      threshold: -1,
      ratio: 20,
      attack: 0.001,
      release: 0.1,
      knee: 4,
    });

    this.masterMeter = new Tone.Meter({ smoothing: 0.8 });

    // Wire: inputs → masterGain → limiter → destination + meter
    try {
      this.inputA.connect(this.masterGain);
      this.inputB.connect(this.masterGain);
      this.inputC.connect(this.masterGain);  // thru — no crossfader

      // Connect raw Web Audio sampler input to Tone.js master gain
      const masterGainRaw = this.masterGain.input as AudioNode;
      this.samplerInput.connect(masterGainRaw);

      this.masterGain.connect(this.duckGain);
      this.duckGain.connect(this.limiter);
      this.limiter.toDestination();
      this.limiter.connect(this.masterMeter);
    } catch (err) {
      console.error('[DJMixerEngine] audio graph wiring failed:', err);
    }

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

    // Smooth ramp to avoid clicks — use a very short ramp even for zero
    // (2ms is fast enough to feel instant but avoids audible clicks during fast scratches)
    if (gainA < 0.001) {
      this.inputA.gain.rampTo(0, 0.002);
    } else {
      this.inputA.gain.rampTo(gainA, 0.01);
    }
    if (gainB < 0.001) {
      this.inputB.gain.rampTo(0, 0.002);
    } else {
      this.inputB.gain.rampTo(gainB, 0.01);
    }
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

  /** Duck the music (reduce master by ~8dB). Fast attack, slow release. */
  duck(): void {
    this.duckGain.gain.rampTo(0.4, 0.05); // 50ms attack → -8dB
  }

  /** Unduck — restore full volume smoothly */
  unduck(): void {
    this.duckGain.gain.rampTo(1.0, 0.3); // 300ms release — smooth fade back
  }

  getMasterLevel(): number | number[] {
    return this.masterMeter.getValue();
  }

  /** Get the master gain node (for PFL/cue routing) */
  getMasterGain(): Tone.Gain {
    return this.masterGain;
  }

  /** Inject the cue engine (called from DJEngine constructor) */
  setCueEngine(engine: DJCueEngine): void {
    this.cueEngine = engine;
  }

  /** Enable/disable PFL for a deck (pre-fader listen to headphones) */
  setPFL(deck: DeckId, enabled: boolean): void {
    if (!this.cueEngine) {
      console.warn('[DJMixerEngine] Cannot set PFL: cue engine not initialized');
      return;
    }

    const input = this.getInputForDeck(deck);
    if (!input) return;

    if (enabled) {
      // Create a gain node to tap the signal pre-fader
      let tapGain = this.pflConnections.get(deck);
      if (!tapGain) {
        tapGain = new Tone.Gain(1);
        this.pflConnections.set(deck, tapGain);
        
        // Connect deck input → tap gain → cue engine
        input.connect(tapGain);
        tapGain.connect(this.cueEngine.getCueInput());
      }
    } else {
      // Disconnect and remove the tap
      const tapGain = this.pflConnections.get(deck);
      if (tapGain) {
        tapGain.disconnect();
        tapGain.dispose();
        this.pflConnections.delete(deck);
      }
    }

    // Update cue engine PFL state
    this.cueEngine.setPFL(deck, enabled);
  }

  /** Get the input node for a specific deck */
  private getInputForDeck(deck: DeckId): Tone.Gain | null {
    switch (deck) {
      case 'A': return this.inputA;
      case 'B': return this.inputB;
      case 'C': return this.inputC;
      default: return null;
    }
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

    // Capture current first node so we can disconnect it AFTER connecting the new path
    const oldFirstNode = this.masterEffectsNodes[0] ?? this.limiter;
    const oldNodes = [...this.masterEffectsNodes];

    // Filter to enabled effects only
    const enabled = effects.filter((fx) => fx.enabled);

    if (enabled.length === 0) {
      // No effects — ZERO-GAP SWAP: masterGain → duckGain → limiter
      this.masterGain.connect(this.duckGain);
      try { this.masterGain.disconnect(oldFirstNode); } catch { /* already disconnected */ }

      // Dispose old effect nodes
      for (const node of oldNodes) {
        try { node.disconnect(); node.dispose(); } catch { /* already disposed */ }
      }
      this.masterEffectsNodes = [];
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
      // All effects failed — ZERO-GAP SWAP: masterGain → duckGain → limiter
      this.masterGain.connect(this.duckGain);
      try { this.masterGain.disconnect(oldFirstNode); } catch { /* already disconnected */ }

      for (const node of oldNodes) {
        try { node.disconnect(); node.dispose(); } catch { /* already disposed */ }
      }
      this.masterEffectsNodes = [];
      return;
    }

    // Wire new chain internally first (not yet connected to masterGain)
    try {
      for (let i = 0; i < nodes.length - 1; i++) {
        nodes[i].connect(nodes[i + 1]);
      }
      nodes[nodes.length - 1].connect(this.duckGain);

      // ZERO-GAP SWAP: connect new chain FIRST, then disconnect old
      // Web Audio allows multiple connections — for one sample frame both paths carry audio
      this.masterGain.connect(nodes[0]);
      try { this.masterGain.disconnect(oldFirstNode); } catch { /* already disconnected */ }

      // Dispose old effect nodes (already disconnected from masterGain)
      for (const node of oldNodes) {
        try { node.disconnect(); node.dispose(); } catch { /* already disposed */ }
      }

      this.masterEffectsNodes = nodes;

      console.log(`[DJMixer] Master FX chain: ${enabled.map(e => e.type).join(' → ')}`);
    } catch (err) {
      console.error('[DJMixerEngine] FX chain connection failed, bypassing effects:', err);

      // Dispose all new nodes that may be partially connected
      for (const node of nodes) {
        try { node.disconnect(); node.dispose(); } catch { /* */ }
      }

      // Ensure direct bypass: masterGain → duckGain → limiter (skip FX)
      try {
        this.masterGain.disconnect();
      } catch { /* already disconnected */ }
      this.masterGain.connect(this.duckGain);

      // Also dispose old nodes
      for (const node of oldNodes) {
        try { node.disconnect(); node.dispose(); } catch { /* already disposed */ }
      }
      this.masterEffectsNodes = [];
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    // Clean up PFL connections
    this.pflConnections.forEach((gain) => {
      gain.disconnect();
      gain.dispose();
    });
    this.pflConnections.clear();

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
