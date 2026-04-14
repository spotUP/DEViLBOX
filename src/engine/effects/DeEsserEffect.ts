// src/engine/effects/DeEsserEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface DeEsserOptions {
  frequency?: number;
  bandwidth?: number;
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  wet?: number;
}

export class DeEsserEffect extends Tone.ToneAudioNode {
  readonly name = 'DeEsser';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _frequency: number;
  private _bandwidth: number;
  private _threshold: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: DeEsserOptions = {}) {
    super();
    this._frequency = options.frequency ?? 6000;
    this._bandwidth = options.bandwidth ?? 1;
    this._threshold = options.threshold ?? -20;
    this._ratio = options.ratio ?? 4;
    this._attack = options.attack ?? 1;
    this._release = options.release ?? 50;
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
      await DeEsserEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'deesser-processor', {
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
            console.warn('[DeEsser] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: DeEsserEffect.wasmBinary!, jsCode: DeEsserEffect.jsCode! },
        [DeEsserEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('frequency', this._frequency);
      this.sendParam('bandwidth', this._bandwidth);
      this.sendParam('threshold', this._threshold);
      this.sendParam('ratio', this._ratio);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
    } catch (err) {
      console.warn('[DeEsser] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}deesser/DeEsser.wasm`), fetch(`${base}deesser/DeEsser.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}deesser/DeEsser.worklet.js`);
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

  setFrequency(v: number): void { this._frequency = clamp(v, 2000, 10000); this.sendParam('frequency', this._frequency); }
  setBandwidth(v: number): void { this._bandwidth = clamp(v, 0.1, 2); this.sendParam('bandwidth', this._bandwidth); }
  setThreshold(v: number): void { this._threshold = clamp(v, -40, 0); this.sendParam('threshold', this._threshold); }
  setRatio(v: number): void { this._ratio = clamp(v, 1, 10); this.sendParam('ratio', this._ratio); }
  setAttack(v: number): void { this._attack = clamp(v, 0.1, 10); this.sendParam('attack', this._attack); }
  setRelease(v: number): void { this._release = clamp(v, 10, 200); this.sendParam('release', this._release); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get frequency(): number { return this._frequency; }
  get bandwidth(): number { return this._bandwidth; }
  get threshold(): number { return this._threshold; }
  get ratio(): number { return this._ratio; }
  get attack(): number { return this._attack; }
  get release(): number { return this._release; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'frequency': this.setFrequency(value); break;
      case 'bandwidth': this.setBandwidth(value); break;
      case 'threshold': this.setThreshold(value); break;
      case 'ratio': this.setRatio(value); break;
      case 'attack': this.setAttack(value); break;
      case 'release': this.setRelease(value); break;
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
