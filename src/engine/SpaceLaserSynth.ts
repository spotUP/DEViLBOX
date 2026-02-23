import * as Tone from 'tone';
import type { SpaceLaserConfig } from '@/types/instrument';
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, getNativeAudioNode, audioNow, noteToFrequency } from '@/utils/audio-context';

export class SpaceLaserSynth implements DevilboxSynth {
  readonly name = 'SpaceLaserSynth';
  readonly output: GainNode;
  private synth: Tone.FMSynth;
  private filter: Tone.Filter;
  private noise: Tone.Noise;
  private noiseGain: Tone.Gain;
  private reverb: Tone.Reverb;
  private delay: Tone.FeedbackDelay;
  private _toneOutput: Tone.Volume;
  private config: SpaceLaserConfig;

  constructor(config: SpaceLaserConfig) {
    this.config = config;

    // Output: native GainNode bridged from Tone.js Volume
    this.output = getDevilboxAudioContext().createGain();
    this._toneOutput = new Tone.Volume(0);
    const nativeOut = getNativeAudioNode(this._toneOutput);
    if (nativeOut) nativeOut.connect(this.output);

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
      frequency: config.filter.cutoff,
      type: config.filter.type,
      Q: config.filter.resonance / 10
    });

    // FM Synth for the core metallic sound
    this.synth = new Tone.FMSynth({
      harmonicity: config.fm.ratio,
      modulationIndex: config.fm.amount,
      oscillator: { type: 'sine' },
      modulation: { type: 'square' },
      envelope: {
        attack: 0.001,
        decay: config.laser.sweepTime / 1000,
        sustain: 0,
        release: 0.1
      },
      modulationEnvelope: {
        attack: 0.001,
        decay: config.laser.sweepTime / 1000,
        sustain: 0,
        release: 0.1
      }
    });

    // Noise for extra grit
    this.noise = new Tone.Noise({
      type: config.noise.type,
      volume: -Infinity
    });
    this.noiseGain = new Tone.Gain(config.noise.amount / 100);
    this.noise.connect(this.noiseGain);

    // Audio Chain
    this.synth.connect(this.filter);
    this.noiseGain.connect(this.filter);
    this.filter.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this._toneOutput);

    // Start background nodes
    this.noise.start();
  }

  /**
   * Apply a full configuration to the synth
   */
  applyConfig(config: SpaceLaserConfig) {
    this.config = config;
    
    this.synth.harmonicity.value = config.fm.ratio;
    this.synth.modulationIndex.value = config.fm.amount;
    
    this.synth.envelope.decay = config.laser.sweepTime / 1000;
    this.synth.modulationEnvelope.decay = config.laser.sweepTime / 1000;

    this.noise.type = config.noise.type;
    this.noiseGain.gain.rampTo(config.noise.amount / 100, 0.1);

    this.filter.type = config.filter.type;
    this.filter.frequency.rampTo(config.filter.cutoff, 0.1);
    this.filter.Q.rampTo(config.filter.resonance / 10, 0.1);

    this.delay.delayTime.rampTo(config.delay.time, 0.1);
    this.delay.feedback.rampTo(config.delay.feedback, 0.1);
    this.delay.wet.rampTo(config.delay.enabled ? config.delay.wet : 0, 0.1);

    this.reverb.decay = config.reverb.decay;
    this.reverb.wet.rampTo(config.reverb.enabled ? config.reverb.wet : 0, 0.1);
  }

  /**
   * Trigger the space laser
   */
  triggerAttack(note?: string | number, time?: number, velocity: number = 1) {
    const t = time || audioNow();
    const duration = this.config.laser.sweepTime / 1000;

    // Use note if provided, otherwise start frequency
    const startFreq = note ? noteToFrequency(note) : this.config.laser.startFreq;
    const endFreq = this.config.laser.endFreq;

    // Trigger envelope and set initial frequency (triggerAttack sets frequency internally)
    this.synth.triggerAttack(startFreq, t, velocity);

    // PITCH SWEEP - The "Pew Pew"
    // Schedule the frequency ramp AFTER triggerAttack sets the initial frequency
    this.synth.frequency.cancelScheduledValues(t + 0.001);
    if (this.config.laser.sweepCurve === 'exponential') {
      this.synth.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    } else {
      this.synth.frequency.linearRampToValueAtTime(endFreq, t + duration);
    }

    // Auto-release after duration
    this.synth.triggerRelease(t + duration);
  }

  /**
   * Manual release
   */
  triggerRelease(time?: number) {
    // If time is null or undefined, use immediate time to prevent Tone.js ReferenceError/AssertionError
    const t = time === null || time === undefined ? audioNow() : time;
    this.synth.triggerRelease(t);
  }

  /**
   * Release all voices (panic button, song stop, etc.)
   */
  releaseAll(): void {
    this.triggerRelease();
  }

  dispose(): void {
    // Stop noise before disposing to ensure clean shutdown
    this.noise.stop();

    this.synth.dispose();
    this.filter.dispose();
    this.noise.dispose();
    this.noiseGain.dispose();
    this.reverb.dispose();
    this.delay.dispose();
    this._toneOutput.dispose();
    this.output.disconnect();
  }

  get volume() {
    return this._toneOutput.volume;
  }
}
