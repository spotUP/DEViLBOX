// src/engine/effects/BassEnhancerEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface BassEnhancerOptions {
  frequency?: number;
  amount?: number;
  drive?: number;
  mix?: number;
  wet?: number;
}

export class BassEnhancerEffect extends Tone.ToneAudioNode {
  readonly name = 'BassEnhancer';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _frequency: number;
  private _amount: number;
  private _drive: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: BassEnhancerOptions = {}) {
    super();

    this._frequency = options.frequency ?? 100;
    this._amount = options.amount ?? 0.5;
    this._drive = options.drive ?? 0;
    this._mix = options.mix ?? 1;
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
      await BassEnhancerEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'bass-enhancer-processor', {
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
          // CRITICAL: use native disconnect to avoid Tone.js/standardized-audio-context
          // clobbering other connections on the input node.
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            // Disconnect passthrough using native API
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.warn('[BassEnhancer] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: BassEnhancerEffect.wasmBinary!, jsCode: BassEnhancerEffect.jsCode! },
        [BassEnhancerEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('frequency', this._frequency);
      this.sendParam('amount', this._amount);
      this.sendParam('drive', this._drive);
      this.sendParam('mix', this._mix);

    } catch (err) {
      console.warn('[BassEnhancer] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}bass-enhancer/BassEnhancer.wasm`),
        fetch(`${base}bass-enhancer/BassEnhancer.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}bass-enhancer/BassEnhancer.worklet.js`);
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

  setFrequency(v: number): void {
    this._frequency = clamp(v, 30, 300);
    this.sendParam('frequency', this._frequency);
  }

  setAmount(v: number): void {
    this._amount = clamp(v, 0, 1);
    this.sendParam('amount', this._amount);
  }

  setDrive(v: number): void {
    this._drive = clamp(v, 0, 1);
    this.sendParam('drive', this._drive);
  }

  setMix(v: number): void {
    this._mix = clamp(v, 0, 1);
    this.sendParam('mix', this._mix);
  }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get frequency(): number { return this._frequency; }
  get amount(): number { return this._amount; }
  get drive(): number { return this._drive; }
  get mix(): number { return this._mix; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'frequency': this.setFrequency(value); break;
      case 'amount': this.setAmount(value); break;
      case 'drive': this.setDrive(value); break;
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
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
