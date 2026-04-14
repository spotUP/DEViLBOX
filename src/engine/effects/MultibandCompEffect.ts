// src/engine/effects/MultibandCompEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface MultibandCompOptions {
  lowCrossover?: number;
  highCrossover?: number;
  lowThreshold?: number;
  midThreshold?: number;
  highThreshold?: number;
  lowRatio?: number;
  midRatio?: number;
  highRatio?: number;
  lowGain?: number;
  midGain?: number;
  highGain?: number;
  wet?: number;
}

export class MultibandCompEffect extends Tone.ToneAudioNode {
  readonly name = 'MultibandComp';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowCrossover: number;
  private _highCrossover: number;
  private _lowThreshold: number;
  private _midThreshold: number;
  private _highThreshold: number;
  private _lowRatio: number;
  private _midRatio: number;
  private _highRatio: number;
  private _lowGain: number;
  private _midGain: number;
  private _highGain: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultibandCompOptions = {}) {
    super();

    this._lowCrossover = options.lowCrossover ?? 200;
    this._highCrossover = options.highCrossover ?? 3000;
    this._lowThreshold = options.lowThreshold ?? -20;
    this._midThreshold = options.midThreshold ?? -20;
    this._highThreshold = options.highThreshold ?? -20;
    this._lowRatio = options.lowRatio ?? 4;
    this._midRatio = options.midRatio ?? 4;
    this._highRatio = options.highRatio ?? 4;
    this._lowGain = options.lowGain ?? 1;
    this._midGain = options.midGain ?? 1;
    this._highGain = options.highGain ?? 1;
    this._wet = options.wet ?? 1.0;

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
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
      await MultibandCompEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multiband-comp-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
          }
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
            console.warn('[MultibandComp] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MultibandCompEffect.wasmBinary!, jsCode: MultibandCompEffect.jsCode! },
        [MultibandCompEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('low_crossover', this._lowCrossover);
      this.sendParam('high_crossover', this._highCrossover);
      this.sendParam('low_threshold', this._lowThreshold);
      this.sendParam('mid_threshold', this._midThreshold);
      this.sendParam('high_threshold', this._highThreshold);
      this.sendParam('low_ratio', this._lowRatio);
      this.sendParam('mid_ratio', this._midRatio);
      this.sendParam('high_ratio', this._highRatio);
      this.sendParam('low_gain', this._lowGain);
      this.sendParam('mid_gain', this._midGain);
      this.sendParam('high_gain', this._highGain);

    } catch (err) {
      console.warn('[MultibandComp] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-comp/MultibandComp.wasm`),
        fetch(`${base}multiband-comp/MultibandComp.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-comp/MultibandComp.worklet.js`);
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

  setLowCrossover(v: number): void {
    this._lowCrossover = clamp(v, 20, 1000);
    this.sendParam('low_crossover', this._lowCrossover);
  }

  setHighCrossover(v: number): void {
    this._highCrossover = clamp(v, 500, 16000);
    this.sendParam('high_crossover', this._highCrossover);
  }

  setLowThreshold(v: number): void {
    this._lowThreshold = clamp(v, -60, 0);
    this.sendParam('low_threshold', this._lowThreshold);
  }

  setMidThreshold(v: number): void {
    this._midThreshold = clamp(v, -60, 0);
    this.sendParam('mid_threshold', this._midThreshold);
  }

  setHighThreshold(v: number): void {
    this._highThreshold = clamp(v, -60, 0);
    this.sendParam('high_threshold', this._highThreshold);
  }

  setLowRatio(v: number): void {
    this._lowRatio = clamp(v, 1, 20);
    this.sendParam('low_ratio', this._lowRatio);
  }

  setMidRatio(v: number): void {
    this._midRatio = clamp(v, 1, 20);
    this.sendParam('mid_ratio', this._midRatio);
  }

  setHighRatio(v: number): void {
    this._highRatio = clamp(v, 1, 20);
    this.sendParam('high_ratio', this._highRatio);
  }

  setLowGain(v: number): void {
    this._lowGain = clamp(v, 0, 4);
    this.sendParam('low_gain', this._lowGain);
  }

  setMidGain(v: number): void {
    this._midGain = clamp(v, 0, 4);
    this.sendParam('mid_gain', this._midGain);
  }

  setHighGain(v: number): void {
    this._highGain = clamp(v, 0, 4);
    this.sendParam('high_gain', this._highGain);
  }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get lowCrossover(): number { return this._lowCrossover; }
  get highCrossover(): number { return this._highCrossover; }
  get lowThreshold(): number { return this._lowThreshold; }
  get midThreshold(): number { return this._midThreshold; }
  get highThreshold(): number { return this._highThreshold; }
  get lowRatio(): number { return this._lowRatio; }
  get midRatio(): number { return this._midRatio; }
  get highRatio(): number { return this._highRatio; }
  get lowGain(): number { return this._lowGain; }
  get midGain(): number { return this._midGain; }
  get highGain(): number { return this._highGain; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'low_crossover': this.setLowCrossover(value); break;
      case 'high_crossover': this.setHighCrossover(value); break;
      case 'low_threshold': this.setLowThreshold(value); break;
      case 'mid_threshold': this.setMidThreshold(value); break;
      case 'high_threshold': this.setHighThreshold(value); break;
      case 'low_ratio': this.setLowRatio(value); break;
      case 'mid_ratio': this.setMidRatio(value); break;
      case 'high_ratio': this.setHighRatio(value); break;
      case 'low_gain': this.setLowGain(value); break;
      case 'mid_gain': this.setMidGain(value); break;
      case 'high_gain': this.setHighGain(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
