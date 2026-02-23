/**
 * HarmonicSynth - Additive/Spectral Synthesizer
 *
 * Native Web Audio implementation using PeriodicWave for efficient additive synthesis.
 * Each voice = 1 OscillatorNode with a custom PeriodicWave containing 32 harmonics.
 * When harmonics change, rebuild PeriodicWave and apply to all active voices.
 *
 * Signal chain: osc → voiceGain → filter → lfoGain → masterGain (output)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { HarmonicSynthConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi, noteToFrequency, audioNow } from '@/utils/audio-context';

const NUM_HARMONICS = 32;

interface HarmonicVoice {
  osc: OscillatorNode;
  gain: GainNode;
  midiNote: number;
  releaseTimeout?: ReturnType<typeof setTimeout>;
}

export class HarmonicSynth implements DevilboxSynth {
  readonly name = 'HarmonicSynth';
  readonly output: GainNode;

  private config: HarmonicSynthConfig;
  private audioContext: AudioContext;
  private filter: BiquadFilterNode;
  private masterGain: GainNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;

  private voices: Map<number, HarmonicVoice> = new Map();
  private voiceOrder: number[] = [];
  private currentWave: PeriodicWave;

  constructor(config: HarmonicSynthConfig) {
    this.config = { ...config, harmonics: [...config.harmonics] };
    this.audioContext = getDevilboxAudioContext();

    // Master output
    this.output = this.audioContext.createGain();
    this.output.gain.value = 1;

    // Master gain (for volume)
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.7;

    // Filter
    this.filter = this.audioContext.createBiquadFilter();
    this.filter.type = config.filter.type as BiquadFilterType;
    this.filter.frequency.value = config.filter.cutoff;
    this.filter.Q.value = config.filter.resonance;

    // LFO
    this.lfo = this.audioContext.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = config.lfo.rate;
    this.lfoGain = this.audioContext.createGain();
    this.lfoGain.gain.value = 0; // Set by connectLFO

    // Connect chain: filter → masterGain → output
    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.output);

    // Start LFO and connect to target
    this.lfo.connect(this.lfoGain);
    this.lfo.start();
    this.connectLFO();

    // Build initial PeriodicWave
    this.currentWave = this.buildPeriodicWave();
  }

  /**
   * Build a PeriodicWave from harmonics + spectralTilt + evenOddBalance
   */
  private buildPeriodicWave(): PeriodicWave {
    const real = new Float32Array(NUM_HARMONICS + 1);
    const imag = new Float32Array(NUM_HARMONICS + 1);

    // DC offset = 0
    real[0] = 0;
    imag[0] = 0;

    const tilt = this.config.spectralTilt / 100; // -1 to 1
    const eoBalance = this.config.evenOddBalance / 100; // -1 to 1

    for (let i = 1; i <= NUM_HARMONICS; i++) {
      let amp = this.config.harmonics[i - 1] || 0;

      // Apply spectral tilt: higher harmonics attenuated/boosted
      if (tilt !== 0) {
        amp *= Math.pow(i, -tilt);
      }

      // Apply even/odd balance
      const isEven = i % 2 === 0;
      if (eoBalance > 0 && !isEven) {
        // Positive = boost even, cut odd
        amp *= 1 - eoBalance;
      } else if (eoBalance < 0 && isEven) {
        // Negative = boost odd, cut even
        amp *= 1 + eoBalance;
      }

      // PeriodicWave uses imag for sine-series coefficients
      imag[i] = amp;
    }

    return this.audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  /**
   * Connect LFO to the appropriate target
   */
  private connectLFO(): void {
    // Disconnect previous
    try { this.lfoGain.disconnect(); } catch { /* ignored */ }

    const depth = this.config.lfo.depth / 100;

    switch (this.config.lfo.target) {
      case 'pitch':
        this.lfoGain.gain.value = depth * 50; // cents range
        // Will be connected per-voice to osc.detune
        break;
      case 'filter':
        this.lfoGain.gain.value = depth * 2000; // Hz range
        this.lfoGain.connect(this.filter.frequency);
        break;
      case 'spectral':
        // Spectral LFO modulation is handled at note trigger time
        // (can't modulate PeriodicWave in real-time)
        break;
    }
  }

  triggerAttack(note: string | number, time?: number, velocity: number = 1): void {
    const now = time ?? audioNow();
    const freq = typeof note === 'string' ? noteToFrequency(note) : note;
    const midiNote = typeof note === 'string'
      ? noteToMidi(note)
      : Math.round(69 + 12 * Math.log2(note / 440));

    // Kill existing voice on same note
    const existing = this.voices.get(midiNote);
    if (existing) {
      this.killVoice(existing);
      this.voices.delete(midiNote);
      this.voiceOrder = this.voiceOrder.filter(n => n !== midiNote);
    }

    // Voice stealing: if at max polyphony, kill oldest
    const maxVoices = this.config.maxVoices || 6;
    while (this.voices.size >= maxVoices && this.voiceOrder.length > 0) {
      const oldestNote = this.voiceOrder.shift()!;
      const oldVoice = this.voices.get(oldestNote);
      if (oldVoice) {
        this.killVoice(oldVoice);
        this.voices.delete(oldestNote);
      }
    }

    // Create voice
    const osc = this.audioContext.createOscillator();
    osc.setPeriodicWave(this.currentWave);
    osc.frequency.setValueAtTime(freq, now);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0, now);

    // Connect: osc → gain → filter
    osc.connect(gain);
    gain.connect(this.filter);

    // Connect LFO to pitch if target is pitch
    if (this.config.lfo.target === 'pitch' && this.config.lfo.depth > 0) {
      this.lfoGain.connect(osc.detune);
    }

    // Start oscillator
    osc.start(now);

    // ADSR envelope
    const env = this.config.envelope;
    const attackTime = env.attack / 1000;
    const decayTime = env.decay / 1000;
    const sustainLevel = (env.sustain / 100) * velocity;

    gain.gain.linearRampToValueAtTime(velocity, now + attackTime);
    gain.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);

    const voice: HarmonicVoice = { osc, gain, midiNote };
    this.voices.set(midiNote, voice);
    this.voiceOrder.push(midiNote);
  }

  triggerRelease(note?: string | number, time?: number): void {
    const now = time ?? audioNow();

    if (note === undefined) {
      // Release all voices
      for (const voice of this.voices.values()) {
        this.scheduleRelease(voice, now);
      }
      return;
    }

    const midiNote = typeof note === 'string'
      ? noteToMidi(note)
      : typeof note === 'number' && note < 128
        ? note
        : Math.round(69 + 12 * Math.log2((note as number) / 440));

    const voice = this.voices.get(midiNote);
    if (voice) {
      this.scheduleRelease(voice, now);
    }
  }

  /**
   * Release all active voices (panic button, song stop, etc.)
   */
  releaseAll(): void {
    this.triggerRelease(); // triggerRelease without args releases all voices
  }

  triggerAttackRelease(note: string | number, duration: number, time?: number, velocity?: number): void {
    const now = time ?? audioNow();
    this.triggerAttack(note, now, velocity);
    this.triggerRelease(note, now + duration);
  }

  private scheduleRelease(voice: HarmonicVoice, time: number): void {
    const releaseTime = this.config.envelope.release / 1000;

    voice.gain.gain.cancelScheduledValues(time);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
    voice.gain.gain.linearRampToValueAtTime(0, time + releaseTime);

    // Schedule cleanup
    const cleanupDelay = (releaseTime + 0.05) * 1000;
    voice.releaseTimeout = setTimeout(() => {
      this.killVoice(voice);
      this.voices.delete(voice.midiNote);
      this.voiceOrder = this.voiceOrder.filter(n => n !== voice.midiNote);
    }, cleanupDelay);
  }

  private killVoice(voice: HarmonicVoice): void {
    if (voice.releaseTimeout) clearTimeout(voice.releaseTimeout);
    try { voice.osc.stop(); } catch { /* ignored */ }
    try { voice.osc.disconnect(); } catch { /* ignored */ }
    try { voice.gain.disconnect(); } catch { /* ignored */ }
  }

  set(param: string, value: number): void {
    let needsRebuild = false;

    if (param.startsWith('harmonic_')) {
      const idx = parseInt(param.split('_')[1], 10);
      if (idx >= 0 && idx < NUM_HARMONICS) {
        this.config.harmonics[idx] = value;
        needsRebuild = true;
      }
    } else if (param === 'spectralTilt') {
      this.config.spectralTilt = value;
      needsRebuild = true;
    } else if (param === 'evenOddBalance') {
      this.config.evenOddBalance = value;
      needsRebuild = true;
    } else if (param === 'filterCutoff') {
      this.config.filter.cutoff = value;
      this.filter.frequency.value = value;
    } else if (param === 'filterResonance') {
      this.config.filter.resonance = value;
      this.filter.Q.value = value;
    } else if (param === 'filterType') {
      const types: Array<'lowpass' | 'highpass' | 'bandpass'> = ['lowpass', 'highpass', 'bandpass'];
      this.config.filter.type = types[value] || 'lowpass';
      this.filter.type = this.config.filter.type;
    } else if (param === 'attack') {
      this.config.envelope.attack = value;
    } else if (param === 'decay') {
      this.config.envelope.decay = value;
    } else if (param === 'sustain') {
      this.config.envelope.sustain = value;
    } else if (param === 'release') {
      this.config.envelope.release = value;
    } else if (param === 'lfoRate') {
      this.config.lfo.rate = value;
      this.lfo.frequency.value = value;
    } else if (param === 'lfoDepth') {
      this.config.lfo.depth = value;
      this.connectLFO();
    } else if (param === 'lfoTarget') {
      const targets: Array<'pitch' | 'filter' | 'spectral'> = ['pitch', 'filter', 'spectral'];
      this.config.lfo.target = targets[value] || 'pitch';
      this.connectLFO();
    }

    if (needsRebuild) {
      this.currentWave = this.buildPeriodicWave();
      // Apply new wave to all active voices
      for (const voice of this.voices.values()) {
        voice.osc.setPeriodicWave(this.currentWave);
      }
    }
  }

  get(param: string): number | undefined {
    if (param.startsWith('harmonic_')) {
      const idx = parseInt(param.split('_')[1], 10);
      return this.config.harmonics[idx];
    }
    switch (param) {
      case 'spectralTilt': return this.config.spectralTilt;
      case 'evenOddBalance': return this.config.evenOddBalance;
      case 'filterCutoff': return this.config.filter.cutoff;
      case 'filterResonance': return this.config.filter.resonance;
      case 'attack': return this.config.envelope.attack;
      case 'decay': return this.config.envelope.decay;
      case 'sustain': return this.config.envelope.sustain;
      case 'release': return this.config.envelope.release;
      case 'lfoRate': return this.config.lfo.rate;
      case 'lfoDepth': return this.config.lfo.depth;
      default: return undefined;
    }
  }

  /**
   * Set all harmonics at once (for preset changes)
   */
  setHarmonics(harmonics: number[]): void {
    for (let i = 0; i < NUM_HARMONICS; i++) {
      this.config.harmonics[i] = harmonics[i] || 0;
    }
    this.currentWave = this.buildPeriodicWave();
    for (const voice of this.voices.values()) {
      voice.osc.setPeriodicWave(this.currentWave);
    }
  }

  /**
   * Apply configuration changes from the UI (called by ToneEngine)
   */
  applyConfig(updates: Partial<HarmonicSynthConfig>): void {
    let needsRebuild = false;

    // Update harmonics array
    if (updates.harmonics) {
      for (let i = 0; i < NUM_HARMONICS; i++) {
        this.config.harmonics[i] = updates.harmonics[i] ?? this.config.harmonics[i];
      }
      needsRebuild = true;
    }

    // Update spectral controls
    if (updates.spectralTilt !== undefined) {
      this.config.spectralTilt = updates.spectralTilt;
      needsRebuild = true;
    }
    if (updates.evenOddBalance !== undefined) {
      this.config.evenOddBalance = updates.evenOddBalance;
      needsRebuild = true;
    }

    // Update filter
    if (updates.filter) {
      if (updates.filter.type !== undefined) {
        this.config.filter.type = updates.filter.type;
        this.filter.type = updates.filter.type;
      }
      if (updates.filter.cutoff !== undefined) {
        this.config.filter.cutoff = updates.filter.cutoff;
        this.filter.frequency.value = updates.filter.cutoff;
      }
      if (updates.filter.resonance !== undefined) {
        this.config.filter.resonance = updates.filter.resonance;
        this.filter.Q.value = updates.filter.resonance;
      }
    }

    // Update envelope
    if (updates.envelope) {
      if (updates.envelope.attack !== undefined) {
        this.config.envelope.attack = updates.envelope.attack;
      }
      if (updates.envelope.decay !== undefined) {
        this.config.envelope.decay = updates.envelope.decay;
      }
      if (updates.envelope.sustain !== undefined) {
        this.config.envelope.sustain = updates.envelope.sustain;
      }
      if (updates.envelope.release !== undefined) {
        this.config.envelope.release = updates.envelope.release;
      }
    }

    // Update LFO
    if (updates.lfo) {
      let reconnectLFO = false;
      if (updates.lfo.target !== undefined) {
        this.config.lfo.target = updates.lfo.target;
        reconnectLFO = true;
      }
      if (updates.lfo.rate !== undefined) {
        this.config.lfo.rate = updates.lfo.rate;
        this.lfo.frequency.value = updates.lfo.rate;
      }
      if (updates.lfo.depth !== undefined) {
        this.config.lfo.depth = updates.lfo.depth;
        reconnectLFO = true;
      }
      if (reconnectLFO) {
        this.connectLFO();
      }
    }

    // Rebuild waveform if harmonics or spectral params changed
    if (needsRebuild) {
      this.currentWave = this.buildPeriodicWave();
      for (const voice of this.voices.values()) {
        voice.osc.setPeriodicWave(this.currentWave);
      }
    }
  }

  dispose(): void {
    // Kill all voices
    for (const voice of this.voices.values()) {
      this.killVoice(voice);
    }
    this.voices.clear();
    this.voiceOrder = [];

    // Stop LFO
    try { this.lfo.stop(); } catch { /* ignored */ }
    try { this.lfo.disconnect(); } catch { /* ignored */ }
    try { this.lfoGain.disconnect(); } catch { /* ignored */ }
    try { this.filter.disconnect(); } catch { /* ignored */ }
    try { this.masterGain.disconnect(); } catch { /* ignored */ }
  }
}
