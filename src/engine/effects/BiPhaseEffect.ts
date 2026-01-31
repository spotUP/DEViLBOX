import * as Tone from 'tone';

export interface BiPhaseOptions {
  rateA?: number;       // Hz (0.1 - 10)
  depthA?: number;      // 0-1
  rateB?: number;       // Hz (0.1 - 10)
  depthB?: number;      // 0-1
  feedback?: number;    // 0-1
  routing?: 'series' | 'parallel';
  wet?: number;         // 0-1
}

/**
 * Mu-Tron Bi-Phase Emulation
 * 
 * Architecture:
 * - Dual Phaser circuits (Phaser A and Phaser B)
 * - Flexible routing:
 *   - Series: Input -> Phaser A -> Phaser B -> Output (Deep, complex swooshing)
 *   - Parallel: Input -> Phaser A / Input -> Phaser B -> Mix -> Output (Stereo width)
 */
export class BiPhaseEffect extends Tone.ToneAudioNode {
  readonly name = 'BiPhase';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private phaserA: Tone.Phaser;
  private phaserB: Tone.Phaser;
  
  // Routing Gains
  private parallelInB: Tone.Gain; // Input -> Phaser B
  private seriesInB: Tone.Gain;   // Phaser A -> Phaser B
  private outputA: Tone.Gain;     // Phaser A -> Output
  private outputB: Tone.Gain;     // Phaser B -> Output

  // Dry/Wet
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Internal State
  private _options: Required<BiPhaseOptions>;

  constructor(options: Partial<BiPhaseOptions> = {}) {
    super();

    this._options = {
      rateA: options.rateA ?? 0.5,
      depthA: options.depthA ?? 0.6,
      rateB: options.rateB ?? 4.0,
      depthB: options.depthB ?? 0.4,
      feedback: options.feedback ?? 0.3,
      routing: options.routing ?? 'parallel',
      wet: options.wet ?? 1,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Phaser A
    this.phaserA = new Tone.Phaser({
      frequency: this._options.rateA,
      octaves: this._options.depthA * 5,
      baseFrequency: 350,
      stages: 6,
      Q: this._options.feedback * 20,
    });

    // Phaser B
    this.phaserB = new Tone.Phaser({
      frequency: this._options.rateB,
      octaves: this._options.depthB * 5,
      baseFrequency: 450,
      stages: 6,
      Q: this._options.feedback * 20,
    });

    // Routing Logic Nodes
    this.parallelInB = new Tone.Gain(0);
    this.seriesInB = new Tone.Gain(0);
    this.outputA = new Tone.Gain(1);
    this.outputB = new Tone.Gain(1);

    // Dry/Wet nodes
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // --- WIRING ---

    // 1. Dry Path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // 2. Wet Path Input
    // Input always feeds Phaser A
    this.input.connect(this.phaserA);
    // Input conditionally feeds Phaser B (Parallel mode)
    this.input.connect(this.parallelInB);
    this.parallelInB.connect(this.phaserB);

    // 3. Series Connection
    // Phaser A feeds Phaser B (Series mode)
    this.phaserA.connect(this.seriesInB);
    this.seriesInB.connect(this.phaserB);

    // 4. Outputs
    // Phaser A -> Output Gain -> Wet Gain
    this.phaserA.connect(this.outputA);
    this.outputA.connect(this.wetGain);

    // Phaser B -> Output Gain -> Wet Gain
    this.phaserB.connect(this.outputB);
    this.outputB.connect(this.wetGain);

    // Final wet connection
    this.wetGain.connect(this.output);

    // Initialize State
    this.setRouting(this._options.routing);
  }

  setRouting(mode: 'series' | 'parallel') {
    this._options.routing = mode;

    if (mode === 'parallel') {
      this.parallelInB.gain.rampTo(1, 0.1); 
      this.seriesInB.gain.rampTo(0, 0.1);   
      this.outputA.gain.rampTo(1, 0.1);     
      this.outputB.gain.rampTo(1, 0.1);     
    } else {
      this.parallelInB.gain.rampTo(0, 0.1); 
      this.seriesInB.gain.rampTo(1, 0.1);   
      this.outputA.gain.rampTo(0, 0.1);     
      this.outputB.gain.rampTo(1, 0.1);     
    }
  }

  setRateA(val: number) {
    this._options.rateA = val;
    this.phaserA.frequency.rampTo(val, 0.1);
  }

  setDepthA(val: number) {
    this._options.depthA = val;
    this.phaserA.octaves = val * 5;
  }

  setRateB(val: number) {
    this._options.rateB = val;
    this.phaserB.frequency.rampTo(val, 0.1);
  }

  setDepthB(val: number) {
    this._options.depthB = val;
    this.phaserB.octaves = val * 5;
  }

  setFeedback(val: number) {
    this._options.feedback = val;
    const q = val * 20;
    this.phaserA.Q.value = q;
    this.phaserB.Q.value = q;
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
    this.phaserA.dispose();
    this.phaserB.dispose();
    this.parallelInB.dispose();
    this.seriesInB.dispose();
    this.outputA.dispose();
    this.outputB.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}
