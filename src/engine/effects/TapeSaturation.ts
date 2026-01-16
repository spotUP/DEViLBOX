/**
 * TapeSaturation - Analog tape warmth effect
 *
 * Simulates the asymmetric soft clipping and harmonic saturation
 * of magnetic tape recording.
 */

import * as Tone from 'tone';

export interface TapeSaturationOptions {
  drive?: number;     // 0-1, maps to saturation amount
  tone?: number;      // 2000-20000 Hz, treble roll-off frequency
  wet?: number;       // 0-1, dry/wet mix
}

export class TapeSaturation extends Tone.ToneAudioNode {
  readonly name = 'TapeSaturation';

  // Signal chain nodes
  private inputGain: Tone.Gain;
  private saturation: Tone.WaveShaper;
  private toneFilter: Tone.Filter;
  private outputGain: Tone.Gain;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Parameters
  private _drive: number;
  private _tone: number;
  private _wet: number;

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  constructor(options: TapeSaturationOptions = {}) {
    super();

    this._drive = options.drive ?? 0.5;
    this._tone = options.tone ?? 12000;
    this._wet = options.wet ?? 1;

    // Create nodes
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Input gain (pre-saturation drive)
    this.inputGain = new Tone.Gain(this.calculateInputGain(this._drive));

    // Saturation via waveshaper with asymmetric curve
    this.saturation = new Tone.WaveShaper(
      this.createSaturationCurve(this._drive),
      4096
    );

    // Tone control (high shelf roll-off)
    this.toneFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: this._tone,
      rolloff: -12,
      Q: 0.7,
    });

    // Output makeup gain
    this.outputGain = new Tone.Gain(this.calculateMakeupGain(this._drive));

    // Dry/wet mix
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    // Connect signal chain
    // Wet path: input -> inputGain -> saturation -> toneFilter -> outputGain -> wetGain -> output
    this.input.connect(this.inputGain);
    this.inputGain.connect(this.saturation);
    this.saturation.connect(this.toneFilter);
    this.toneFilter.connect(this.outputGain);
    this.outputGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Dry path: input -> dryGain -> output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
  }

  /**
   * Create asymmetric saturation curve simulating tape
   * Tape compresses positive peaks harder than negative
   */
  private createSaturationCurve(drive: number): Float32Array {
    const curve = new Float32Array(4096);
    const driveAmount = 1 + drive * 8; // 1-9x drive

    for (let i = 0; i < 4096; i++) {
      const x = (i / 4096) * 2 - 1; // -1 to 1

      if (x >= 0) {
        // Positive: harder compression with subtle 2nd harmonic
        curve[i] = Math.tanh(x * driveAmount) * 0.95 + x * 0.02;
      } else {
        // Negative: softer compression (asymmetry adds even harmonics)
        curve[i] = Math.tanh(x * driveAmount * 0.85);
      }
    }

    return curve;
  }

  /**
   * Calculate input gain based on drive
   */
  private calculateInputGain(drive: number): number {
    return 1 + drive * 2; // 1-3x input boost
  }

  /**
   * Calculate makeup gain to compensate for saturation
   */
  private calculateMakeupGain(drive: number): number {
    return 1 / (1 + drive * 0.5); // Reduce output as drive increases
  }

  // Getters and setters
  get drive(): number {
    return this._drive;
  }

  set drive(value: number) {
    this._drive = Math.max(0, Math.min(1, value));
    this.inputGain.gain.value = this.calculateInputGain(this._drive);
    this.saturation.curve = this.createSaturationCurve(this._drive);
    this.outputGain.gain.value = this.calculateMakeupGain(this._drive);
  }

  get tone(): number {
    return this._tone;
  }

  set tone(value: number) {
    this._tone = Math.max(2000, Math.min(20000, value));
    this.toneFilter.frequency.value = this._tone;
  }

  get wet(): number {
    return this._wet;
  }

  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  /**
   * Clean up all nodes
   */
  dispose(): this {
    super.dispose();
    this.inputGain.dispose();
    this.saturation.dispose();
    this.toneFilter.dispose();
    this.outputGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    return this;
  }
}
