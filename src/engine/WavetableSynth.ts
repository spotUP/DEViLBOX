/**
 * WavetableSynth - Multi-voice wavetable synthesizer with morphing
 *
 * Native Web Audio implementation (no Tone.js dependency).
 *
 * Features:
 * - Wavetable playback with position morphing via PeriodicWave
 * - Unison with voice detuning and stereo spread
 * - BiquadFilter with configurable type/cutoff/resonance
 * - Manual ADSR amplitude envelope via AudioParam scheduling
 */

import type { DevilboxSynth } from '@/types/synth';
import type { WavetableConfig } from '../types/instrument';
import { getDevilboxAudioContext, noteToMidi, noteToFrequency, audioNow, timeToSeconds } from '@/utils/audio-context';
import { getWavetablePreset, getFrameAtPosition } from '../constants/wavetablePresets';

export class WavetableSynth implements DevilboxSynth {
  readonly name = 'WavetableSynth';
  readonly output: GainNode;

  // Voice management
  private voices: Map<number, WavetableVoice> = new Map();
  private voicePool: WavetableVoice[] = [];

  // Configuration
  private config: WavetableConfig;

  // Audio context
  private audioContext: AudioContext;

  // Output chain
  private filter: BiquadFilterNode;
  private outputGain: GainNode;

  // Current morph position (modulated)
  private baseMorphPosition: number = 0;

  constructor(config: WavetableConfig) {
    this.config = config;
    this.audioContext = getDevilboxAudioContext();

    // Create output
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1;

    // Create filter
    this.filter = this.audioContext.createBiquadFilter();
    this.filter.type = config.filter.type as BiquadFilterType;
    this.filter.frequency.value = isFinite(config.filter.cutoff) ? config.filter.cutoff : 8000;
    this.filter.Q.value = isFinite(config.filter.resonance) ? config.filter.resonance / 10 : 1;

    // Output gain with volume boost (wavetable tends to be quiet)
    this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.value = 2;

    // Connect filter -> outputGain -> output
    this.filter.connect(this.outputGain);
    this.outputGain.connect(this.output);

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
    return new WavetableVoice(this.config, this.filter, this.audioContext);
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
  triggerAttack(note: string | number, time?: number, velocity: number = 1): void {
    const now = time ?? audioNow();
    const freq = typeof note === 'string' ? noteToFrequency(note) : note;
    const midiNote = typeof note === 'string'
      ? noteToMidi(note)
      : Math.round(69 + 12 * Math.log2(note / 440));

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

      // Filter envelope modulation (manual scheduling)
      if (this.config.filter.envelopeAmount !== 0) {
        const baseFreq = this.config.filter.cutoff;
        const envAmount = this.config.filter.envelopeAmount / 100;
        const maxFreq = Math.min(20000, baseFreq + envAmount * (20000 - baseFreq));
        const filterAttack = this.config.filterEnvelope.attack / 1000;
        const filterDecay = this.config.filterEnvelope.decay / 1000;
        const filterSustain = this.config.filterEnvelope.sustain / 100;

        const sustainFreq = baseFreq + (maxFreq - baseFreq) * filterSustain;

        this.filter.frequency.cancelScheduledValues(now);
        this.filter.frequency.setValueAtTime(baseFreq, now);
        this.filter.frequency.linearRampToValueAtTime(maxFreq, now + filterAttack);
        this.filter.frequency.linearRampToValueAtTime(sustainFreq, now + filterAttack + filterDecay);
      }
    }
  }

  /**
   * Trigger release for a note
   */
  triggerRelease(note: string | number, time?: number): void {
    const now = time ?? audioNow();
    const midiNote = typeof note === 'string'
      ? noteToMidi(note)
      : Math.round(69 + 12 * Math.log2(note / 440));

    const voice = this.voices.get(midiNote);
    if (voice) {
      voice.triggerRelease(now);
      this.voices.delete(midiNote);

      // Return voice to pool after release
      setTimeout(() => {
        this.voicePool.push(voice);
      }, (this.config.envelope.release + 100));
    }
  }

  /**
   * Release all active voices
   */
  releaseAll(): void {
    const now = audioNow();
    for (const [midiNote, voice] of this.voices.entries()) {
      voice.triggerRelease(now);
      setTimeout(() => {
        this.voicePool.push(voice);
      }, (this.config.envelope.release + 100));
      this.voices.delete(midiNote);
    }
  }

  /**
   * Trigger attack and release
   */
  triggerAttackRelease(
    note: string | number,
    duration: number | string,
    time?: number,
    velocity: number = 1
  ): void {
    const now = time ?? audioNow();
    const durationSeconds = typeof duration === 'string'
      ? timeToSeconds(duration)
      : duration;

    this.triggerAttack(note, now, velocity);
    this.triggerRelease(note, now + durationSeconds);
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

    if (updates.filter) {
      if (updates.filter.type) {
        this.filter.type = updates.filter.type as BiquadFilterType;
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
  dispose(): void {
    this.voices.forEach((voice) => voice.dispose());
    this.voicePool.forEach((voice) => voice.dispose());

    this.filter.disconnect();
    this.outputGain.disconnect();
    this.output.disconnect();
  }
}

/**
 * Single wavetable voice with unison oscillators
 */
class WavetableVoice {
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private panners: StereoPannerNode[] = [];
  private config: WavetableConfig;
  private audioContext: AudioContext;

  // ADSR envelope parameters (in seconds)
  private attackTime: number;
  private decayTime: number;
  private sustainLevel: number;
  private releaseTime: number;

  constructor(config: WavetableConfig, output: AudioNode, audioContext: AudioContext) {
    this.config = config;
    this.audioContext = audioContext;

    // Store ADSR values (config is in ms / percent)
    this.attackTime = config.envelope.attack / 1000;
    this.decayTime = config.envelope.decay / 1000;
    this.sustainLevel = config.envelope.sustain / 100;
    this.releaseTime = config.envelope.release / 1000;

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
      const osc = audioContext.createOscillator();
      osc.detune.value = detune;

      // Create gain (for envelope)
      const gain = audioContext.createGain();
      gain.gain.value = 0;

      // Create panner
      const panner = audioContext.createStereoPanner();
      panner.pan.value = pan;

      // Connect: osc -> gain -> panner -> output
      osc.connect(gain);
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
   * Set wavetable morph position using PeriodicWave
   */
  setMorphPosition(position: number): void {
    const preset = getWavetablePreset(this.config.wavetableId);
    if (!preset) return;

    const frame = getFrameAtPosition(preset, position);

    // Build PeriodicWave from frame data
    // Take first 32 partials for performance
    const numPartials = Math.min(32, frame.imag.length);
    const real = new Float32Array(numPartials + 1);
    const imag = new Float32Array(numPartials + 1);

    // DC component (index 0) stays at 0
    for (let i = 1; i < numPartials; i++) {
      imag[i + 1 - 1] = frame.imag[i]; // sine partials go in imaginary
    }

    const wave = this.audioContext.createPeriodicWave(real, imag, { disableNormalization: false });

    // Apply to all oscillators
    this.oscillators.forEach((osc) => {
      osc.setPeriodicWave(wave);
    });
  }

  /**
   * Trigger attack with manual ADSR envelope scheduling
   */
  triggerAttack(frequency: number, time: number, velocity: number): void {
    void velocity;
    this.oscillators.forEach((osc) => {
      osc.frequency.setValueAtTime(frequency, time);
      osc.start(time);
    });

    // Schedule ADSR attack + decay on each gain node
    this.gains.forEach((g) => {
      const param = g.gain;
      param.cancelScheduledValues(time);
      param.setValueAtTime(0, time);
      param.linearRampToValueAtTime(1, time + this.attackTime);
      param.linearRampToValueAtTime(this.sustainLevel, time + this.attackTime + this.decayTime);
    });
  }

  /**
   * Trigger release with manual envelope scheduling
   */
  triggerRelease(time: number): void {
    // Schedule release ramp on each gain node
    this.gains.forEach((g) => {
      const param = g.gain;
      param.cancelScheduledValues(time);
      param.setValueAtTime(param.value, time); // hold current value
      param.linearRampToValueAtTime(0, time + this.releaseTime);
    });

    // Stop oscillators after release completes
    const stopTime = time + this.releaseTime + 0.1;
    this.oscillators.forEach((osc) => {
      osc.stop(stopTime);
    });
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.oscillators.forEach((osc) => {
      try { osc.stop(); } catch { /* may already be stopped */ }
      osc.disconnect();
    });
    this.gains.forEach((gain) => gain.disconnect());
    this.panners.forEach((panner) => panner.disconnect());
  }
}
