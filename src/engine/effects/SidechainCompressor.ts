/**
 * SidechainCompressor - Compressor with external sidechain input
 *
 * Uses an external audio source to trigger gain ducking on the main signal.
 * Classic use: route kick drum to sidechain to create "pumping" effect on bass.
 *
 * Architecture: sidechain → meter → fast polling → gain duck on main signal.
 * Uses 4ms polling interval + low smoothing for responsive dynamics.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface SidechainCompressorOptions {
  threshold?: number;        // -60 to 0 dB
  ratio?: number;           // 1 to 20
  attack?: number;          // 0.001 to 0.5 seconds
  release?: number;         // 0.01 to 1 seconds
  knee?: number;            // 0 to 40 dB
  sidechainGain?: number;   // Sidechain sensitivity 0-2
  scFreq?: number;          // Sidechain filter frequency 20-20000 Hz (0 = off)
  scQ?: number;             // Sidechain filter Q 0.1-10
  scFilterType?: string;    // 'lowpass' | 'highpass' | 'bandpass' (default: lowpass)
  wet?: number;             // 0 to 1
}

export class SidechainCompressor extends Tone.ToneAudioNode {
  readonly name = 'SidechainCompressor';

  // Main signal chain — gain ducking
  private duckGain: Tone.Gain;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // Sidechain detection
  private sidechainInput: Tone.Gain;
  private selfRouteGain: Tone.Gain;
  private sidechainGainNode: Tone.Gain;
  private scFilter: BiquadFilterNode;
  private analyser: AnalyserNode;
  private analyserBuffer: Float32Array;

  // Parameters
  private _threshold: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _knee: number;
  private _sidechainGain: number;
  private _scFreq: number;
  private _scQ: number;
  private _scFilterType: BiquadFilterType;
  private _wet: number;

  // Envelope state — start at -100 dB (silence) to avoid false ducking on first enable
  private envelope = -100;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  constructor(options: SidechainCompressorOptions = {}) {
    super();

    this._threshold = options.threshold ?? -24;
    this._ratio = options.ratio ?? 4;
    this._attack = options.attack ?? 0.003;
    this._release = options.release ?? 0.25;
    this._knee = options.knee ?? 6;
    this._sidechainGain = options.sidechainGain ?? 1;
    this._scFreq = options.scFreq ?? 0;
    this._scQ = options.scQ ?? 1;
    this._scFilterType = (options.scFilterType as BiquadFilterType) ?? 'lowpass';
    this._wet = options.wet ?? 1;

    const rawCtx = Tone.getContext().rawContext as AudioContext;

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);
    this.duckGain = new Tone.Gain(1);

    // Sidechain chain with optional frequency filter
    this.sidechainInput = new Tone.Gain(1);
    this.sidechainGainNode = new Tone.Gain(this._sidechainGain);
    this.scFilter = rawCtx.createBiquadFilter();
    this.scFilter.type = this._scFilterType;
    this.scFilter.frequency.value = this._scFreq > 0 ? this._scFreq : 20000;
    this.scFilter.Q.value = this._scQ;
    this.analyser = rawCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyserBuffer = new Float32Array(this.analyser.fftSize);

    // Wet path: input → duckGain → wetGain → output (all Tone.js connections)
    this.input.connect(this.duckGain);
    this.duckGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Dry path: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Sidechain detection: sidechainInput → gain → filter → analyser
    const rawScGain = getNativeAudioNode(this.sidechainGainNode);
    this.sidechainInput.connect(this.sidechainGainNode);
    if (rawScGain) rawScGain.connect(this.scFilter);
    this.scFilter.connect(this.analyser);

    // Self-route: main input feeds sidechain for self-detection mode.
    // Controlled by selfRouteGain — set to 0 when external source is wired.
    this.selfRouteGain = new Tone.Gain(1);
    this.input.connect(this.selfRouteGain);
    this.selfRouteGain.connect(this.sidechainInput);

    // Fast polling at 4ms (~250Hz) for responsive dynamics
    this.pollTimer = setInterval(this.updateDucking, 4);
  }

  getSidechainInput(): Tone.Gain {
    return this.sidechainInput;
  }

  /** Enable/disable self-route (input→sidechain). Called by wireMasterSidechain. */
  setSelfSidechain(enabled: boolean): void {
    this.selfRouteGain.gain.value = enabled ? 1 : 0;
  }

  private updateDucking = (): void => {
    // Get peak level from analyser
    this.analyser.getFloatTimeDomainData(this.analyserBuffer as Float32Array<ArrayBuffer>);
    let peak = 0;
    for (let i = 0; i < this.analyserBuffer.length; i++) {
      const abs = Math.abs(this.analyserBuffer[i]);
      if (abs > peak) peak = abs;
    }

    // Convert to dB
    const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -100;

    // Envelope follower (attack/release in seconds, polling at ~250Hz)
    const dt = 0.004; // 4ms polling interval
    const attackCoeff = 1 - Math.exp(-dt / Math.max(this._attack, 0.0001));
    const releaseCoeff = 1 - Math.exp(-dt / Math.max(this._release, 0.001));

    if (peakDb > this.envelope) {
      this.envelope += attackCoeff * (peakDb - this.envelope);
    } else {
      this.envelope += releaseCoeff * (peakDb - this.envelope);
    }

    // Compute gain reduction
    let gainDb = 0;
    const overDb = this.envelope - this._threshold;

    if (overDb > 0) {
      // Soft knee
      if (this._knee > 0 && overDb < this._knee) {
        const x = overDb / this._knee;
        gainDb = -(overDb * x * (1 - 1 / this._ratio)) / 2;
      } else {
        gainDb = -(overDb * (1 - 1 / this._ratio));
      }
    }

    // Apply gain — direct value set for immediate response
    const gainLin = Math.pow(10, gainDb / 20);
    this.duckGain.gain.value = gainLin;
  };

  get threshold(): number { return this._threshold; }
  set threshold(value: number) {
    this._threshold = Math.max(-60, Math.min(0, value));
  }

  get ratio(): number { return this._ratio; }
  set ratio(value: number) {
    this._ratio = Math.max(1, Math.min(20, value));
  }

  get attack(): number { return this._attack; }
  set attack(value: number) {
    this._attack = Math.max(0.001, Math.min(0.5, value));
  }

  get release(): number { return this._release; }
  set release(value: number) {
    this._release = Math.max(0.01, Math.min(1, value));
  }

  get knee(): number { return this._knee; }
  set knee(value: number) {
    this._knee = Math.max(0, Math.min(40, value));
  }

  get sidechainGain(): number { return this._sidechainGain; }
  set sidechainGain(value: number) {
    this._sidechainGain = Math.max(0, Math.min(2, value));
    this.sidechainGainNode.gain.value = this._sidechainGain;
  }

  get scFreq(): number { return this._scFreq; }
  set scFreq(value: number) {
    this._scFreq = Math.max(0, Math.min(20000, value));
    if (this._scFreq <= 0) {
      // Filter off — force lowpass at 20kHz (transparent regardless of scFilterType)
      this.scFilter.type = 'lowpass';
      this.scFilter.frequency.value = 20000;
    } else {
      this.scFilter.type = this._scFilterType;
      this.scFilter.frequency.value = this._scFreq;
    }
  }

  get scQ(): number { return this._scQ; }
  set scQ(value: number) {
    this._scQ = Math.max(0.1, Math.min(10, value));
    this.scFilter.Q.value = this._scQ;
  }

  get scFilterType(): string { return this._scFilterType; }
  set scFilterType(value: string) {
    const valid: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];
    this._scFilterType = valid.includes(value as BiquadFilterType) ? value as BiquadFilterType : 'lowpass';
    // Only apply filter type when filter is active (scFreq > 0)
    if (this._scFreq > 0) {
      this.scFilter.type = this._scFilterType;
    }
  }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  getReduction(): number {
    return this.duckGain.gain.value < 1 ? 20 * Math.log10(this.duckGain.gain.value) : 0;
  }

  dispose(): this {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.duckGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.sidechainInput.dispose();
    this.selfRouteGain.dispose();
    this.sidechainGainNode.dispose();
    try { this.scFilter.disconnect(); } catch { /* */ }
    try { this.analyser.disconnect(); } catch { /* */ }
    this.input.dispose();
    this.output.dispose();
    super.dispose();

    return this;
  }
}
