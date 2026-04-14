// src/engine/effects/ExpanderEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ExpanderOptions {
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  range?: number;
  knee?: number;
  wet?: number;
}

export class ExpanderEffect extends Tone.ToneAudioNode {
  readonly name = 'Expander';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _threshold: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _range: number;
  private _knee: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: ExpanderOptions = {}) {
    super();

    this._threshold = options.threshold ?? -30;
    this._ratio = options.ratio ?? 2;
    this._attack = options.attack ?? 1;
    this._release = options.release ?? 100;
    this._range = options.range ?? -60;
    this._knee = options.knee ?? 6;
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
      await ExpanderEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'expander-processor', {
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
            console.warn('[Expander] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: ExpanderEffect.wasmBinary!, jsCode: ExpanderEffect.jsCode! },
        [ExpanderEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('threshold', this._threshold);
      this.sendParam('ratio', this._ratio);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('range', this._range);
      this.sendParam('knee', this._knee);

    } catch (err) {
      console.warn('[Expander] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}expander/Expander.wasm`),
        fetch(`${base}expander/Expander.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}expander/Expander.worklet.js`);
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

  setThreshold(v: number): void {
    this._threshold = clamp(v, -60, 0);
    this.sendParam('threshold', this._threshold);
  }

  setRatio(v: number): void {
    this._ratio = clamp(v, 1, 10);
    this.sendParam('ratio', this._ratio);
  }

  setAttack(v: number): void {
    this._attack = clamp(v, 0.1, 100);
    this.sendParam('attack', this._attack);
  }

  setRelease(v: number): void {
    this._release = clamp(v, 10, 1000);
    this.sendParam('release', this._release);
  }

  setRange(v: number): void {
    this._range = clamp(v, -90, 0);
    this.sendParam('range', this._range);
  }

  setKnee(v: number): void {
    this._knee = clamp(v, 0, 24);
    this.sendParam('knee', this._knee);
  }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get threshold(): number { return this._threshold; }
  get ratio(): number { return this._ratio; }
  get attack(): number { return this._attack; }
  get release(): number { return this._release; }
  get range(): number { return this._range; }
  get knee(): number { return this._knee; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'threshold': this.setThreshold(value); break;
      case 'ratio': this.setRatio(value); break;
      case 'attack': this.setAttack(value); break;
      case 'release': this.setRelease(value); break;
      case 'range': this.setRange(value); break;
      case 'knee': this.setKnee(value); break;
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
