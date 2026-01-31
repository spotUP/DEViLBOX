/**
 * TB303AccurateSynth - Adapter for TB303EngineAccurate
 *
 * Wraps TB303EngineAccurate to work with the tracker's Tone.js-based engine system
 */

import * as Tone from 'tone';
import { TB303EngineAccurate } from './TB303EngineAccurate';
import type { TB303Config } from '@typedefs/instrument';

export class TB303AccurateSynth {
  private engine: TB303EngineAccurate;
  private audioContext: AudioContext;
  private output: Tone.Gain;
  // Track current note for future features (currently unused)
  // private currentNote: number | null = null;
  private config: TB303Config;

  constructor(config: TB303Config) {
    this.config = config;
    this.audioContext = Tone.getContext().rawContext as AudioContext;

    // Create TB303EngineAccurate
    this.engine = new TB303EngineAccurate(this.audioContext, config);

    // Create Tone.js output node for compatibility
    this.output = new Tone.Gain(1);

    // Initialize engine (async)
    this.initialize();
  }

  private async initialize() {
    await this.engine.initialize();

    // Connect engine output to Tone.js node
    const engineOutput = this.engine.getOutput();
    engineOutput.connect(this.output.input as AudioNode);
  }

  // Tone.js-compatible interface
  triggerAttackRelease(note: string | number, duration?: Tone.Unit.Time, _time?: Tone.Unit.Time, velocity: number = 1, accent?: boolean, slide?: boolean) {
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const vel = Math.round(velocity * 127);

    this.engine.noteOn(midiNote, vel, accent || false, slide || false);

    // this.currentNote = midiNote;

    // Schedule note off if duration is provided
    if (duration) {
      const durationSeconds = Tone.Time(duration).toSeconds();
      setTimeout(() => {
        this.engine.noteOff();
        // this.currentNote = null;
      }, durationSeconds * 1000);
    }
  }

  triggerAttack(note: string | number, _time?: Tone.Unit.Time, velocity: number = 1, accent?: boolean, slide?: boolean) {
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : note;
    const vel = Math.round(velocity * 127);

    this.engine.noteOn(midiNote, vel, accent || false, slide || false);
    // this.currentNote = midiNote;
  }

  triggerRelease(_time?: Tone.Unit.Time) {
    this.engine.noteOff();
    // this.currentNote = null;
  }

  releaseAll() {
    this.triggerRelease();
  }

  // Parameter setters matching TB303Synth interface
  setCutoff(value: number) {
    this.engine.setParameter('cutoff', value);
  }

  setResonance(value: number) {
    this.engine.setParameter('resonance', value);
  }

  setEnvMod(value: number) {
    this.engine.setParameter('envMod', value);
  }

  setDecay(value: number) {
    this.engine.setParameter('decay', value);
  }

  setAccentAmount(value: number) {
    this.engine.setParameter('accent', value);
  }

  setOverdrive(_value: number) {
    // Pedalboard feature removed - overdrive is now handled via worklet
    // Overdrive amount is applied during note synthesis in TB303.worklet.js
    console.log('[TB303AccurateSynth] Pedalboard feature disabled');
  }

  setTuning(value: number) {
    // Tuning is handled at note trigger level in TB303EngineAccurate
    // Store in config for future notes
    this.config.tuning = value;
  }

  setVolume(value: number) {
    // Convert dB to 0-100
    const volume = Math.pow(10, value / 20) * 100;
    this.engine.setParameter('volume', volume);
  }

  // Devil Fish methods - Full implementation
  enableDevilFish(enabled: boolean, _config?: any) {
    this.engine.enableDevilFish(enabled);
  }

  setNormalDecay(value: number) {
    this.engine.setNormalDecay(value);
  }

  setAccentDecay(value: number) {
    this.engine.setAccentDecay(value);
  }

  setVegDecay(value: number) {
    this.engine.setVegDecay(value);
  }

  setVegSustain(value: number) {
    this.engine.setVegSustain(value);
  }

  setSoftAttack(value: number) {
    this.engine.setSoftAttack(value);
  }

  setFilterTracking(value: number) {
    this.engine.setFilterTracking(value);
  }

  setFilterFM(value: number) {
    this.engine.setFilterFM(value);
  }

  setSweepSpeed(value: string) {
    this.engine.setSweepSpeed(value as 'fast' | 'normal' | 'slow');
  }

  setMuffler(value: string) {
    this.engine.setMuffler(value as 'off' | 'soft' | 'hard');
  }

  setHighResonance(enabled: boolean) {
    this.engine.setHighResonance(enabled);
  }

  setAccentSweepEnabled(enabled: boolean) {
    this.engine.setAccentSweepEnabled(enabled);
  }

  setQuality(_quality: 'high' | 'medium' | 'low') {
    // Accurate engine currently doesn't have simplified quality modes
    // but we add this stub for compatibility with ToneEngine
  }

  // Connection methods
  connect(destination: Tone.InputNode) {
    this.output.connect(destination);
    return this;
  }

  disconnect() {
    this.output.disconnect();
  }

  toDestination() {
    this.output.toDestination();
    return this;
  }

  dispose() {
    this.engine.dispose();
    this.output.dispose();
  }

  // Getters for Tone.js compatibility
  get volume() {
    return this.output.gain;
  }
}
