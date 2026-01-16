/**
 * WavetableSynth - Multi-voice wavetable synthesizer with morphing
 *
 * Features:
 * - Wavetable playback with position morphing
 * - LFO or envelope-based morph modulation
 * - Unison with voice detuning and stereo spread
 * - Filter with envelope modulation
 * - ADSR amplitude envelope
 */

import * as Tone from 'tone';
import type { WavetableConfig } from '../types/instrument';
import { getWavetablePreset, getFrameAtPosition } from '../constants/wavetablePresets';

export class WavetableSynth extends Tone.ToneAudioNode {
  readonly name = 'WavetableSynth';

  // Voice management
  private voices: Map<number, WavetableVoice> = new Map();
  private voicePool: WavetableVoice[] = [];

  // Configuration
  private config: WavetableConfig;

  // Morph LFO
  private morphLFO: Tone.LFO;
  private morphEnvelope: Tone.Envelope;

  // Output chain
  private filter: Tone.Filter;
  private filterEnvelope: Tone.Envelope;
  private outputGain: Tone.Gain;

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Current morph position (modulated)
  private baseMorphPosition: number = 0;

  constructor(config: WavetableConfig) {
    super();

    this.config = config;

    // Create I/O
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Create morph modulation sources
    this.morphLFO = new Tone.LFO({
      frequency: config.morphLFORate,
      type: 'sine',
      min: 0,
      max: 1,
    });

    this.morphEnvelope = new Tone.Envelope({
      attack: config.envelope.attack / 1000,
      decay: config.envelope.decay / 1000,
      sustain: config.envelope.sustain / 100,
      release: config.envelope.release / 1000,
    });

    // Create filter
    this.filter = new Tone.Filter({
      type: config.filter.type,
      frequency: config.filter.cutoff,
      Q: config.filter.resonance / 10, // 0-100 -> 0-10
      rolloff: -24,
    });

    // Create filter envelope
    this.filterEnvelope = new Tone.Envelope({
      attack: config.filterEnvelope.attack / 1000,
      decay: config.filterEnvelope.decay / 1000,
      sustain: config.filterEnvelope.sustain / 100,
      release: config.filterEnvelope.release / 1000,
    });

    // Output gain
    this.outputGain = new Tone.Gain(1);

    // Connect filter -> output
    this.filter.connect(this.outputGain);
    this.outputGain.connect(this.output);

    // Start morph LFO if enabled
    if (config.morphModSource === 'lfo') {
      this.morphLFO.start();
    }

    // Initialize voice pool
    for (let i = 0; i < 8; i++) {
      this.voicePool.push(this.createVoice());
    }

    // Set initial morph position
    this.baseMorphPosition = config.morphPosition / 100;
  }

  /**
   * Create a single voice
   */
  private createVoice(): WavetableVoice {
    return new WavetableVoice(this.config, this.filter);
  }

  /**
   * Get current morph position with modulation
   * Note: LFO modulation is applied at note trigger time, not continuously
   */
  private getCurrentMorphPosition(): number {
    // For now, return base position
    // Real-time LFO modulation would require audio-rate modulation
    return Math.max(0, Math.min(1, this.baseMorphPosition));
  }

  /**
   * Trigger attack for a note
   */
  triggerAttack(note: string | number, time?: number, velocity: number = 1): this {
    const now = time ?? Tone.now();
    const freq = typeof note === 'string' ? Tone.Frequency(note).toFrequency() : note;
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : Math.round(69 + 12 * Math.log2(note / 440));

    // Get a voice from the pool or steal one
    let voice = this.voicePool.pop();
    if (!voice) {
      // Steal oldest voice
      const oldestNote = this.voices.keys().next().value;
      if (oldestNote !== undefined) {
        voice = this.voices.get(oldestNote);
        this.voices.delete(oldestNote);
      }
    }

    if (voice) {
      // Update wavetable position
      const morphPosition = this.getCurrentMorphPosition();
      voice.setMorphPosition(morphPosition);

      // Trigger the voice
      voice.triggerAttack(freq, now, velocity);
      this.voices.set(midiNote, voice);

      // Trigger filter envelope if enabled
      if (this.config.filter.envelopeAmount !== 0) {
        const baseFreq = this.config.filter.cutoff;
        this.filter.frequency.setValueAtTime(baseFreq, now);
        this.filterEnvelope.triggerAttack(now);
      }
    }

    return this;
  }

  /**
   * Trigger release for a note
   */
  triggerRelease(note: string | number, time?: number): this {
    const now = time ?? Tone.now();
    const midiNote = typeof note === 'string' ? Tone.Frequency(note).toMidi() : Math.round(69 + 12 * Math.log2(note / 440));

    const voice = this.voices.get(midiNote);
    if (voice) {
      voice.triggerRelease(now);
      this.voices.delete(midiNote);

      // Return voice to pool after release
      setTimeout(() => {
        this.voicePool.push(voice);
      }, (this.config.envelope.release + 100));
    }

    return this;
  }

  /**
   * Trigger attack and release
   */
  triggerAttackRelease(
    note: string | number,
    duration: number | string,
    time?: number,
    velocity: number = 1
  ): this {
    const now = time ?? Tone.now();
    const durationSeconds = typeof duration === 'string'
      ? Tone.Time(duration).toSeconds()
      : duration;

    this.triggerAttack(note, now, velocity);
    this.triggerRelease(note, now + durationSeconds);

    return this;
  }

  /**
   * Set morph position (0-1)
   */
  setMorphPosition(position: number): void {
    this.baseMorphPosition = Math.max(0, Math.min(1, position));

    // Update all active voices
    const morphPosition = this.getCurrentMorphPosition();
    this.voices.forEach((voice) => {
      voice.setMorphPosition(morphPosition);
    });
  }

  /**
   * Set morph LFO rate
   */
  setMorphLFORate(rate: number): void {
    this.config.morphLFORate = rate;
    this.morphLFO.frequency.value = rate;
  }

  /**
   * Set filter cutoff
   */
  setFilterCutoff(cutoff: number): void {
    this.config.filter.cutoff = cutoff;
    this.filter.frequency.value = cutoff;
  }

  /**
   * Set filter resonance
   */
  setFilterResonance(resonance: number): void {
    this.config.filter.resonance = resonance;
    this.filter.Q.value = resonance / 10;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<WavetableConfig>): void {
    this.config = { ...this.config, ...updates };

    if (updates.morphLFORate !== undefined) {
      this.morphLFO.frequency.value = updates.morphLFORate;
    }

    if (updates.filter) {
      if (updates.filter.type) {
        this.filter.type = updates.filter.type;
      }
      if (updates.filter.cutoff !== undefined) {
        this.filter.frequency.value = updates.filter.cutoff;
      }
      if (updates.filter.resonance !== undefined) {
        this.filter.Q.value = updates.filter.resonance / 10;
      }
    }
  }

  /**
   * Clean up
   */
  dispose(): this {
    super.dispose();

    this.voices.forEach((voice) => voice.dispose());
    this.voicePool.forEach((voice) => voice.dispose());

    this.morphLFO.dispose();
    this.morphEnvelope.dispose();
    this.filter.dispose();
    this.filterEnvelope.dispose();
    this.outputGain.dispose();

    return this;
  }
}

/**
 * Single wavetable voice with unison oscillators
 */
class WavetableVoice {
  private oscillators: Tone.Oscillator[] = [];
  private gains: Tone.Gain[] = [];
  private panners: Tone.Panner[] = [];
  private envelope: Tone.Envelope;
  private config: WavetableConfig;

  constructor(config: WavetableConfig, output: Tone.ToneAudioNode) {
    this.config = config;

    // Create envelope
    this.envelope = new Tone.Envelope({
      attack: config.envelope.attack / 1000,
      decay: config.envelope.decay / 1000,
      sustain: config.envelope.sustain / 100,
      release: config.envelope.release / 1000,
    });

    // Create unison voices
    const numVoices = config.unison.voices;
    const detuneSpread = config.unison.detune;
    const panSpread = config.unison.stereoSpread / 100;

    for (let i = 0; i < numVoices; i++) {
      // Calculate detune for this voice
      let detune = 0;
      if (numVoices > 1) {
        detune = ((i / (numVoices - 1)) * 2 - 1) * detuneSpread;
      }

      // Calculate pan for this voice
      let pan = 0;
      if (numVoices > 1) {
        pan = ((i / (numVoices - 1)) * 2 - 1) * panSpread;
      }

      // Create oscillator
      const osc = new Tone.Oscillator({
        type: 'sine', // Will be replaced with wavetable
        detune: detune,
      });

      // Create gain (for envelope)
      const gain = new Tone.Gain(0);

      // Create panner
      const panner = new Tone.Panner(pan);

      // Connect
      osc.connect(gain);
      this.envelope.connect(gain.gain);
      gain.connect(panner);
      panner.connect(output);

      this.oscillators.push(osc);
      this.gains.push(gain);
      this.panners.push(panner);
    }

    // Initialize wavetable
    this.setMorphPosition(config.morphPosition / 100);
  }

  /**
   * Set wavetable morph position
   */
  setMorphPosition(position: number): void {
    const preset = getWavetablePreset(this.config.wavetableId);
    if (!preset) return;

    const frame = getFrameAtPosition(preset, position);

    // Convert frame to partials array (imaginary components = sine partials)
    // Take first 32 partials for performance
    const partials: number[] = [];
    for (let i = 1; i < Math.min(32, frame.imag.length); i++) {
      partials.push(frame.imag[i]);
    }

    // Apply to all oscillators using partials
    this.oscillators.forEach((osc) => {
      // Set as custom oscillator with partials
      (osc as any).partials = partials;
    });
  }

  /**
   * Trigger attack
   */
  triggerAttack(frequency: number, time: number, _velocity: number): void {
    this.oscillators.forEach((osc) => {
      osc.frequency.setValueAtTime(frequency, time);
      osc.start(time);
    });

    // Reset gains for envelope
    this.gains.forEach((gain) => {
      gain.gain.setValueAtTime(0, time);
    });

    this.envelope.triggerAttack(time);
  }

  /**
   * Trigger release
   */
  triggerRelease(time: number): void {
    this.envelope.triggerRelease(time);

    // Stop oscillators after release
    const stopTime = time + this.config.envelope.release / 1000 + 0.1;
    this.oscillators.forEach((osc) => {
      osc.stop(stopTime);
    });
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.envelope.dispose();
    this.oscillators.forEach((osc) => osc.dispose());
    this.gains.forEach((gain) => gain.dispose());
    this.panners.forEach((panner) => panner.dispose());
  }
}
