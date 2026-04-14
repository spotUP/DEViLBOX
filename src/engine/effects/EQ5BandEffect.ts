// src/engine/effects/EQ5BandEffect.ts
/**
 * EQ5BandEffect — 5-band parametric EQ via WASM AudioWorklet.
 *
 * 2 shelving (low/high) + 3 peaking biquad filters.
 *
 * Parameters:
 *   lowShelfFreq   20..500 Hz
 *   lowShelfGain   -36..36 dB
 *   peak1Freq      100..2000 Hz
 *   peak1Gain      -36..36 dB
 *   peak1Q         0.1..10
 *   peak2Freq      500..5000 Hz
 *   peak2Gain      -36..36 dB
 *   peak2Q         0.1..10
 *   peak3Freq      2000..15000 Hz
 *   peak3Gain      -36..36 dB
 *   peak3Q         0.1..10
 *   highShelfFreq  2000..20000 Hz
 *   highShelfGain  -36..36 dB
 *   mix            0..1
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

export interface EQ5BandOptions {
  lowShelfFreq?: number; lowShelfGain?: number;
  peak1Freq?: number; peak1Gain?: number; peak1Q?: number;
  peak2Freq?: number; peak2Gain?: number; peak2Q?: number;
  peak3Freq?: number; peak3Gain?: number; peak3Q?: number;
  highShelfFreq?: number; highShelfGain?: number;
  mix?: number; wet?: number;
}

export class EQ5BandEffect extends Tone.ToneAudioNode {
  readonly name = 'EQ5Band';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowShelfFreq: number; private _lowShelfGain: number;
  private _peak1Freq: number; private _peak1Gain: number; private _peak1Q: number;
  private _peak2Freq: number; private _peak2Gain: number; private _peak2Q: number;
  private _peak3Freq: number; private _peak3Gain: number; private _peak3Q: number;
  private _highShelfFreq: number; private _highShelfGain: number;
  private _mix: number; private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: EQ5BandOptions = {}) {
    super();
    this._lowShelfFreq = options.lowShelfFreq ?? 100;
    this._lowShelfGain = options.lowShelfGain ?? 0;
    this._peak1Freq = options.peak1Freq ?? 500;
    this._peak1Gain = options.peak1Gain ?? 0;
    this._peak1Q = options.peak1Q ?? 1;
    this._peak2Freq = options.peak2Freq ?? 1500;
    this._peak2Gain = options.peak2Gain ?? 0;
    this._peak2Q = options.peak2Q ?? 1;
    this._peak3Freq = options.peak3Freq ?? 5000;
    this._peak3Gain = options.peak3Gain ?? 0;
    this._peak3Q = options.peak3Q ?? 1;
    this._highShelfFreq = options.highShelfFreq ?? 8000;
    this._highShelfGain = options.highShelfGain ?? 0;
    this._mix = options.mix ?? 1;
    this._wet = options.wet ?? 1;

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);

    void this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await EQ5BandEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'eq5-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.isWasmReady = true;
          for (const p of this.pendingParams)
            this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
          this.pendingParams = [];
          // Connect WASM first, then disconnect passthrough (avoids silent gap)
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            // Now safe to disconnect passthrough
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[EQ5Band] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: EQ5BandEffect.wasmBinary!, jsCode: EQ5BandEffect.jsCode! },
        [EQ5BandEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowShelfFreq', this._lowShelfFreq);
      this.sendParam('lowShelfGain', this._lowShelfGain);
      this.sendParam('peak1Freq', this._peak1Freq);
      this.sendParam('peak1Gain', this._peak1Gain);
      this.sendParam('peak1Q', this._peak1Q);
      this.sendParam('peak2Freq', this._peak2Freq);
      this.sendParam('peak2Gain', this._peak2Gain);
      this.sendParam('peak2Q', this._peak2Q);
      this.sendParam('peak3Freq', this._peak3Freq);
      this.sendParam('peak3Gain', this._peak3Gain);
      this.sendParam('peak3Q', this._peak3Q);
      this.sendParam('highShelfFreq', this._highShelfFreq);
      this.sendParam('highShelfGain', this._highShelfGain);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[EQ5Band] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}eq5/EQ5Band.wasm`), fetch(`${base}eq5/EQ5Band.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}eq5/EQ5Band.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  private sendParam(param: string, value: number): void {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', param, value });
    } else {
      this.pendingParams = this.pendingParams.filter(p => p.param !== param);
      this.pendingParams.push({ param, value });
    }
  }

  setLowShelfFreq(v: number): void { this._lowShelfFreq = clamp(v, 20, 500); this.sendParam('lowShelfFreq', this._lowShelfFreq); }
  setLowShelfGain(v: number): void { this._lowShelfGain = clamp(v, -36, 36); this.sendParam('lowShelfGain', this._lowShelfGain); }
  setPeak1Freq(v: number): void { this._peak1Freq = clamp(v, 100, 2000); this.sendParam('peak1Freq', this._peak1Freq); }
  setPeak1Gain(v: number): void { this._peak1Gain = clamp(v, -36, 36); this.sendParam('peak1Gain', this._peak1Gain); }
  setPeak1Q(v: number): void { this._peak1Q = clamp(v, 0.1, 10); this.sendParam('peak1Q', this._peak1Q); }
  setPeak2Freq(v: number): void { this._peak2Freq = clamp(v, 500, 5000); this.sendParam('peak2Freq', this._peak2Freq); }
  setPeak2Gain(v: number): void { this._peak2Gain = clamp(v, -36, 36); this.sendParam('peak2Gain', this._peak2Gain); }
  setPeak2Q(v: number): void { this._peak2Q = clamp(v, 0.1, 10); this.sendParam('peak2Q', this._peak2Q); }
  setPeak3Freq(v: number): void { this._peak3Freq = clamp(v, 2000, 15000); this.sendParam('peak3Freq', this._peak3Freq); }
  setPeak3Gain(v: number): void { this._peak3Gain = clamp(v, -36, 36); this.sendParam('peak3Gain', this._peak3Gain); }
  setPeak3Q(v: number): void { this._peak3Q = clamp(v, 0.1, 10); this.sendParam('peak3Q', this._peak3Q); }
  setHighShelfFreq(v: number): void { this._highShelfFreq = clamp(v, 2000, 20000); this.sendParam('highShelfFreq', this._highShelfFreq); }
  setHighShelfGain(v: number): void { this._highShelfGain = clamp(v, -36, 36); this.sendParam('highShelfGain', this._highShelfGain); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  get lowShelfFreq(): number { return this._lowShelfFreq; }
  get lowShelfGain(): number { return this._lowShelfGain; }
  get peak1Freq(): number { return this._peak1Freq; }
  get peak1Gain(): number { return this._peak1Gain; }
  get peak1Q(): number { return this._peak1Q; }
  get peak2Freq(): number { return this._peak2Freq; }
  get peak2Gain(): number { return this._peak2Gain; }
  get peak2Q(): number { return this._peak2Q; }
  get peak3Freq(): number { return this._peak3Freq; }
  get peak3Gain(): number { return this._peak3Gain; }
  get peak3Q(): number { return this._peak3Q; }
  get highShelfFreq(): number { return this._highShelfFreq; }
  get highShelfGain(): number { return this._highShelfGain; }
  get mix(): number { return this._mix; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'lowShelfFreq': this.setLowShelfFreq(value); break;
      case 'lowShelfGain': this.setLowShelfGain(value); break;
      case 'peak1Freq': this.setPeak1Freq(value); break;
      case 'peak1Gain': this.setPeak1Gain(value); break;
      case 'peak1Q': this.setPeak1Q(value); break;
      case 'peak2Freq': this.setPeak2Freq(value); break;
      case 'peak2Gain': this.setPeak2Gain(value); break;
      case 'peak2Q': this.setPeak2Q(value); break;
      case 'peak3Freq': this.setPeak3Freq(value); break;
      case 'peak3Gain': this.setPeak3Gain(value); break;
      case 'peak3Q': this.setPeak3Q(value); break;
      case 'highShelfFreq': this.setHighShelfFreq(value); break;
      case 'highShelfGain': this.setHighShelfGain(value); break;
      case 'mix': this.setMix(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.dryGain.dispose(); this.wetGain.dispose();
    this.input.dispose(); this.output.dispose();
    super.dispose();
    return this;
  }
}
