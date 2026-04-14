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

  // Master FX chain (inserted between masterGain and duckGain)
  // Each chain is wrapped in a chainGain for crossfading:
  //   masterGain → chainGain → [FX nodes] → duckGain
  // When no FX: masterGain → chainGain → duckGain
  private chainGain: Tone.Gain;
  private masterEffectsNodes: Tone.ToneAudioNode[] = [];
  private masterEffectsRebuildVersion = 0;
  private crossfadeCleanupTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.chainGain = new Tone.Gain(1);

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

      this.masterGain.connect(this.chainGain);
      this.chainGain.connect(this.duckGain);
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
   * Uses true parallel crossfade: old chain fades out while new chain fades in.
   *
   * Audio graph during crossfade (both paths active simultaneously):
   *   masterGain → oldChainGain(1→0) → [old FX] → duckGain
   *   masterGain → newChainGain(0→1) → [new FX] → duckGain
   *
   * Equal-power crossfade (cos/sin) keeps perceived loudness constant.
   */
  async rebuildMasterEffects(effects: EffectConfig[]): Promise<void> {
    const myVersion = ++this.masterEffectsRebuildVersion;

    // Cancel any pending crossfade cleanup from a previous switch
    if (this.crossfadeCleanupTimer) {
      clearTimeout(this.crossfadeCleanupTimer);
      this.crossfadeCleanupTimer = null;
    }

    // Snapshot old chain
    const oldChainGain = this.chainGain;
    const oldNodes = [...this.masterEffectsNodes];

    // Filter to enabled effects only
    const enabled = effects.filter((fx) => fx.enabled);

    // Ensure AudioContext is running
    if (Tone.getContext().state === 'suspended') {
      try { await Tone.start(); } catch { /* user gesture required */ }
    }

    // Create new effect nodes
    const nodes: Tone.ToneAudioNode[] = [];
    for (const config of enabled) {
      if (myVersion !== this.masterEffectsRebuildVersion) {
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

    // Build new chain: newChainGain → [FX nodes] → duckGain
    const newChainGain = new Tone.Gain(0); // starts silent
    try {
      if (nodes.length > 0) {
        newChainGain.connect(nodes[0]);
        for (let i = 0; i < nodes.length - 1; i++) {
          nodes[i].connect(nodes[i + 1]);
        }
        nodes[nodes.length - 1].connect(this.duckGain);
      } else {
        newChainGain.connect(this.duckGain);
      }
      // Connect masterGain → newChainGain (parallel with old chain)
      this.masterGain.connect(newChainGain);
    } catch (err) {
      console.error('[DJMixerEngine] FX chain connection failed, keeping old chain:', err);
      nodes.forEach(n => { try { n.disconnect(); n.dispose(); } catch { /* */ } });
      try { newChainGain.disconnect(); newChainGain.dispose(); } catch { /* */ }
      return;
    }

    // Update state to point to new chain
    this.chainGain = newChainGain;
    this.masterEffectsNodes = nodes;

    // Compute crossfade duration from BPM (~2 beats)
    let fadeSec = 1.0; // fallback at 120 BPM = 2 beats
    try {
      const { useDJStore } = await import('@/stores/useDJStore');
      const state = useDJStore.getState();
      const deckA = state.decks.A;
      const deckB = state.decks.B;
      const bpm = deckA.beatGrid?.bpm || deckA.detectedBPM ||
                  deckB.beatGrid?.bpm || deckB.detectedBPM || 120;
      // 2 beats, clamped 0.5–2.0s
      fadeSec = Math.min(2.0, Math.max(0.5, (60 / bpm) * 2));
    } catch { /* use fallback */ }

    // Equal-power crossfade using Tone.js rampTo
    // Old chain: 1 → 0, New chain: 0 → 1
    const now = Tone.now();
    oldChainGain.gain.cancelScheduledValues(now);
    newChainGain.gain.cancelScheduledValues(now);
    oldChainGain.gain.setValueAtTime(oldChainGain.gain.value, now);
    newChainGain.gain.setValueAtTime(0, now);

    // Schedule equal-power curve points (cos/sin) for smooth perceived loudness
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const t = now + (fadeSec * i) / steps;
      const frac = i / steps;
      // Equal-power: old = cos(frac * π/2), new = sin(frac * π/2)
      oldChainGain.gain.linearRampToValueAtTime(Math.cos(frac * Math.PI * 0.5), t);
      newChainGain.gain.linearRampToValueAtTime(Math.sin(frac * Math.PI * 0.5), t);
    }

    console.log(`[DJMixer] Crossfading FX (${fadeSec.toFixed(1)}s): ${enabled.length ? enabled.map(e => e.type).join(' → ') : '(bypass)'}`);

    // Schedule cleanup of old chain after crossfade completes
    this.crossfadeCleanupTimer = setTimeout(() => {
      this.crossfadeCleanupTimer = null;
      // Only clean up if we haven't been superseded
      if (oldChainGain === this.chainGain) return; // we ARE the current chain, don't dispose
      try { this.masterGain.disconnect(oldChainGain); } catch { /* already disconnected */ }
      for (const node of oldNodes) {
        try { node.disconnect(); node.dispose(); } catch { /* already disposed */ }
      }
      try { oldChainGain.disconnect(); oldChainGain.dispose(); } catch { /* */ }
    }, (fadeSec + 0.1) * 1000); // small buffer after fade completes
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    // Cancel pending crossfade cleanup
    if (this.crossfadeCleanupTimer) {
      clearTimeout(this.crossfadeCleanupTimer);
      this.crossfadeCleanupTimer = null;
    }

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
    this.chainGain.dispose();
    this.duckGain.dispose();
    this.limiter.dispose();
    this.masterMeter.dispose();
  }
}
