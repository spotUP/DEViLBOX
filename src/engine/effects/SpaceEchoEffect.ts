import * as Tone from 'tone';

export interface SpaceEchoOptions {
  mode?: number;        // 1-12
  rate?: number;        // Delay time (ms)
  intensity?: number;   // Feedback (0-1.2)
  echoVolume?: number;  // 0-1
  reverbVolume?: number;// 0-1
  bass?: number;        // EQ (-20 to +20)
  treble?: number;      // EQ (-20 to +20)
  wow?: number;         // Wow/Flutter amount (0-1)
  wet?: number;         // 0-1
}

/**
 * Roland RE-201 Space Echo Emulation
 * 
 * Architecture:
 * - 3 Tape Heads (Delay nodes) at fixed ratios (1x, 2x, 3x)
 * - Spring Reverb
 * - 12-Mode Selector logic
 * - Tape Saturation & Filtering in feedback loop
 * - Wow/Flutter via LFO modulation acting on all heads
 */
export class SpaceEchoEffect extends Tone.ToneAudioNode {
  readonly name = 'SpaceEcho';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Tape Heads
  private head1: Tone.Delay;
  private head2: Tone.Delay;
  private head3: Tone.Delay;
  
  private head1Gain: Tone.Gain;
  private head2Gain: Tone.Gain;
  private head3Gain: Tone.Gain;

  private feedbackGain: Tone.Gain;
  private saturation: Tone.Distortion;
  private eq: Tone.EQ3;
  
  private reverb: Tone.Reverb;
  private reverbGain: Tone.Gain;
  private echoGain: Tone.Gain;

  private wowLFO: Tone.LFO;
  private wowGain: Tone.Gain;

  // Dry/Wet
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Internal State
  private _options: Required<SpaceEchoOptions>;

  constructor(options: Partial<SpaceEchoOptions> = {}) {
    super();

    this._options = {
      mode: options.mode ?? 4, 
      rate: options.rate ?? 300,
      intensity: options.intensity ?? 0.5,
      echoVolume: options.echoVolume ?? 0.8,
      reverbVolume: options.reverbVolume ?? 0.3,
      bass: options.bass ?? 0,
      treble: options.treble ?? 0,
      wow: options.wow ?? 0.15,
      wet: options.wet ?? 1,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // 1. Tape Heads
    this.head1 = new Tone.Delay(this._options.rate / 1000);
    this.head2 = new Tone.Delay((this._options.rate * 2) / 1000);
    this.head3 = new Tone.Delay((this._options.rate * 3) / 1000);

    this.head1Gain = new Tone.Gain(0);
    this.head2Gain = new Tone.Gain(0);
    this.head3Gain = new Tone.Gain(0);

    // 2. Reverb
    this.reverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01 });
    this.reverb.generate(); 
    this.reverbGain = new Tone.Gain(this._options.reverbVolume);

    this.echoGain = new Tone.Gain(this._options.echoVolume);

    // 3. Feedback Loop
    this.feedbackGain = new Tone.Gain(this._options.intensity);
    this.saturation = new Tone.Distortion(0.1);
    this.eq = new Tone.EQ3({
      low: this._options.bass,
      mid: 0,
      high: this._options.treble,
      lowFrequency: 200,
      highFrequency: 2500
    });

    // 4. Modulation
    this.wowLFO = new Tone.LFO(0.5 + Math.random() * 0.2, -0.002, 0.002);
    this.wowLFO.type = 'sine';
    this.wowGain = new Tone.Gain(this._options.wow); 
    this.wowLFO.connect(this.wowGain);
    this.wowLFO.start();

    this.wowGain.connect(this.head1.delayTime);
    this.wowGain.connect(this.head2.delayTime);
    this.wowGain.connect(this.head3.delayTime);

    // 5. Dry/Wet
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // signal routing
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.head1);
    this.input.connect(this.head2);
    this.input.connect(this.head3);
    this.input.connect(this.reverb);

    this.head1.connect(this.head1Gain);
    this.head2.connect(this.head2Gain);
    this.head3.connect(this.head3Gain);

    const echoSum = new Tone.Gain(1);
    this.head1Gain.connect(echoSum);
    this.head2Gain.connect(echoSum);
    this.head3Gain.connect(echoSum);

    echoSum.connect(this.echoGain);
    this.echoGain.connect(this.eq);

    this.eq.connect(this.saturation);
    this.saturation.connect(this.feedbackGain);
    this.feedbackGain.connect(this.head1);
    this.feedbackGain.connect(this.head2);
    this.feedbackGain.connect(this.head3);

    this.reverb.connect(this.reverbGain);

    this.eq.connect(this.wetGain);
    this.reverbGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.setMode(this._options.mode);
  }

  setMode(mode: number) {
    this._options.mode = mode;
    const h1 = [1, 5, 8, 10, 11].includes(mode);
    const h2 = [2, 4, 6, 8, 9, 11].includes(mode);
    const h3 = [3, 4, 7, 9, 10, 11].includes(mode);

    this.head1Gain.gain.rampTo(h1 ? 1 : 0, 0.1);
    this.head2Gain.gain.rampTo(h2 ? 1 : 0, 0.1);
    this.head3Gain.gain.rampTo(h3 ? 1 : 0, 0.1);

    const reverbOn = mode >= 5;
    this.reverbGain.gain.rampTo(reverbOn ? this._options.reverbVolume : 0, 0.1);
  }

  setRate(ms: number) {
    this._options.rate = ms;
    this.head1.delayTime.rampTo(ms / 1000, 0.1);
    this.head2.delayTime.rampTo((ms * 2) / 1000, 0.1);
    this.head3.delayTime.rampTo((ms * 3) / 1000, 0.1);
  }

  setIntensity(amount: number) {
    this._options.intensity = amount;
    this.feedbackGain.gain.rampTo(amount, 0.1);
  }

  setEchoVolume(vol: number) {
    this._options.echoVolume = vol;
    this.echoGain.gain.rampTo(vol, 0.1);
  }

  setReverbVolume(vol: number) {
    this._options.reverbVolume = vol;
    if (this._options.mode >= 5) {
      this.reverbGain.gain.rampTo(vol, 0.1);
    }
  }

  setBass(val: number) {
    this._options.bass = val;
    this.eq.low.value = val;
  }

  setTreble(val: number) {
    this._options.treble = val;
    this.eq.high.value = val;
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
    this.head1.dispose();
    this.head2.dispose();
    this.head3.dispose();
    this.head1Gain.dispose();
    this.head2Gain.dispose();
    this.head3Gain.dispose();
    this.feedbackGain.dispose();
    this.reverb.dispose();
    this.reverbGain.dispose();
    this.echoGain.dispose();
    this.eq.dispose();
    this.saturation.dispose();
    this.wowLFO.dispose();
    this.wowGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}