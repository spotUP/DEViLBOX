import * as Tone from 'tone';
import type { DubSirenConfig } from '@/types/instrument';

export class DubSirenSynth {
  private osc: Tone.Oscillator;
  private filter: Tone.Filter;
  private reverb: Tone.Reverb;
  private delay: Tone.FeedbackDelay;
  private distortion: Tone.Distortion;
  private gate: Tone.Gain;
  private output: Tone.Volume;
  private signal: Tone.Signal<"frequency">;
  private lfo: Tone.LFO;

  constructor(config: DubSirenConfig) {
    // Output Volume
    this.output = new Tone.Volume(0);

    // Effects Chain
    this.reverb = new Tone.Reverb({
      decay: config.reverb.decay,
      wet: config.reverb.enabled ? config.reverb.wet : 0
    });

    this.delay = new Tone.FeedbackDelay({
      delayTime: config.delay.time,
      feedback: config.delay.feedback,
      wet: config.delay.enabled ? config.delay.wet : 0
    });

    this.filter = new Tone.Filter({
      frequency: config.filter.frequency,
      type: config.filter.type,
      rolloff: config.filter.rolloff,
      Q: 1
    });

    // Saturation for that "gritty" 555 timer sound
    this.distortion = new Tone.Distortion(0.1);

    // Gate for triggering
    this.gate = new Tone.Gain(0);

    // Oscillator
    this.osc = new Tone.Oscillator({
      type: config.oscillator.type
    });

    // Control Signals
    // Base Frequency Signal
    this.signal = new Tone.Signal({
      units: "frequency",
      value: config.oscillator.frequency,
    });

    // LFO for modulation
    this.lfo = new Tone.LFO({
      type: config.lfo.type,
      frequency: config.lfo.rate,
      amplitude: config.lfo.depth,
      min: -config.lfo.depth, // Symmetric modulation
      max: config.lfo.depth
    });

    // Connect modulation
    // Note: Tone.js params sum input signals.
    // We set osc frequency to 0 so the signal drives it entirely
    this.osc.frequency.value = 0;
    this.signal.connect(this.osc.frequency);
    
    if (config.lfo.enabled) {
      this.lfo.connect(this.osc.frequency);
      this.lfo.start();
    }

    // Audio Chain
    // Authentic Dub Path: Osc -> Gate -> Filter -> Distortion -> Delay -> Reverb -> Output
    this.osc.connect(this.gate);
    this.gate.connect(this.filter);
    this.filter.connect(this.distortion);
    this.distortion.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.output);

    // Start oscillator immediately (it's gated)
    this.osc.start();
  }

  /**
   * Apply a full configuration to the synth
   */
  applyConfig(config: DubSirenConfig) {
    console.log('[DubSirenSynth] Applying config:', config);
    this.osc.type = config.oscillator.type;
    this.setFrequency(config.oscillator.frequency);
    
    this.lfo.type = config.lfo.type;
    this.setLFORate(config.lfo.rate);
    this.setLFODepth(config.lfo.depth);
    
    // Toggle LFO connection
    if (config.lfo.enabled) {
      if (this.lfo.state !== 'started') {
        this.lfo.start();
        this.lfo.connect(this.osc.frequency);
      }
    } else {
      this.lfo.stop();
      this.lfo.disconnect();
    }

    this.setDelayTime(config.delay.time);
    this.setDelayFeedback(config.delay.feedback);
    this.setDelayMix(config.delay.enabled ? config.delay.wet : 0);

    this.setFilterFreq(config.filter.frequency);
    this.filter.type = config.filter.type;
    this.filter.rolloff = config.filter.rolloff;

    this.reverb.decay = config.reverb.decay;
    this.reverb.wet.rampTo(config.reverb.enabled ? config.reverb.wet : 0, 0.1);
  }

  /**
   * Trigger the siren
   * @param note Optional note to set pitch (overrides manual frequency)
   * @param time Scheduling time
   * @param velocity Volume/Velocity
   */
  triggerAttack(note?: string | number, time?: number, _velocity?: number) {
    const t = time || Tone.now();
    
    if (note) {
      const freq = Tone.Frequency(note).toFrequency();
      this.signal.setValueAtTime(freq, t);
    }

    // Open gate instantly (button press)
    this.gate.gain.cancelScheduledValues(t);
    this.gate.gain.setValueAtTime(1, t);
  }

  /**
   * Stop the siren
   */
  triggerRelease(time?: number) {
    const t = time || Tone.now();
    // Close gate instantly (button release)
    this.gate.gain.cancelScheduledValues(t);
    this.gate.gain.setValueAtTime(0, t);
  }

  // Parameter Setters
  setOscType(type: 'sine' | 'square' | 'sawtooth' | 'triangle') {
    this.osc.type = type;
  }

  setFrequency(hz: number) {
    this.signal.rampTo(hz, 0.1);
  }

  setLFOType(type: 'sine' | 'square' | 'sawtooth' | 'triangle') {
    this.lfo.type = type;
  }

  setLFORate(hz: number) {
    this.lfo.frequency.rampTo(hz, 0.1);
  }

  setLFODepth(depth: number) {
    this.lfo.amplitude.rampTo(depth, 0.1);
    this.lfo.min = -depth;
    this.lfo.max = depth;
  }

  setDelayTime(time: number) {
    this.delay.delayTime.rampTo(time, 0.1);
  }

  setDelayFeedback(feedback: number) {
    this.delay.feedback.rampTo(feedback, 0.1);
  }

  setDelayMix(wet: number) {
    this.delay.wet.rampTo(wet, 0.1);
  }

  setFilterFreq(hz: number) {
    this.filter.frequency.rampTo(hz, 0.1);
  }

  // Connection
  connect(dest: Tone.InputNode) {
    this.output.connect(dest);
  }

  disconnect() {
    this.output.disconnect();
  }

  dispose() {
    this.osc.dispose();
    this.gate.dispose();
    this.filter.dispose();
    this.distortion.dispose();
    this.reverb.dispose();
    this.delay.dispose();
    this.output.dispose();
    this.signal.dispose();
    this.lfo.dispose();
  }

  get volume() {
    return this.output.volume;
  }
}