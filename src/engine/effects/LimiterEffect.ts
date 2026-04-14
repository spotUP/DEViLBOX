// src/engine/effects/LimiterEffect.ts
/**
 * LimiterEffect — Look-ahead brick-wall limiter via WASM AudioWorklet.
 *
 * Parameters:
 *   threshold  -30..0 dB   Limiting threshold
 *   ceiling    -12..0 dB   Output ceiling
 *   attack     0.01..50ms  Attack time
 *   release    1..1000ms   Release time
 *   lookahead  0..100ms    Look-ahead delay
 *   knee       0..12 dB    Soft knee width
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface LimiterOptions {
  threshold?: number;
  ceiling?: number;
  attack?: number;
  release?: number;
  lookahead?: number;
  knee?: number;
  wet?: number;
}

export class LimiterEffect extends Tone.ToneAudioNode {
  readonly name = 'Limiter';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _threshold: number;
  private _ceiling: number;
  private _attack: number;
  private _release: number;
  private _lookahead: number;
  private _knee: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: LimiterOptions = {}) {
    super();
    this._threshold = options.threshold ?? -1;
    this._ceiling   = options.ceiling   ?? -0.3;
    this._attack    = options.attack    ?? 5;
    this._release   = options.release   ?? 50;
    this._lookahead = options.lookahead ?? 5;
    this._knee      = options.knee      ?? 0;
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
      await LimiterEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'limiter-processor', {
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
            console.warn('[Limiter] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: LimiterEffect.wasmBinary!, jsCode: LimiterEffect.jsCode! },
        [LimiterEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('threshold', this._threshold);
      this.sendParam('ceiling', this._ceiling);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('lookahead', this._lookahead);
      this.sendParam('knee', this._knee);
    } catch (err) {
      console.warn('[Limiter] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}limiter/Limiter.wasm`), fetch(`${base}limiter/Limiter.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}limiter/Limiter.worklet.js`);
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

  setThreshold(v: number): void { this._threshold = clamp(v, -30, 0); this.sendParam('threshold', this._threshold); }
  setCeiling(v: number): void { this._ceiling = clamp(v, -12, 0); this.sendParam('ceiling', this._ceiling); }
  setAttack(v: number): void { this._attack = clamp(v, 0.01, 50); this.sendParam('attack', this._attack); }
  setRelease(v: number): void { this._release = clamp(v, 1, 1000); this.sendParam('release', this._release); }
  setLookahead(v: number): void { this._lookahead = clamp(v, 0, 100); this.sendParam('lookahead', this._lookahead); }
  setKnee(v: number): void { this._knee = clamp(v, 0, 12); this.sendParam('knee', this._knee); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get threshold(): number { return this._threshold; }
  get ceiling(): number { return this._ceiling; }
  get attack(): number { return this._attack; }
  get release(): number { return this._release; }
  get lookahead(): number { return this._lookahead; }
  get knee(): number { return this._knee; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'threshold': this.setThreshold(value); break;
      case 'ceiling':   this.setCeiling(value);   break;
      case 'attack':    this.setAttack(value);    break;
      case 'release':   this.setRelease(value);   break;
      case 'lookahead': this.setLookahead(value); break;
      case 'knee':      this.setKnee(value);      break;
      case 'wet':       this.wet = value;         break;
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
