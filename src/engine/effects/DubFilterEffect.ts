import * as Tone from 'tone';

export interface DubFilterOptions {
  cutoff?: number;    // 20 - 10000 Hz
  resonance?: number; // 0 - 100
  gain?: number;      // 0 - 2 (Output gain/drive)
  wet?: number;       // 0 - 1
}

/**
 * King Tubby "Big Knob" Filter Emulation
 * 
 * A performance-oriented High Pass Filter (HPF) with high resonance
 * and subtle saturation, modeled after the Altec/MCI console filters
 * used in classic Jamaican dub mixing.
 */
export class DubFilterEffect extends Tone.ToneAudioNode {
  readonly name = 'DubFilter';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private filter: Tone.Filter;
  private drive: Tone.Distortion;
  private gainNode: Tone.Gain;

  // Dry/Wet
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Internal State
  private _options: Required<DubFilterOptions>;

  constructor(options: Partial<DubFilterOptions> = {}) {
    super();

    this._options = {
      cutoff: options.cutoff ?? 20,
      resonance: options.resonance ?? 1,
      gain: options.gain ?? 1,
      wet: options.wet ?? 1,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // 1. Filter Stage
    // Use -24dB/oct for a steep "Tubby" cut
    this.filter = new Tone.Filter({
      frequency: this._options.cutoff,
      type: 'highpass',
      rolloff: -24,
      Q: (this._options.resonance / 100) * 20
    });

    // 2. Drive Stage
    this.drive = new Tone.Distortion({
      distortion: 0.1,
      wet: 0.5
    });

    // 3. Output Gain
    this.gainNode = new Tone.Gain(this._options.gain);

    // 4. Dry/Wet nodes
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // --- WIRING ---
    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path
    this.input.connect(this.filter);
    this.filter.connect(this.drive);
    this.drive.connect(this.gainNode);
    this.gainNode.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  setCutoff(val: number) {
    this._options.cutoff = val;
    this.filter.frequency.rampTo(val, 0.05); 
  }

  setResonance(val: number) {
    this._options.resonance = val;
    const q = (val / 100) * 20;
    this.filter.Q.rampTo(q, 0.1);
  }

  setGain(val: number) {
    this._options.gain = val;
    this.gainNode.gain.rampTo(val, 0.1);
  }

  get wet(): number {
    return this._options.wet;
  }

  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  dispose(): this {
    super.dispose();
    this.filter.dispose();
    this.drive.dispose();
    this.gainNode.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}