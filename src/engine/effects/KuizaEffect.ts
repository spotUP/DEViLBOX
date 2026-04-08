/**
 * KuizaEffect.ts — Kuiza via WASM AudioWorklet.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface KuizaOptions {
  low?: number;
  lowMid?: number;
  highMid?: number;
  high?: number;
  gain?: number;
  mix?: number;
  wet?: number;
}

export class KuizaEffect extends Tone.ToneAudioNode {
  readonly name = 'Kuiza';
  readonly _input: Tone.Gain;
  readonly _output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _low: number;
  private _lowMid: number;
  private _highMid: number;
  private _high: number;
  private _gain: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: KuizaOptions = {}) {
    super();
    this._low = options.low ?? 0.0;
    this._lowMid = options.lowMid ?? 0.0;
    this._highMid = options.highMid ?? 0.0;
    this._high = options.high ?? 0.0;
    this._gain = options.gain ?? 0.0;
    this._mix = options.mix ?? 1.0;
    this._wet = options.wet ?? 1.0;

    this._input  = new Tone.Gain(1);
    this._output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    this._input.connect(this.dryGain);
    this.dryGain.connect(this._output);
    this.wetGain.connect(this._output);
    this._input.connect(this.wetGain);

    void this._initWorklet();
  }

  get input() { return this._input; }
  get output() { return this._output; }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await KuizaEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'kuiza-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
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
            const rawInput = getNativeAudioNode(this._input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            // Now safe to disconnect passthrough
            try { this._input.disconnect(this.wetGain); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[Kuiza] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: KuizaEffect.wasmBinary!, jsCode: KuizaEffect.jsCode! },
        [KuizaEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('low', this._low);
      this.sendParam('lowMid', this._lowMid);
      this.sendParam('highMid', this._highMid);
      this.sendParam('high', this._high);
      this.sendParam('gain', this._gain);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[Kuiza] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}kuiza/Kuiza.wasm`), fetch(`${base}kuiza/Kuiza.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}kuiza/Kuiza.worklet.js`);
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

  setLow(v: number): void { this._low = Math.max(-12.0, Math.min(12.0, v)); this.sendParam('low', this._low); }
  setLowMid(v: number): void { this._lowMid = Math.max(-12.0, Math.min(12.0, v)); this.sendParam('lowMid', this._lowMid); }
  setHighMid(v: number): void { this._highMid = Math.max(-12.0, Math.min(12.0, v)); this.sendParam('highMid', this._highMid); }
  setHigh(v: number): void { this._high = Math.max(-12.0, Math.min(12.0, v)); this.sendParam('high', this._high); }
  setGain(v: number): void { this._gain = Math.max(-12.0, Math.min(12.0, v)); this.sendParam('gain', this._gain); }
  setMix(v: number): void { this._mix = Math.max(0.0, Math.min(1.0, v)); this.sendParam('mix', this._mix); }

  get low(): number { return this._low; }
  get lowMid(): number { return this._lowMid; }
  get highMid(): number { return this._highMid; }
  get high(): number { return this._high; }
  get gain(): number { return this._gain; }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'low': this.setLow(value); break;
      case 'lowMid': this.setLowMid(value); break;
      case 'highMid': this.setHighMid(value); break;
      case 'high': this.setHigh(value); break;
      case 'gain': this.setGain(value); break;
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
    this._input.dispose(); this._output.dispose();
    super.dispose();
    return this;
  }
}
