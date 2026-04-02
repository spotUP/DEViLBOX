/**
 * AmbientDelayEffect - Modulated multi-tap delay with filter in the feedback path
 *
 * Delays evolve and decay into washed-out ambience.
 * Valhalla Delay / Strymon Timeline style.
 *
 * Signal flow:
 *   input → tap1 (time×1.0) → sum → feedbackFilter → allpass diffusion → feedbackGain → back to taps
 *          → tap2 (time×1.5) ↗
 *          → tap3 (time×2.0) ↗
 *   tapSum → wet output
 */

import * as Tone from 'tone';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface AmbientDelayOptions {
  time?: number;          // Delay time in seconds (0.01-2.0, default 0.375)
  feedback?: number;      // Feedback amount (0-0.95, default 0.55)
  taps?: number;          // Number of taps 1-3 (default 2)
  filterType?: BiquadFilterType; // lowpass | highpass | bandpass (default lowpass)
  filterFreq?: number;    // Filter frequency Hz (200-8000, default 2500)
  filterQ?: number;       // Filter Q (0.5-8, default 1.5)
  modRate?: number;       // Modulation rate 0-1 (default 0.3)
  modDepth?: number;      // Modulation depth 0-1 (default 0.15)
  stereoSpread?: number;  // Stereo spread 0-1 (default 0.5)
  diffusion?: number;     // Allpass diffusion 0-1 (default 0.2)
  wet?: number;           // Dry/wet mix 0-1 (default 0.4)
}

export class AmbientDelayEffect extends Tone.ToneAudioNode {
  readonly name = 'AmbientDelay';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Delay taps
  private tap1Delay: Tone.Delay;
  private tap2Delay: Tone.Delay;
  private tap3Delay: Tone.Delay;
  private tap1Gain: Tone.Gain;
  private tap2Gain: Tone.Gain;
  private tap3Gain: Tone.Gain;

  // Stereo panning per tap
  private tap1Pan: Tone.Panner;
  private tap2Pan: Tone.Panner;
  private tap3Pan: Tone.Panner;

  // Feedback path
  private tapSum: Tone.Gain;
  private feedbackFilter: Tone.Filter;
  private allpass1: Tone.Filter;
  private allpass2: Tone.Filter;
  private feedbackGain: Tone.Gain;

  // Modulation
  private modLFO: Tone.LFO;
  private modGain: Tone.Gain;

  // Dry/Wet
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private _options: Required<AmbientDelayOptions>;

  constructor(options: Partial<AmbientDelayOptions> = {}) {
    super();

    this._options = {
      time: Math.max(0.01, Math.min(options.time ?? 0.375, 2.0)),
      feedback: Math.max(0, Math.min(options.feedback ?? 0.55, 0.95)),
      taps: Math.max(1, Math.min(Math.round(options.taps ?? 2), 3)),
      filterType: options.filterType ?? 'lowpass',
      filterFreq: Math.max(200, Math.min(options.filterFreq ?? 2500, 8000)),
      filterQ: Math.max(0.5, Math.min(options.filterQ ?? 1.5, 8)),
      modRate: clamp01(options.modRate ?? 0.3),
      modDepth: clamp01(options.modDepth ?? 0.15),
      stereoSpread: clamp01(options.stereoSpread ?? 0.5),
      diffusion: clamp01(options.diffusion ?? 0.2),
      wet: clamp01(options.wet ?? 0.4),
    };

    const t = this._options.time;

    // I/O
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Dry/wet mixing
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // 3 delay taps at time ratios 1.0, 1.5, 2.0
    this.tap1Delay = new Tone.Delay({ delayTime: t * 1.0, maxDelay: 4.0 });
    this.tap2Delay = new Tone.Delay({ delayTime: t * 1.5, maxDelay: 4.0 });
    this.tap3Delay = new Tone.Delay({ delayTime: t * 2.0, maxDelay: 4.0 });

    // Tap gains: tap1 always on, tap2/3 conditional on taps count
    this.tap1Gain = new Tone.Gain(1.0);
    this.tap2Gain = new Tone.Gain(this._options.taps >= 2 ? 0.7 : 0);
    this.tap3Gain = new Tone.Gain(this._options.taps >= 3 ? 0.5 : 0);

    // Stereo panning: tap1 center, tap2 -spread, tap3 +spread
    this.tap1Pan = new Tone.Panner(0);
    this.tap2Pan = new Tone.Panner(-this._options.stereoSpread);
    this.tap3Pan = new Tone.Panner(this._options.stereoSpread);

    // Tap sum collects all panned taps
    this.tapSum = new Tone.Gain(1);

    // Feedback filter
    this.feedbackFilter = new Tone.Filter({
      frequency: this._options.filterFreq,
      type: this._options.filterType,
      Q: this._options.filterQ,
    });

    // Allpass diffusion (2 cascaded allpass filters)
    this.allpass1 = new Tone.Filter({
      frequency: 800,
      type: 'allpass',
      Q: this._options.diffusion * 8,
    });
    this.allpass2 = new Tone.Filter({
      frequency: 1200,
      type: 'allpass',
      Q: this._options.diffusion * 8,
    });

    // Feedback gain
    this.feedbackGain = new Tone.Gain(this._options.feedback);

    // Modulation: LFO → scaled gain → modulates delay times
    const lfoFreq = 0.1 + this._options.modRate * 2.9; // 0.1-3.0 Hz
    this.modLFO = new Tone.LFO({
      frequency: lfoFreq,
      type: 'sine',
      min: -0.005,  // -5ms
      max: 0.005,   // +5ms
    });
    this.modGain = new Tone.Gain(this._options.modDepth);

    // --- Signal routing ---

    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Input → all 3 taps
    this.input.connect(this.tap1Delay);
    this.input.connect(this.tap2Delay);
    this.input.connect(this.tap3Delay);

    // Taps → gains → panners → tapSum
    this.tap1Delay.connect(this.tap1Gain);
    this.tap2Delay.connect(this.tap2Gain);
    this.tap3Delay.connect(this.tap3Gain);

    this.tap1Gain.connect(this.tap1Pan);
    this.tap2Gain.connect(this.tap2Pan);
    this.tap3Gain.connect(this.tap3Pan);

    this.tap1Pan.connect(this.tapSum);
    this.tap2Pan.connect(this.tapSum);
    this.tap3Pan.connect(this.tapSum);

    // Wet output
    this.tapSum.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Feedback path: tapSum → filter → allpass1 → allpass2 → feedbackGain → back to taps
    this.tapSum.connect(this.feedbackFilter);
    this.feedbackFilter.connect(this.allpass1);
    this.allpass1.connect(this.allpass2);
    this.allpass2.connect(this.feedbackGain);

    this.feedbackGain.connect(this.tap1Delay);
    this.feedbackGain.connect(this.tap2Delay);
    this.feedbackGain.connect(this.tap3Delay);

    // Modulation routing: LFO → modGain → delay times
    this.modLFO.connect(this.modGain);
    this.modGain.connect(this.tap1Delay.delayTime);
    this.modGain.connect(this.tap2Delay.delayTime);
    this.modGain.connect(this.tap3Delay.delayTime);
    this.modLFO.start();
  }

  // --- Parameter setters with smooth transitions ---

  set time(value: number) {
    this._options.time = Math.max(0.01, Math.min(value, 2.0));
    const t = this._options.time;
    this.tap1Delay.delayTime.rampTo(t * 1.0, 0.1);
    this.tap2Delay.delayTime.rampTo(t * 1.5, 0.1);
    this.tap3Delay.delayTime.rampTo(t * 2.0, 0.1);
  }

  get time(): number {
    return this._options.time;
  }

  set feedback(value: number) {
    this._options.feedback = Math.max(0, Math.min(value, 0.95));
    this.feedbackGain.gain.rampTo(this._options.feedback, 0.05);
  }

  get feedback(): number {
    return this._options.feedback;
  }

  set taps(value: number) {
    this._options.taps = Math.max(1, Math.min(Math.round(value), 3));
    this.tap2Gain.gain.rampTo(this._options.taps >= 2 ? 0.7 : 0, 0.05);
    this.tap3Gain.gain.rampTo(this._options.taps >= 3 ? 0.5 : 0, 0.05);
  }

  get taps(): number {
    return this._options.taps;
  }

  set filterType(value: BiquadFilterType) {
    this._options.filterType = value;
    this.feedbackFilter.type = value;
  }

  get filterType(): BiquadFilterType {
    return this._options.filterType;
  }

  set filterFreq(value: number) {
    this._options.filterFreq = Math.max(200, Math.min(value, 8000));
    this.feedbackFilter.frequency.rampTo(this._options.filterFreq, 0.05);
  }

  get filterFreq(): number {
    return this._options.filterFreq;
  }

  set filterQ(value: number) {
    this._options.filterQ = Math.max(0.5, Math.min(value, 8));
    this.feedbackFilter.Q.rampTo(this._options.filterQ, 0.05);
  }

  get filterQ(): number {
    return this._options.filterQ;
  }

  set modRate(value: number) {
    this._options.modRate = clamp01(value);
    this.modLFO.frequency.rampTo(0.1 + this._options.modRate * 2.9, 0.1);
  }

  get modRate(): number {
    return this._options.modRate;
  }

  set modDepth(value: number) {
    this._options.modDepth = clamp01(value);
    this.modGain.gain.rampTo(this._options.modDepth, 0.05);
  }

  get modDepth(): number {
    return this._options.modDepth;
  }

  set stereoSpread(value: number) {
    this._options.stereoSpread = clamp01(value);
    this.tap2Pan.pan.rampTo(-this._options.stereoSpread, 0.05);
    this.tap3Pan.pan.rampTo(this._options.stereoSpread, 0.05);
  }

  get stereoSpread(): number {
    return this._options.stereoSpread;
  }

  set diffusion(value: number) {
    this._options.diffusion = clamp01(value);
    const q = this._options.diffusion * 8;
    this.allpass1.Q.rampTo(q, 0.05);
    this.allpass2.Q.rampTo(q, 0.05);
  }

  get diffusion(): number {
    return this._options.diffusion;
  }

  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.wetGain.gain.rampTo(this._options.wet, 0.05);
    this.dryGain.gain.rampTo(1 - this._options.wet, 0.05);
  }

  get wet(): number {
    return this._options.wet;
  }

  dispose(): this {
    this.modLFO.stop();
    this.modLFO.dispose();
    this.modGain.dispose();
    this.tap1Delay.dispose();
    this.tap2Delay.dispose();
    this.tap3Delay.dispose();
    this.tap1Gain.dispose();
    this.tap2Gain.dispose();
    this.tap3Gain.dispose();
    this.tap1Pan.dispose();
    this.tap2Pan.dispose();
    this.tap3Pan.dispose();
    this.tapSum.dispose();
    this.feedbackFilter.dispose();
    this.allpass1.dispose();
    this.allpass2.dispose();
    this.feedbackGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
