import * as Tone from 'tone';
import type { SynareConfig } from '@/types/instrument';

/**
 * Synare 3 Percussion Synth Engine
 * 
 * Architecture:
 * - Osc 1 & Osc 2 (Square) -> Mix
 * - Noise Generator (White/Pink) -> Mix
 * - Mix -> Resonant Lowpass Filter (24dB)
 * - Amp Envelope (Decay)
 * - Filter Envelope (Decay)
 * - Pitch Envelope (Sweep)
 * - LFO (Pitch/Filter modulation)
 */
export class SynareSynth {
  private osc1: Tone.Oscillator;
  private osc2: Tone.Oscillator;
  private noise: Tone.Noise;
  
  private osc1Gain: Tone.Gain;
  private osc2Gain: Tone.Gain;
  private noiseGain: Tone.Gain;
  
  private filter: Tone.Filter;
  private ampEnv: Tone.AmplitudeEnvelope;
  private output: Tone.Volume;
  
  // Envelopes for modulation
  private filterFreqEnv: Tone.Envelope;
  private pitchEnv: Tone.Envelope;
  
  // Modulation
  private lfo: Tone.LFO;
  private lfoGain: Tone.Gain;

  // State
  private config: SynareConfig;

  constructor(config: SynareConfig) {
    this.config = config;

    // 1. Oscillators & Noise
    this.osc1 = new Tone.Oscillator({
      type: 'square',
      frequency: config.oscillator.tune
    });
    
    this.osc2 = new Tone.Oscillator({
      type: 'square',
      frequency: config.oscillator.tune
    });

    this.noise = new Tone.Noise({
      type: config.noise.type
    });

    // 2. Mix Gains
    this.osc1Gain = new Tone.Gain(1);
    this.osc2Gain = new Tone.Gain(config.oscillator2.enabled ? config.oscillator2.mix : 0);
    this.noiseGain = new Tone.Gain(config.noise.enabled ? config.noise.mix : 0);

    // 3. Filter & VCA
    this.filter = new Tone.Filter({
      frequency: config.filter.cutoff,
      type: 'lowpass',
      rolloff: -24,
      Q: config.filter.resonance / 10 // Map 0-100 to 0-10
    });

    this.ampEnv = new Tone.AmplitudeEnvelope({
      attack: 0.005,
      decay: config.envelope.decay / 1000,
      sustain: config.envelope.sustain,
      release: 0.1
    });

    this.output = new Tone.Volume(0);

    // 4. Modulation Sources
    this.filterFreqEnv = new Tone.Envelope({
      attack: 0.005,
      decay: config.filter.decay / 1000,
      sustain: 0,
      release: 0.1
    });

    this.pitchEnv = new Tone.Envelope({
      attack: 0.005,
      decay: config.sweep.time / 1000,
      sustain: 0,
      release: 0.1
    });

    this.lfo = new Tone.LFO({
      frequency: config.lfo.rate,
      amplitude: config.lfo.depth / 100
    });
    this.lfoGain = new Tone.Gain(0);
    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    // 5. Routing
    // Osc -> Gains -> Sum -> Filter -> VCA -> Output
    this.osc1.connect(this.osc1Gain);
    this.osc2.connect(this.osc2Gain);
    this.noise.connect(this.noiseGain);

    const mixBus = new Tone.Gain(1);
    this.osc1Gain.connect(mixBus);
    this.osc2Gain.connect(mixBus);
    this.noiseGain.connect(mixBus);

    mixBus.connect(this.filter);
    this.filter.connect(this.ampEnv);
    this.ampEnv.connect(this.output);

    // 6. Parameter Initialization
    this.applyConfig(config);

    // Start components
    this.osc1.start();
    this.osc2.start();
    this.noise.start();
  }

  public applyConfig(config: SynareConfig) {
    this.config = config;
    this.osc1.frequency.rampTo(config.oscillator.tune, 0.1);
    this.osc2.frequency.rampTo(config.oscillator.tune * Math.pow(2, config.oscillator2.detune / 12), 0.1);
    
    this.osc1Gain.gain.rampTo(1, 0.1);
    this.osc2Gain.gain.rampTo(config.oscillator2.enabled ? config.oscillator2.mix : 0, 0.1);
    this.noiseGain.gain.rampTo(config.noise.enabled ? config.noise.mix : 0, 0.1);
    
    this.filter.frequency.rampTo(config.filter.cutoff, 0.1);
    this.filter.Q.rampTo(config.filter.resonance / 10, 0.1);
    
    this.ampEnv.decay = config.envelope.decay / 1000;
    this.ampEnv.sustain = config.envelope.sustain;
    
    this.filterFreqEnv.decay = config.filter.decay / 1000;
    
    this.pitchEnv.decay = config.sweep.time / 1000;
    
    this.lfo.frequency.rampTo(config.lfo.rate, 0.1);
    this.lfoGain.gain.rampTo(config.lfo.enabled ? config.lfo.depth / 100 : 0, 0.1);
  }

  triggerAttack(note?: string | number, time?: number, velocity?: number) {
    const t = time || Tone.now();
    
    if (note) {
      const freq = Tone.Frequency(note).toFrequency();
      this.osc1.frequency.setValueAtTime(freq, t);
      this.osc2.frequency.setValueAtTime(freq * Math.pow(2, this.config.oscillator2.detune / 12), t);
    }

    // Trigger Envelopes
    this.ampEnv.triggerAttack(t, velocity);
    
    // Filter Sweep
    if (this.config.filter.envMod > 0) {
      const targetFreq = Math.min(20000, this.config.filter.cutoff + (this.config.filter.envMod * 100));
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.frequency.setValueAtTime(this.config.filter.cutoff, t);
      this.filter.frequency.exponentialRampToValueAtTime(targetFreq, t + 0.005);
      this.filter.frequency.exponentialRampToValueAtTime(this.config.filter.cutoff, t + (this.config.filter.decay / 1000));
    }

    // Pitch Sweep
    if (this.config.sweep.enabled) {
      const baseFreq = note ? Tone.Frequency(note).toFrequency() : this.config.oscillator.tune;
      const sweepFreq = baseFreq * Math.pow(2, this.config.sweep.amount / 12);
      
      this.osc1.frequency.cancelScheduledValues(t);
      this.osc2.frequency.cancelScheduledValues(t);
      
      this.osc1.frequency.setValueAtTime(sweepFreq, t);
      this.osc1.frequency.exponentialRampToValueAtTime(baseFreq, t + (this.config.sweep.time / 1000));
      
      this.osc2.frequency.setValueAtTime(sweepFreq * Math.pow(2, this.config.oscillator2.detune / 12), t);
      this.osc2.frequency.exponentialRampToValueAtTime(baseFreq * Math.pow(2, this.config.oscillator2.detune / 12), t + (this.config.sweep.time / 1000));
    }
  }

  triggerRelease(time?: number) {
    const t = time || Tone.now();
    this.ampEnv.triggerRelease(t);
  }

  // Update methods
  updateParameter(_key: string, _value: any) {
    // Basic dynamic update
    this.applyConfig(this.config);
  }

  // Connection
  connect(dest: Tone.InputNode) {
    this.output.connect(dest);
  }

  disconnect() {
    this.output.disconnect();
  }

  dispose() {
    this.osc1.dispose();
    this.osc2.dispose();
    this.noise.dispose();
    this.osc1Gain.dispose();
    this.osc2Gain.dispose();
    this.noiseGain.dispose();
    this.filter.dispose();
    this.ampEnv.dispose();
    this.filterFreqEnv.dispose();
    this.pitchEnv.dispose();
    this.lfo.dispose();
    this.lfoGain.dispose();
    this.output.dispose();
  }

  get volume() {
    return this.output.volume;
  }
}