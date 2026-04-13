import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _frequency: number;
  private _amount: number;
  private _blend: number;
  private _ceil: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: ExciterOptions = {}) {
    super();
    this._frequency = options.frequency ?? 3000;
    this._amount = options.amount ?? 0.5;
    this._blend = options.blend ?? 0.5;
    this._ceil = options.ceil ?? 16000;
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
      await ExciterEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'exciter-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.workletNode.port.onmessage = (ev) => {
        if (ev.data.type === 'ready') {
          this.isWasmReady = true;
          for (const p of this.pendingParams)
            this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
          this.pendingParams = [];
          // Connect WASM first, then disconnect passthrough (avoids silent gap)
          // CRITICAL: use native disconnect to avoid Tone.js/standardized-audio-context
          // clobbering other connections on the input node (the master effects chain
          // has already wired previousEffect → this.input → this.output → nextEffect).
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            // Disconnect passthrough using native API — Tone.js disconnect can
            // clobber unrelated connections on the same node.
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.warn('[Exciter] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: ExciterEffect.wasmBinary!, jsCode: ExciterEffect.jsCode! },
        [ExciterEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('frequency', this._frequency);
      this.sendParam('amount', this._amount);
      this.sendParam('blend', this._blend);
      this.sendParam('ceil', this._ceil);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[Exciter] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}exciter/Exciter.wasm`), fetch(`${base}exciter/Exciter.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}exciter/Exciter.worklet.js`);
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

  get frequency(): number { return this._frequency; }
  set frequency(v: number) { this._frequency = clamp(v, 1000, 10000); this.sendParam('frequency', this._frequency); }

  get amount(): number { return this._amount; }
  set amount(v: number) { this._amount = clamp(v, 0, 1); this.sendParam('amount', this._amount); }

  get blend(): number { return this._blend; }
  set blend(v: number) { this._blend = clamp(v, 0, 1); this.sendParam('blend', this._blend); }

  get ceil(): number { return this._ceil; }
  set ceil(v: number) { this._ceil = clamp(v, 1000, 20000); this.sendParam('ceil', this._ceil); }

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
      case 'frequency': this.frequency = value; break;
      case 'amount': this.amount = value; break;
      case 'blend': this.blend = value; break;
      case 'ceil': this.ceil = value; break;
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
