/**
 * DeckIsolatorEQ - the DJ deck's 3-band isolator EQ (low / mid / high, each
 * a gain in dB, -Infinity = kill), flat when every band is at 0 dB.
 *
 * Tone.EQ3 is not flat at 0 dB: its MultibandSplit sums 12 dB/oct low-pass
 * and high-pass bands at each crossover, which cancel there (LP2 + HP2 =
 * (1 + s^2) / (s^2 + s/Q + 1), a notch). Measured on the deck chain: -10.5 dB
 * at 400 Hz and -10.4 dB at 2.5 kHz with every knob at zero - the DJ view
 * sounded "processed" next to the tracker view playing the same song.
 *
 * This isolator uses Linkwitz-Riley 24 dB/oct crossovers (two cascaded
 * Butterworth biquads, Q = 1/sqrt 2), whose low and high bands sum to an
 * all-pass. The three-band tree:
 *
 *   low  = LR4-LP(400)  -> all-pass(2500)
 *   mid  = LR4-HP(400)  -> LR4-LP(2500)
 *   high = LR4-HP(400)  -> LR4-HP(2500)
 *
 * mid + high = HP(400) * AP(2500), so low + mid + high = AP(400) * AP(2500):
 * unity magnitude at every frequency (the bands only differ in phase, as in
 * any crossover). The all-pass on the low band is the second crossover's sum
 * (LR4-LP + LR4-HP = the 2nd-order all-pass with Q = 1/sqrt 2). The bilinear
 * transform maps the analogue identity onto the biquads exactly.
 *
 * Same public surface as the Tone.EQ3 it replaces: `low` / `mid` / `high`
 * decibel params, `connect`, `dispose`.
 */
import * as Tone from 'tone';

const LOW_CROSSOVER_HZ = 400;
const HIGH_CROSSOVER_HZ = 2500;
/**
 * Butterworth Q for one 2nd-order section. A Web Audio low-pass / high-pass
 * biquad reads Q in dB (resonance), so 1/sqrt 2 is written as -3.01 dB; the
 * all-pass reads Q linearly. (Tone.Filter's Q param is clamped to >= 0, so
 * these are native biquads.)
 */
const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);
const BUTTERWORTH_Q_LINEAR = Math.SQRT1_2;

export interface DeckIsolatorEQOptions {
  low: number;
  mid: number;
  high: number;
}

export class DeckIsolatorEQ extends Tone.ToneAudioNode<Tone.ToneAudioNodeOptions> {
  readonly name: string = 'DeckIsolatorEQ';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  readonly low: Tone.Param<'decibels'>;
  readonly mid: Tone.Param<'decibels'>;
  readonly high: Tone.Param<'decibels'>;

  private readonly biquads: BiquadFilterNode[] = [];
  private readonly lowGain: Tone.Gain<'decibels'>;
  private readonly midGain: Tone.Gain<'decibels'>;
  private readonly highGain: Tone.Gain<'decibels'>;

  constructor(options: Partial<DeckIsolatorEQOptions> = {}) {
    super(Tone.ToneAudioNode.getDefaults());
    const context = this.context;
    this.input = new Tone.Gain({ context });
    this.output = new Tone.Gain({ context });
    const biquad = (type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode => {
      const node = context.createBiquadFilter() as unknown as BiquadFilterNode;
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      this.biquads.push(node);
      return node;
    };
    /** Linkwitz-Riley 24 dB/oct: two cascaded Butterworth sections. */
    const lr4 = (type: 'lowpass' | 'highpass', frequency: number): [BiquadFilterNode, BiquadFilterNode] => {
      const a = biquad(type, frequency, BUTTERWORTH_Q_DB);
      const b = biquad(type, frequency, BUTTERWORTH_Q_DB);
      a.connect(b);
      return [a, b];
    };
    this.lowGain = new Tone.Gain({ context, gain: options.low ?? 0, units: 'decibels' });
    this.midGain = new Tone.Gain({ context, gain: options.mid ?? 0, units: 'decibels' });
    this.highGain = new Tone.Gain({ context, gain: options.high ?? 0, units: 'decibels' });
    this.low = this.lowGain.gain;
    this.mid = this.midGain.gain;
    this.high = this.highGain.gain;

    const [lowIn, lowOut] = lr4('lowpass', LOW_CROSSOVER_HZ);
    const lowAllPass = biquad('allpass', HIGH_CROSSOVER_HZ, BUTTERWORTH_Q_LINEAR);
    const [upperIn, upperOut] = lr4('highpass', LOW_CROSSOVER_HZ);
    const [midIn, midOut] = lr4('lowpass', HIGH_CROSSOVER_HZ);
    const [highIn, highOut] = lr4('highpass', HIGH_CROSSOVER_HZ);

    Tone.connect(this.input, lowIn);
    lowOut.connect(lowAllPass);
    Tone.connect(lowAllPass, this.lowGain);
    Tone.connect(this.input, upperIn);
    upperOut.connect(midIn);
    upperOut.connect(highIn);
    Tone.connect(midOut, this.midGain);
    Tone.connect(highOut, this.highGain);
    this.lowGain.connect(this.output);
    this.midGain.connect(this.output);
    this.highGain.connect(this.output);
  }

  dispose(): this {
    super.dispose();
    for (const node of this.biquads) node.disconnect();
    for (const node of [this.input, this.output, this.lowGain, this.midGain, this.highGain]) node.dispose();
    return this;
  }
}
