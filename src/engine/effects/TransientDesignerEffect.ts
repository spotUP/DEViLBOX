// src/engine/effects/TransientDesignerEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface TransientDesignerOptions {
  attack?: number;
  sustain?: number;
  outputGain?: number;
  wet?: number;
}

export class TransientDesignerEffect extends Tone.ToneAudioNode {
  readonly name = 'TransientDesigner';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _attack: number;
  private _sustain: number;
  private _outputGain: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: TransientDesignerOptions = {}) {
    super();

    this._attack = options.attack ?? 0;
    this._sustain = options.sustain ?? 0;
    this._outputGain = options.outputGain ?? 1;
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
      await TransientDesignerEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'transient-designer-processor', {
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
            this.passthroughGain.gain.value = 0;
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.warn('[TransientDesigner] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: TransientDesignerEffect.wasmBinary!, jsCode: TransientDesignerEffect.jsCode! },
        [TransientDesignerEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('attack', this._attack);
      this.sendParam('sustain', this._sustain);
      this.sendParam('output', this._outputGain);

    } catch (err) {
      console.warn('[TransientDesigner] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}transient-designer/TransientDesigner.wasm`),
        fetch(`${base}transient-designer/TransientDesigner.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}transient-designer/TransientDesigner.worklet.js`);
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

  setAttack(v: number): void {
    this._attack = clamp(v, -1, 1);
    this.sendParam('attack', this._attack);
  }

  setSustain(v: number): void {
    this._sustain = clamp(v, -1, 1);
    this.sendParam('sustain', this._sustain);
  }

  setOutputGain(v: number): void {
    this._outputGain = clamp(v, 0, 2);
    this.sendParam('output', this._outputGain);
  }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get attack(): number { return this._attack; }
  get sustain(): number { return this._sustain; }
  get outputGain(): number { return this._outputGain; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'attack': this.setAttack(value); break;
      case 'sustain': this.setSustain(value); break;
      case 'output': this.setOutputGain(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.passthroughGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
