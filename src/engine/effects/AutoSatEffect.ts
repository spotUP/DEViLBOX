import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface AutoSatOptions {
  amount?: number;
  mix?: number;
  wet?: number;
}

export class AutoSatEffect extends Tone.ToneAudioNode {
  readonly name = 'AutoSat';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _amount: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: AutoSatOptions = {}) {
    super();
    this._amount = options.amount ?? 0.5;
    this._mix = options.mix ?? 1;
    this._wet = options.wet ?? 1.0;

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
      await AutoSatEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'autosat-processor', {
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
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[AutoSat] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: AutoSatEffect.wasmBinary!, jsCode: AutoSatEffect.jsCode! },
        [AutoSatEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('amount', this._amount);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[AutoSat] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}autosat/AutoSat.wasm`), fetch(`${base}autosat/AutoSat.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}autosat/AutoSat.worklet.js`);
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

  get amount(): number { return this._amount; }
  set amount(v: number) { this._amount = clamp(v, 0, 1); this.sendParam('amount', this._amount); }

  get mix(): number { return this._mix; }
  set mix(v: number) { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'amount': this.amount = value; break;
      case 'mix': this.mix = value; break;
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
