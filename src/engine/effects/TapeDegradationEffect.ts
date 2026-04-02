/**
 * TapeDegradationEffect - Time-domain tape artifacts effect
 *
 * Lo-fi worn-cassette aesthetic: wow (slow pitch drift), flutter (fast pitch wobble),
 * hiss, dropouts, saturation, and tone shift.
 *
 * Signal flow: input → delay (modulated by wow+flutter LFOs) → saturation → toneFilter → hiss mix → output
 *
 * Parameters (all 0-1):
 *   - wow:        Slow pitch drift amount (LFO 0.5-2 Hz sine, ±5ms)
 *   - flutter:    Fast pitch wobble amount (LFO 4-12 Hz triangle, ±2ms)
 *   - hiss:       White noise floor level (bandpass filtered at 5kHz)
 *   - dropouts:   Random volume dip frequency (0=none, 1=frequent)
 *   - saturation:  Asymmetric tape-style soft clipping
 *   - toneShift:  Lowpass cutoff (0=3kHz dark, 1=18kHz bright)
 *   - wet:        Dry/wet mix
 */

import * as Tone from 'tone';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface TapeDegradationOptions {
  wow?: number;         // 0-1, default 0.3
  flutter?: number;     // 0-1, default 0.2
  hiss?: number;        // 0-1, default 0.15
  dropouts?: number;    // 0-1, default 0
  saturation?: number;  // 0-1, default 0.3
  toneShift?: number;   // 0-1, default 0.5
  wet?: number;         // 0-1, default 1.0
}

export class TapeDegradationEffect extends Tone.ToneAudioNode {
  readonly name = 'TapeDegradation';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Dry/wet mixing
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Wow: slow pitch drift
  private wowLFO: Tone.LFO;
  private wowDepth: Tone.Gain;

  // Flutter: fast pitch wobble
  private flutterLFO: Tone.LFO;
  private flutterDepth: Tone.Gain;

  // Modulated delay
  private modulatedDelay: Tone.Delay;

  // Saturation
  private preDriveGain: Tone.Gain;
  private waveshaper: Tone.WaveShaper;
  private makeupGain: Tone.Gain;

  // Tone filter
  private toneFilter: Tone.Filter;

  // Hiss
  private noiseSource: Tone.Noise;
  private noiseBandpass: Tone.Filter;
  private noiseGain: Tone.Gain;

  // Dropouts
  private dropoutGain: Tone.Gain;
  private dropoutInterval: ReturnType<typeof setInterval> | null = null;

  // State
  private _wow: number;
  private _flutter: number;
  private _hiss: number;
  private _dropouts: number;
  private _saturation: number;
  private _toneShift: number;
  private _wet: number;
  private _disposed = false;

  constructor(options: TapeDegradationOptions = {}) {
    super();

    this._wow = clamp01(options.wow ?? 0.3);
    this._flutter = clamp01(options.flutter ?? 0.2);
    this._hiss = clamp01(options.hiss ?? 0.15);
    this._dropouts = clamp01(options.dropouts ?? 0);
    this._saturation = clamp01(options.saturation ?? 0.3);
    this._toneShift = clamp01(options.toneShift ?? 0.5);
    this._wet = clamp01(options.wet ?? 1.0);

    // I/O
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    // --- Wow LFO: 0.5-2 Hz sine, scales to ±5ms ---
    this.wowLFO = new Tone.LFO({
      frequency: 0.5 + this._wow * 1.5,
      min: -0.005,
      max: 0.005,
      type: 'sine',
    });
    this.wowDepth = new Tone.Gain(this._wow);
    this.wowLFO.connect(this.wowDepth);

    // --- Flutter LFO: 4-12 Hz triangle, scales to ±2ms ---
    this.flutterLFO = new Tone.LFO({
      frequency: 4 + this._flutter * 8,
      min: -0.002,
      max: 0.002,
      type: 'triangle',
    });
    this.flutterDepth = new Tone.Gain(this._flutter);
    this.flutterLFO.connect(this.flutterDepth);

    // --- Modulated delay: base 10ms, max 50ms ---
    this.modulatedDelay = new Tone.Delay({
      delayTime: 0.01,
      maxDelay: 0.05,
    });

    // Connect LFO depths to delay time
    this.wowDepth.connect(this.modulatedDelay.delayTime);
    this.flutterDepth.connect(this.modulatedDelay.delayTime);

    // --- Saturation: asymmetric tanh waveshaper ---
    this.preDriveGain = new Tone.Gain(this.calculatePreDrive(this._saturation));
    this.waveshaper = new Tone.WaveShaper(
      this.createSaturationCurve(this._saturation),
      4096
    );
    this.makeupGain = new Tone.Gain(this.calculateMakeupGain(this._saturation));

    // --- Tone filter ---
    this.toneFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: this.toneShiftToFreq(this._toneShift),
      rolloff: -12,
      Q: 0.7,
    });

    // --- Hiss: white noise → bandpass 5kHz → gain ---
    this.noiseSource = new Tone.Noise('white');
    this.noiseBandpass = new Tone.Filter({
      type: 'bandpass',
      frequency: 5000,
      Q: 0.8,
    });
    this.noiseGain = new Tone.Gain(this._hiss * 0.08);
    this.noiseSource.connect(this.noiseBandpass);
    this.noiseBandpass.connect(this.noiseGain);

    // --- Dropout gain node ---
    this.dropoutGain = new Tone.Gain(1);

    // === Signal routing ===

    // Dry path: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: input → delay → preDrive → waveshaper → makeupGain → toneFilter → dropoutGain → wetGain → output
    this.input.connect(this.modulatedDelay);
    this.modulatedDelay.connect(this.preDriveGain);
    this.preDriveGain.connect(this.waveshaper);
    this.waveshaper.connect(this.makeupGain);
    this.makeupGain.connect(this.toneFilter);
    this.toneFilter.connect(this.dropoutGain);
    this.dropoutGain.connect(this.wetGain);

    // Hiss mixes into wet path
    this.noiseGain.connect(this.wetGain);

    this.wetGain.connect(this.output);

    // Start oscillators/noise
    this.wowLFO.start();
    this.flutterLFO.start();
    this.noiseSource.start();

    // Start dropout timer if needed
    this.updateDropoutInterval();
  }

  // --- Saturation helpers ---

  /**
   * Asymmetric tanh curve: positive side clips harder than negative.
   */
  private createSaturationCurve(saturation: number): Float32Array {
    const curve = new Float32Array(4096);
    const driveAmount = 1 + saturation * 8;

    for (let i = 0; i < 4096; i++) {
      const x = (i / 4096) * 2 - 1;

      if (x >= 0) {
        // Positive: harder compression (tape compresses positive peaks more)
        curve[i] = Math.tanh(x * driveAmount) * 0.95 + x * 0.02;
      } else {
        // Negative: softer compression (adds even harmonics via asymmetry)
        curve[i] = Math.tanh(x * driveAmount * 0.8);
      }
    }

    return curve;
  }

  private calculatePreDrive(saturation: number): number {
    return 1 + saturation * 3;
  }

  private calculateMakeupGain(saturation: number): number {
    return 1 / (1 + saturation * 0.6);
  }

  // --- Tone shift helper ---

  private toneShiftToFreq(toneShift: number): number {
    // 0 → 3000 Hz, 1 → 18000 Hz (exponential-ish mapping)
    return 3000 * Math.pow(18000 / 3000, toneShift);
  }

  // --- Dropout logic ---

  private updateDropoutInterval(): void {
    if (this.dropoutInterval !== null) {
      clearInterval(this.dropoutInterval);
      this.dropoutInterval = null;
    }

    if (this._dropouts <= 0 || this._disposed) return;

    // Interval: 2000ms (dropouts=1) to 8000ms (dropouts≈0)
    const intervalMs = 2000 + (1 - this._dropouts) * 6000;

    this.dropoutInterval = setInterval(() => {
      if (this._disposed) return;

      // Random gain dip: 0.1-0.4
      const dipGain = 0.1 + Math.random() * 0.3;
      // Random duration: 50-200ms
      const dipDuration = 0.05 + Math.random() * 0.15;

      const now = Tone.now();
      this.dropoutGain.gain.rampTo(dipGain, 0.005, now);
      this.dropoutGain.gain.rampTo(1, 0.01, now + dipDuration);
    }, intervalMs + Math.random() * 1000);
  }

  // --- Public parameter setters ---

  get wow(): number { return this._wow; }
  set wow(value: number) {
    this._wow = clamp01(value);
    this.wowLFO.frequency.rampTo(0.5 + this._wow * 1.5, 0.1);
    this.wowDepth.gain.rampTo(this._wow, 0.1);
  }

  get flutter(): number { return this._flutter; }
  set flutter(value: number) {
    this._flutter = clamp01(value);
    this.flutterLFO.frequency.rampTo(4 + this._flutter * 8, 0.1);
    this.flutterDepth.gain.rampTo(this._flutter, 0.1);
  }

  get hiss(): number { return this._hiss; }
  set hiss(value: number) {
    this._hiss = clamp01(value);
    this.noiseGain.gain.rampTo(this._hiss * 0.08, 0.1);
  }

  get dropouts(): number { return this._dropouts; }
  set dropouts(value: number) {
    this._dropouts = clamp01(value);
    this.updateDropoutInterval();
  }

  get saturation(): number { return this._saturation; }
  set saturation(value: number) {
    this._saturation = clamp01(value);
    this.preDriveGain.gain.rampTo(this.calculatePreDrive(this._saturation), 0.05);
    this.waveshaper.curve = this.createSaturationCurve(this._saturation);
    this.makeupGain.gain.rampTo(this.calculateMakeupGain(this._saturation), 0.05);
  }

  get toneShift(): number { return this._toneShift; }
  set toneShift(value: number) {
    this._toneShift = clamp01(value);
    this.toneFilter.frequency.rampTo(this.toneShiftToFreq(this._toneShift), 0.1);
  }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp01(value);
    this.wetGain.gain.rampTo(this._wet, 0.05);
    this.dryGain.gain.rampTo(1 - this._wet, 0.05);
  }

  // --- Cleanup ---

  dispose(): this {
    this._disposed = true;

    // Stop interval
    if (this.dropoutInterval !== null) {
      clearInterval(this.dropoutInterval);
      this.dropoutInterval = null;
    }

    // Stop oscillators/noise
    this.wowLFO.stop();
    this.flutterLFO.stop();
    this.noiseSource.stop();

    // Dispose all nodes
    this.wowLFO.dispose();
    this.wowDepth.dispose();
    this.flutterLFO.dispose();
    this.flutterDepth.dispose();
    this.modulatedDelay.dispose();
    this.preDriveGain.dispose();
    this.waveshaper.dispose();
    this.makeupGain.dispose();
    this.toneFilter.dispose();
    this.noiseSource.dispose();
    this.noiseBandpass.dispose();
    this.noiseGain.dispose();
    this.dropoutGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();

    super.dispose();
    return this;
  }
}
