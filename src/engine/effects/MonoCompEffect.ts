/**
 * MonoCompEffect — Single-band compressor with peak detection and soft knee via WASM AudioWorklet.
 *
 * Parameters:
 *   threshold  -60..0 dB    Compression threshold
 *   ratio      1..20        Compression ratio
 *   attack     0.1..100 ms  Attack time
 *   release    10..1000 ms  Release time
 *   knee       0..24 dB     Soft knee width
 *   makeup     0..24 dB     Makeup gain
 *   mix        0..1         Dry/wet mix
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface MonoCompOptions {
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  knee?: number;
  makeup?: number;
  wet?: number;
}

export class MonoCompEffect extends Tone.ToneAudioNode {
  readonly name = 'MonoComp';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _threshold: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _knee: number;
  private _makeup: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MonoCompOptions = {}) {
    super();
    this._threshold = options.threshold ?? -12;
    this._ratio     = options.ratio     ?? 4;
    this._attack    = options.attack    ?? 10;
    this._release   = options.release   ?? 100;
    this._knee      = options.knee      ?? 6;
    this._makeup    = options.makeup    ?? 0;
    this._wet       = options.wet       ?? 1.0;

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
      await MonoCompEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'mono-comp-processor', {
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
            console.warn('[MonoComp] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MonoCompEffect.wasmBinary!, jsCode: MonoCompEffect.jsCode! },
        [MonoCompEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('threshold', this._threshold);
      this.sendParam('ratio', this._ratio);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('knee', this._knee);
      this.sendParam('makeup', this._makeup);
    } catch (err) {
      console.warn('[MonoComp] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}mono-comp/MonoComp.wasm`), fetch(`${base}mono-comp/MonoComp.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}mono-comp/MonoComp.worklet.js`);
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

  get threshold(): number { return this._threshold; }
  set threshold(v: number) { this._threshold = clamp(v, -60, 0); this.sendParam('threshold', this._threshold); }
  get ratio(): number { return this._ratio; }
  set ratio(v: number) { this._ratio = clamp(v, 1, 20); this.sendParam('ratio', this._ratio); }
  get attack(): number { return this._attack; }
  set attack(v: number) { this._attack = clamp(v, 0.1, 100); this.sendParam('attack', this._attack); }
  get release(): number { return this._release; }
  set release(v: number) { this._release = clamp(v, 10, 1000); this.sendParam('release', this._release); }
  get knee(): number { return this._knee; }
  set knee(v: number) { this._knee = clamp(v, 0, 24); this.sendParam('knee', this._knee); }
  get makeup(): number { return this._makeup; }
  set makeup(v: number) { this._makeup = clamp(v, 0, 24); this.sendParam('makeup', this._makeup); }
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'threshold': this.threshold = value; break;
      case 'ratio':     this.ratio = value;     break;
      case 'attack':    this.attack = value;    break;
      case 'release':   this.release = value;   break;
      case 'knee':      this.knee = value;      break;
      case 'makeup':    this.makeup = value;    break;
      case 'wet':       this.wet = value;       break;
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
