// src/engine/effects/DragonflyHallEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface DragonflyHallOptions {
  decay?: number;
  damping?: number;
  predelay?: number;
  width?: number;
  earlyLevel?: number;
  size?: number;
  wet?: number;
}

export class DragonflyHallEffect extends Tone.ToneAudioNode {
  readonly name = 'DragonflyHall';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _decay: number;
  private _damping: number;
  private _predelay: number;
  private _width: number;
  private _earlyLevel: number;
  private _size: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: DragonflyHallOptions = {}) {
    super();
    this._decay = options.decay ?? 0.8;
    this._damping = options.damping ?? 0.4;
    this._predelay = options.predelay ?? 20;
    this._width = options.width ?? 1;
    this._earlyLevel = options.earlyLevel ?? 0.5;
    this._size = options.size ?? 1.5;
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
      await DragonflyHallEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'dragonfly-hall-processor', {
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
            console.warn('[DragonflyHall] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: DragonflyHallEffect.wasmBinary!, jsCode: DragonflyHallEffect.jsCode! },
        [DragonflyHallEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('decay', this._decay);
      this.sendParam('damping', this._damping);
      this.sendParam('predelay', this._predelay);
      this.sendParam('width', this._width);
      this.sendParam('early_level', this._earlyLevel);
      this.sendParam('size', this._size);
    } catch (err) {
      console.warn('[DragonflyHall] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}dragonfly-hall/DragonflyHall.wasm`), fetch(`${base}dragonfly-hall/DragonflyHall.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}dragonfly-hall/DragonflyHall.worklet.js`);
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

  setDecay(v: number): void { this._decay = clamp(v, 0, 0.99); this.sendParam('decay', this._decay); }
  setDamping(v: number): void { this._damping = clamp(v, 0, 1); this.sendParam('damping', this._damping); }
  setPredelay(v: number): void { this._predelay = clamp(v, 0, 200); this.sendParam('predelay', this._predelay); }
  setWidth(v: number): void { this._width = clamp(v, 0, 1); this.sendParam('width', this._width); }
  setEarlyLevel(v: number): void { this._earlyLevel = clamp(v, 0, 1); this.sendParam('early_level', this._earlyLevel); }
  setSize(v: number): void { this._size = clamp(v, 0.5, 3); this.sendParam('size', this._size); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get decay(): number { return this._decay; }
  get damping(): number { return this._damping; }
  get predelay(): number { return this._predelay; }
  get width(): number { return this._width; }
  get earlyLevel(): number { return this._earlyLevel; }
  get size(): number { return this._size; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'decay': this.setDecay(value); break;
      case 'damping': this.setDamping(value); break;
      case 'predelay': this.setPredelay(value); break;
      case 'width': this.setWidth(value); break;
      case 'earlyLevel': this.setEarlyLevel(value); break;
      case 'size': this.setSize(value); break;
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
