/**
 * ExciterEffect — Harmonic exciter using native Web Audio nodes.
 *
 * Signal chain: HP filter → drive → waveshaper (tanh) → LP ceiling → mix with dry.
 * Pure Web Audio — no WASM worklet, no async init, no disconnect issues.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function buildTanhCurve(samples: number, drive: number): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (2 * i) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * drive);
  }
  return curve;
}

export interface ExciterOptions {
  frequency?: number;
  amount?: number;
  blend?: number;
  ceil?: number;
  mix?: number;
  wet?: number;
}

export class ExciterEffect extends Tone.ToneAudioNode {
  readonly name = 'Exciter';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Native Web Audio nodes for the exciter sidechain
  private hpFilter: BiquadFilterNode;
  private driveGain: GainNode;
  private shaper: WaveShaperNode;
  private lpFilter: BiquadFilterNode;
  private excitedGain: GainNode;

  private _frequency: number;
  private _amount: number;
  private _blend: number;
  private _ceil: number;
  private _mix: number;
  private _wet: number;

  constructor(options: ExciterOptions = {}) {
    super();
    this._frequency = clamp(options.frequency ?? 3000, 1000, 10000);
    this._amount = clamp(options.amount ?? 0.5, 0, 1);
    this._blend = clamp(options.blend ?? 0.5, 0, 1);
    this._ceil = clamp(options.ceil ?? 16000, 1000, 20000);
    this._mix = clamp(options.mix ?? 1, 0, 1);
    this._wet = clamp(options.wet ?? 1.0, 0, 1);

    const rawCtx = Tone.getContext().rawContext as AudioContext;

    // Tone.js gain nodes for dry/wet mix
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    // Dry path: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path (clean signal): input → wetGain → output
    this.input.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Exciter sidechain (native Web Audio): input → HP → drive → shaper → LP → excitedGain → output
    // This ADDS harmonic content on top — the wet signal passes through clean,
    // and the exciter sidechain generates and adds high-frequency harmonics.
    this.hpFilter = rawCtx.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = this._frequency;
    this.hpFilter.Q.value = 0.707;

    this.driveGain = rawCtx.createGain();
    this.driveGain.gain.value = 1 + this._amount * 20;

    this.shaper = rawCtx.createWaveShaper();
    this.shaper.curve = buildTanhCurve(4096, 1 + this._blend * 3) as Float32Array<ArrayBuffer>;
    this.shaper.oversample = '2x';

    this.lpFilter = rawCtx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = this._ceil;
    this.lpFilter.Q.value = 0.707;

    this.excitedGain = rawCtx.createGain();
    this.excitedGain.gain.value = this._mix;

    // Wire the native sidechain: nativeInput → HP → drive → shaper → LP → excitedGain → nativeOutput
    const nativeIn = getNativeAudioNode(this.input)!;
    const nativeOut = getNativeAudioNode(this.output)!;

    nativeIn.connect(this.hpFilter);
    this.hpFilter.connect(this.driveGain);
    this.driveGain.connect(this.shaper);
    this.shaper.connect(this.lpFilter);
    this.lpFilter.connect(this.excitedGain);
    this.excitedGain.connect(nativeOut);
  }

  get frequency(): number { return this._frequency; }
  set frequency(v: number) {
    this._frequency = clamp(v, 1000, 10000);
    this.hpFilter.frequency.value = this._frequency;
  }

  get amount(): number { return this._amount; }
  set amount(v: number) {
    this._amount = clamp(v, 0, 1);
    this.driveGain.gain.value = 1 + this._amount * 20;
  }

  get blend(): number { return this._blend; }
  set blend(v: number) {
    this._blend = clamp(v, 0, 1);
    this.shaper.curve = buildTanhCurve(4096, 1 + this._blend * 3) as Float32Array<ArrayBuffer>;
  }

  get ceil(): number { return this._ceil; }
  set ceil(v: number) {
    this._ceil = clamp(v, 1000, 20000);
    this.lpFilter.frequency.value = this._ceil;
  }

  get mix(): number { return this._mix; }
  set mix(v: number) {
    this._mix = clamp(v, 0, 1);
    this.excitedGain.gain.value = this._mix;
  }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'frequency': this.frequency = value; break;
      case 'amount': this.amount = value; break;
      case 'blend': this.blend = value; break;
      case 'ceil': this.ceil = value; break;
      case 'mix': this.mix = value; break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    this.hpFilter.disconnect();
    this.driveGain.disconnect();
    this.shaper.disconnect();
    this.lpFilter.disconnect();
    this.excitedGain.disconnect();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
