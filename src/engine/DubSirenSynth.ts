import * as Tone from 'tone';
import type { DubSirenConfig } from '@/types/instrument';
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, getNativeAudioNode, audioNow, noteToFrequency } from '@/utils/audio-context';

// Default config values for defensive initialization
const DEFAULT_CONFIG: DubSirenConfig = {
  oscillator: { type: 'sine', frequency: 440 },
  lfo: { enabled: true, type: 'square', rate: 2, depth: 100 },
  delay: { enabled: true, time: 0.3, feedback: 0.4, wet: 0.3 },
  filter: { enabled: true, type: 'lowpass', frequency: 2000, rolloff: -24 },
  reverb: { enabled: true, decay: 1.5, wet: 0.1 },
};

export class DubSirenSynth implements DevilboxSynth {
  readonly name = 'DubSirenSynth';
  readonly output: GainNode;
  private osc: Tone.Oscillator;
  private filter: Tone.Filter;
  private reverb: Tone.Reverb;
  private delay: Tone.FeedbackDelay;
  private distortion: Tone.Distortion;
  private gate: Tone.Gain;
  private _toneOutput: Tone.Volume;
  private signal: Tone.Signal<"frequency">;
  private lfo: Tone.LFO;

  constructor(config: DubSirenConfig) {
    // Merge with defaults to handle partial configs
    const cfg = {
      oscillator: { ...DEFAULT_CONFIG.oscillator, ...config?.oscillator },
      lfo: { ...DEFAULT_CONFIG.lfo, ...config?.lfo },
      delay: { ...DEFAULT_CONFIG.delay, ...config?.delay },
      filter: { ...DEFAULT_CONFIG.filter, ...config?.filter },
      reverb: { ...DEFAULT_CONFIG.reverb, ...config?.reverb },
    };

    // Output: native GainNode bridged from Tone.js Volume
    this.output = getDevilboxAudioContext().createGain();
    this._toneOutput = new Tone.Volume(0);
    const nativeOut = getNativeAudioNode(this._toneOutput);
    if (nativeOut) nativeOut.connect(this.output);

    // Effects Chain
    this.reverb = new Tone.Reverb({
      decay: cfg.reverb.decay,
      wet: cfg.reverb.enabled ? cfg.reverb.wet : 0
    });

    this.delay = new Tone.FeedbackDelay({
      delayTime: cfg.delay.time,
      feedback: cfg.delay.feedback,
      wet: cfg.delay.enabled ? cfg.delay.wet : 0
    });

    this.filter = new Tone.Filter({
      frequency: cfg.filter.frequency,
      type: cfg.filter.type,
      rolloff: cfg.filter.rolloff,
      Q: 1
    });

    // Saturation for that "gritty" 555 timer sound
    this.distortion = new Tone.Distortion(0.1);

    // Gate for triggering
    this.gate = new Tone.Gain(0);

    // Oscillator
    this.osc = new Tone.Oscillator({
      type: cfg.oscillator.type
    });

    // Control Signals
    // Base Frequency Signal
    this.signal = new Tone.Signal({
      units: "frequency",
      value: cfg.oscillator.frequency,
    });

    // LFO for modulation
    this.lfo = new Tone.LFO({
      type: cfg.lfo.type,
      frequency: cfg.lfo.rate,
      amplitude: 1, // Always 1, we control range via min/max
      min: -cfg.lfo.depth, // Depth in Hz for frequency modulation
      max: cfg.lfo.depth
    });

    // Connect modulation
    // Note: Tone.js params sum input signals.
    // We set osc frequency to 0 so the signal drives it entirely
    this.osc.frequency.value = 0;
    this.signal.connect(this.osc.frequency);
    
    if (cfg.lfo.enabled) {
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
    this.reverb.connect(this._toneOutput);

    // Start oscillator immediately (it's gated)
    this.osc.start();
  }

  /**
   * Apply a full configuration to the synth
   */
  applyConfig(config: DubSirenConfig) {
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
  triggerAttack(note?: string | number, time?: number, velocity?: number) {
    void velocity;
    const t = time || audioNow();

    if (note) {
      const freq = noteToFrequency(note);
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
    const t = time || audioNow();
    // Close gate instantly (button release)
    this.gate.gain.cancelScheduledValues(t);
    this.gate.gain.setValueAtTime(0, t);
  }

  /**
   * Release all voices (panic button, song stop, etc.)
   */
  releaseAll(): void {
    this.triggerRelease();
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
    // Depth is in Hz for frequency modulation, min/max control the range
    this.lfo.min = -depth;
    this.lfo.max = depth;
  }

  setDelayTime(time: number) {
    // Clamp delay time to valid range [0, 1] to prevent console warnings
    const clampedTime = Math.max(0, Math.min(1, time));
    this.delay.delayTime.rampTo(clampedTime, 0.1);
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

  dispose(): void {
    // Stop running audio sources before disposing
    try { this.osc.stop(); } catch { /* ignore */ }
    try { this.lfo.stop(); } catch { /* ignore */ }
    this.osc.dispose();
    this.gate.dispose();
    this.filter.dispose();
    this.distortion.dispose();
    this.reverb.dispose();
    this.delay.dispose();
    this._toneOutput.dispose();
    this.output.disconnect();
    this.signal.dispose();
    this.lfo.dispose();
  }

  get volume() {
    return this._toneOutput.volume;
  }
}