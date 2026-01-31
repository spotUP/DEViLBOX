import * as Tone from 'tone';
import type { DubSirenConfig } from '@/types/instrument';

export class DubSirenSynth {
  private osc: Tone.Oscillator;
  private filter: Tone.Filter;
  private reverb: Tone.Reverb;
  private delay: Tone.FeedbackDelay;
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
      rolloff: config.filter.rolloff
    });

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
    // osc -> reverb -> delay -> filter -> output
    this.osc.chain(this.reverb, this.delay, this.filter, this.output);
  }

  /**
   * Trigger the siren
   * @param note Optional note to set pitch (overrides manual frequency)
   * @param time Scheduling time
   * @param velocity Volume/Velocity
   */
  triggerAttack(note?: string | number, time?: number, velocity?: number) {
    const t = time || Tone.now();
    
    if (note) {
      const freq = Tone.Frequency(note).toFrequency();
      this.signal.setValueAtTime(freq, t);
    }

    if (velocity !== undefined) {
      // Scale volume? 
      // Current implementation uses output volume for master level.
      // Velocity could modulate amplitude but siren is usually on/off.
    }

    this.osc.start(t);
  }

  /**
   * Stop the siren
   */
  triggerRelease(time?: number) {
    const t = time || Tone.now();
    this.osc.stop(t);
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
    this.filter.dispose();
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
