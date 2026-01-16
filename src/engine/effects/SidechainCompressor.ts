/**
 * SidechainCompressor - Compressor with external sidechain input
 *
 * Uses an external audio source to trigger compression on the main signal.
 * Classic use: route kick drum to sidechain to create "pumping" effect on bass.
 */

import * as Tone from 'tone';

export interface SidechainCompressorOptions {
  threshold?: number;        // -60 to 0 dB
  ratio?: number;           // 1 to 20
  attack?: number;          // 0.001 to 0.5 seconds
  release?: number;         // 0.01 to 1 seconds
  knee?: number;            // 0 to 40 dB
  sidechainGain?: number;   // Sidechain sensitivity 0-2
  wet?: number;             // 0 to 1
}

export class SidechainCompressor extends Tone.ToneAudioNode {
  readonly name = 'SidechainCompressor';

  // Main signal chain
  private compressor: Tone.Compressor;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Sidechain detection
  private sidechainInput: Tone.Gain;
  private sidechainGainNode: Tone.Gain;
  private sidechainAnalyser: Tone.Meter;

  // Parameters
  private _threshold: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _knee: number;
  private _sidechainGain: number;
  private _wet: number;

  // Animation frame for sidechain polling
  private animationFrame: number | null = null;
  private baseThreshold: number;

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  constructor(options: SidechainCompressorOptions = {}) {
    super();

    // Initialize parameters with defaults
    this._threshold = options.threshold ?? -24;
    this._ratio = options.ratio ?? 4;
    this._attack = options.attack ?? 0.003;
    this._release = options.release ?? 0.25;
    this._knee = options.knee ?? 6;
    this._sidechainGain = options.sidechainGain ?? 1;
    this._wet = options.wet ?? 1;
    this.baseThreshold = this._threshold;

    // Create input/output
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Create compressor
    this.compressor = new Tone.Compressor({
      threshold: this._threshold,
      ratio: this._ratio,
      attack: this._attack,
      release: this._release,
      knee: this._knee,
    });

    // Dry/wet mix
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    // Sidechain input chain
    this.sidechainInput = new Tone.Gain(1);
    this.sidechainGainNode = new Tone.Gain(this._sidechainGain);
    this.sidechainAnalyser = new Tone.Meter({
      smoothing: 0.8,
      normalRange: false,
    });

    // Connect main signal path
    // Wet: input -> compressor -> wetGain -> output
    this.input.connect(this.compressor);
    this.compressor.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Dry: input -> dryGain -> output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Connect sidechain detection chain
    this.sidechainInput.connect(this.sidechainGainNode);
    this.sidechainGainNode.connect(this.sidechainAnalyser);

    // Start sidechain polling
    this.startSidechainPolling();
  }

  /**
   * Get the sidechain input node for external connection
   * Connect another audio source to this to trigger compression
   */
  getSidechainInput(): Tone.Gain {
    return this.sidechainInput;
  }

  /**
   * Poll sidechain level and modulate compression
   */
  private startSidechainPolling = (): void => {
    this.updateSidechain();
  };

  private updateSidechain = (): void => {
    // Get current sidechain level in dB
    const level = this.sidechainAnalyser.getValue();
    const levelDb = typeof level === 'number' ? level : level[0];

    // Only modulate if sidechain is active (above noise floor)
    if (levelDb > -60) {
      // Calculate threshold modulation based on sidechain level
      // Higher sidechain level = lower threshold = more compression
      const normalizedLevel = Math.min(1, Math.max(0, (levelDb + 60) / 60));
      const modulation = normalizedLevel * 24 * this._sidechainGain; // Up to 24dB modulation

      // Apply modulation to threshold
      this.compressor.threshold.value = this.baseThreshold - modulation;
    } else {
      // Return to base threshold when sidechain is quiet
      this.compressor.threshold.value = this.baseThreshold;
    }

    // Continue polling
    this.animationFrame = requestAnimationFrame(this.updateSidechain);
  };

  // Getters and setters
  get threshold(): number {
    return this._threshold;
  }

  set threshold(value: number) {
    this._threshold = Math.max(-60, Math.min(0, value));
    this.baseThreshold = this._threshold;
    this.compressor.threshold.value = this._threshold;
  }

  get ratio(): number {
    return this._ratio;
  }

  set ratio(value: number) {
    this._ratio = Math.max(1, Math.min(20, value));
    this.compressor.ratio.value = this._ratio;
  }

  get attack(): number {
    return this._attack;
  }

  set attack(value: number) {
    this._attack = Math.max(0.001, Math.min(0.5, value));
    this.compressor.attack.value = this._attack;
  }

  get release(): number {
    return this._release;
  }

  set release(value: number) {
    this._release = Math.max(0.01, Math.min(1, value));
    this.compressor.release.value = this._release;
  }

  get knee(): number {
    return this._knee;
  }

  set knee(value: number) {
    this._knee = Math.max(0, Math.min(40, value));
    this.compressor.knee.value = this._knee;
  }

  get sidechainGain(): number {
    return this._sidechainGain;
  }

  set sidechainGain(value: number) {
    this._sidechainGain = Math.max(0, Math.min(2, value));
    this.sidechainGainNode.gain.value = this._sidechainGain;
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
   * Get current gain reduction in dB
   */
  getReduction(): number {
    return this.compressor.reduction;
  }

  /**
   * Clean up all nodes
   */
  dispose(): this {
    // Stop polling
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    super.dispose();
    this.compressor.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.sidechainInput.dispose();
    this.sidechainGainNode.dispose();
    this.sidechainAnalyser.dispose();

    return this;
  }
}
