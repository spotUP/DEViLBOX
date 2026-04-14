// src/engine/effects/ParametricEQEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ParametricEQOptions {
  b1Freq?: number;
  b1Gain?: number;
  b1Q?: number;
  b2Freq?: number;
  b2Gain?: number;
  b2Q?: number;
  b3Freq?: number;
  b3Gain?: number;
  b3Q?: number;
  b4Freq?: number;
  b4Gain?: number;
  b4Q?: number;
  wet?: number;
}

export class ParametricEQEffect extends Tone.ToneAudioNode {
  readonly name = 'ParametricEQ';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _b1Freq: number;
  private _b1Gain: number;
  private _b1Q: number;
  private _b2Freq: number;
  private _b2Gain: number;
  private _b2Q: number;
  private _b3Freq: number;
  private _b3Gain: number;
  private _b3Q: number;
  private _b4Freq: number;
  private _b4Gain: number;
  private _b4Q: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: ParametricEQOptions = {}) {
    super();
    this._b1Freq = options.b1Freq ?? 100;
    this._b1Gain = options.b1Gain ?? 0;
    this._b1Q = options.b1Q ?? 0.7;
    this._b2Freq = options.b2Freq ?? 500;
    this._b2Gain = options.b2Gain ?? 0;
    this._b2Q = options.b2Q ?? 0.7;
    this._b3Freq = options.b3Freq ?? 2000;
    this._b3Gain = options.b3Gain ?? 0;
    this._b3Q = options.b3Q ?? 0.7;
    this._b4Freq = options.b4Freq ?? 8000;
    this._b4Gain = options.b4Gain ?? 0;
    this._b4Q = options.b4Q ?? 0.7;
    this._wet = options.wet ?? 1.0;

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);
    this.passthroughGain = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);

    void this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await ParametricEQEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'parametric-eq-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.workletNode.port.onmessage = (ev) => {
        if (ev.data.type === 'ready') {
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
            this.passthroughGain.gain.value = 0;
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[ParametricEQ] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: ParametricEQEffect.wasmBinary!, jsCode: ParametricEQEffect.jsCode! },
        [ParametricEQEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('b1Freq', this._b1Freq);
      this.sendParam('b1Gain', this._b1Gain);
      this.sendParam('b1Q', this._b1Q);
      this.sendParam('b2Freq', this._b2Freq);
      this.sendParam('b2Gain', this._b2Gain);
      this.sendParam('b2Q', this._b2Q);
      this.sendParam('b3Freq', this._b3Freq);
      this.sendParam('b3Gain', this._b3Gain);
      this.sendParam('b3Q', this._b3Q);
      this.sendParam('b4Freq', this._b4Freq);
      this.sendParam('b4Gain', this._b4Gain);
      this.sendParam('b4Q', this._b4Q);
    } catch (err) {
      console.warn('[ParametricEQ] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}parametric-eq/ParametricEQ.wasm`), fetch(`${base}parametric-eq/ParametricEQ.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}parametric-eq/ParametricEQ.worklet.js`);
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

  setB1Freq(v: number): void { this._b1Freq = clamp(v, 20, 500); this.sendParam('b1Freq', this._b1Freq); }
  setB1Gain(v: number): void { this._b1Gain = clamp(v, -18, 18); this.sendParam('b1Gain', this._b1Gain); }
  setB1Q(v: number): void { this._b1Q = clamp(v, 0.1, 10); this.sendParam('b1Q', this._b1Q); }
  setB2Freq(v: number): void { this._b2Freq = clamp(v, 100, 2000); this.sendParam('b2Freq', this._b2Freq); }
  setB2Gain(v: number): void { this._b2Gain = clamp(v, -18, 18); this.sendParam('b2Gain', this._b2Gain); }
  setB2Q(v: number): void { this._b2Q = clamp(v, 0.1, 10); this.sendParam('b2Q', this._b2Q); }
  setB3Freq(v: number): void { this._b3Freq = clamp(v, 500, 8000); this.sendParam('b3Freq', this._b3Freq); }
  setB3Gain(v: number): void { this._b3Gain = clamp(v, -18, 18); this.sendParam('b3Gain', this._b3Gain); }
  setB3Q(v: number): void { this._b3Q = clamp(v, 0.1, 10); this.sendParam('b3Q', this._b3Q); }
  setB4Freq(v: number): void { this._b4Freq = clamp(v, 2000, 20000); this.sendParam('b4Freq', this._b4Freq); }
  setB4Gain(v: number): void { this._b4Gain = clamp(v, -18, 18); this.sendParam('b4Gain', this._b4Gain); }
  setB4Q(v: number): void { this._b4Q = clamp(v, 0.1, 10); this.sendParam('b4Q', this._b4Q); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get b1Freq(): number { return this._b1Freq; }
  get b1Gain(): number { return this._b1Gain; }
  get b1Q(): number { return this._b1Q; }
  get b2Freq(): number { return this._b2Freq; }
  get b2Gain(): number { return this._b2Gain; }
  get b2Q(): number { return this._b2Q; }
  get b3Freq(): number { return this._b3Freq; }
  get b3Gain(): number { return this._b3Gain; }
  get b3Q(): number { return this._b3Q; }
  get b4Freq(): number { return this._b4Freq; }
  get b4Gain(): number { return this._b4Gain; }
  get b4Q(): number { return this._b4Q; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'b1Freq': this.setB1Freq(value); break;
      case 'b1Gain': this.setB1Gain(value); break;
      case 'b1Q': this.setB1Q(value); break;
      case 'b2Freq': this.setB2Freq(value); break;
      case 'b2Gain': this.setB2Gain(value); break;
      case 'b2Q': this.setB2Q(value); break;
      case 'b3Freq': this.setB3Freq(value); break;
      case 'b3Gain': this.setB3Gain(value); break;
      case 'b3Q': this.setB3Q(value); break;
      case 'b4Freq': this.setB4Freq(value); break;
      case 'b4Gain': this.setB4Gain(value); break;
      case 'b4Q': this.setB4Q(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.passthroughGain.dispose(); this.dryGain.dispose(); this.wetGain.dispose();
    this.input.dispose(); this.output.dispose();
    super.dispose();
    return this;
  }
}
