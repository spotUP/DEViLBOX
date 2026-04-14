/**
 * MultibandLimiterEffect — 3-band crossover + per-band brick-wall limiter via WASM AudioWorklet.
 *
 * Parameters:
 *   lowCross   20..1000 Hz     Low/mid crossover frequency
 *   highCross  500..16000 Hz   Mid/high crossover frequency
 *   lowCeil    -24..0 dB       Low band ceiling
 *   midCeil    -24..0 dB       Mid band ceiling
 *   highCeil   -24..0 dB       High band ceiling
 *   lowGain    0..4 linear     Low band gain
 *   midGain    0..4 linear     Mid band gain
 *   highGain   0..4 linear     High band gain
 *   release    10..500 ms      Release time
 *   mix        0..1            Dry/wet mix
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface MultibandLimiterOptions {
  lowCross?: number;
  highCross?: number;
  lowCeil?: number;
  midCeil?: number;
  highCeil?: number;
  lowGain?: number;
  midGain?: number;
  highGain?: number;
  release?: number;
  wet?: number;
}

export class MultibandLimiterEffect extends Tone.ToneAudioNode {
  readonly name = 'MultibandLimiter';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowCross: number;
  private _highCross: number;
  private _lowCeil: number;
  private _midCeil: number;
  private _highCeil: number;
  private _lowGain: number;
  private _midGain: number;
  private _highGain: number;
  private _release: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultibandLimiterOptions = {}) {
    super();
    this._lowCross  = options.lowCross  ?? 200;
    this._highCross = options.highCross ?? 3000;
    this._lowCeil   = options.lowCeil   ?? -1;
    this._midCeil   = options.midCeil   ?? -1;
    this._highCeil  = options.highCeil  ?? -1;
    this._lowGain   = options.lowGain   ?? 1;
    this._midGain   = options.midGain   ?? 1;
    this._highGain  = options.highGain  ?? 1;
    this._release   = options.release   ?? 50;
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
      await MultibandLimiterEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multiband-limiter-processor', {
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
            console.warn('[MultibandLimiter] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MultibandLimiterEffect.wasmBinary!, jsCode: MultibandLimiterEffect.jsCode! },
        [MultibandLimiterEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowCross', this._lowCross);
      this.sendParam('highCross', this._highCross);
      this.sendParam('lowCeil', this._lowCeil);
      this.sendParam('midCeil', this._midCeil);
      this.sendParam('highCeil', this._highCeil);
      this.sendParam('lowGain', this._lowGain);
      this.sendParam('midGain', this._midGain);
      this.sendParam('highGain', this._highGain);
      this.sendParam('release', this._release);
    } catch (err) {
      console.warn('[MultibandLimiter] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-limiter/MultibandLimiter.wasm`), fetch(`${base}multiband-limiter/MultibandLimiter.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-limiter/MultibandLimiter.worklet.js`);
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

  get lowCross(): number { return this._lowCross; }
  set lowCross(v: number) { this._lowCross = clamp(v, 20, 1000); this.sendParam('lowCross', this._lowCross); }
  get highCross(): number { return this._highCross; }
  set highCross(v: number) { this._highCross = clamp(v, 500, 16000); this.sendParam('highCross', this._highCross); }
  get lowCeil(): number { return this._lowCeil; }
  set lowCeil(v: number) { this._lowCeil = clamp(v, -24, 0); this.sendParam('lowCeil', this._lowCeil); }
  get midCeil(): number { return this._midCeil; }
  set midCeil(v: number) { this._midCeil = clamp(v, -24, 0); this.sendParam('midCeil', this._midCeil); }
  get highCeil(): number { return this._highCeil; }
  set highCeil(v: number) { this._highCeil = clamp(v, -24, 0); this.sendParam('highCeil', this._highCeil); }
  get lowGain(): number { return this._lowGain; }
  set lowGain(v: number) { this._lowGain = clamp(v, 0, 4); this.sendParam('lowGain', this._lowGain); }
  get midGain(): number { return this._midGain; }
  set midGain(v: number) { this._midGain = clamp(v, 0, 4); this.sendParam('midGain', this._midGain); }
  get highGain(): number { return this._highGain; }
  set highGain(v: number) { this._highGain = clamp(v, 0, 4); this.sendParam('highGain', this._highGain); }
  get release(): number { return this._release; }
  set release(v: number) { this._release = clamp(v, 10, 500); this.sendParam('release', this._release); }
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'lowCross':  this.lowCross = value;  break;
      case 'highCross': this.highCross = value; break;
      case 'lowCeil':   this.lowCeil = value;   break;
      case 'midCeil':   this.midCeil = value;   break;
      case 'highCeil':  this.highCeil = value;  break;
      case 'lowGain':   this.lowGain = value;   break;
      case 'midGain':   this.midGain = value;   break;
      case 'highGain':  this.highGain = value;  break;
      case 'release':   this.release = value;   break;
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
