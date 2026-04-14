// src/engine/effects/MultibandEnhancerEffect.ts
/**
 * MultibandEnhancerEffect — 4-band stereo width enhancement + harmonics via WASM AudioWorklet.
 *
 * Parameters:
 *   lowCross   20..500 Hz     Low crossover frequency
 *   midCross   200..5000 Hz   Mid crossover frequency
 *   highCross  2000..16000 Hz High crossover frequency
 *   lowWidth   0..2           Low band stereo width
 *   midWidth   0..2           Mid band stereo width
 *   highWidth  0..2           High band stereo width
 *   topWidth   0..2           Top band stereo width
 *   harmonics  0..1           Saturation amount
 *   mix        0..1           Wet/dry mix (internal to WASM)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface MultibandEnhancerOptions {
  lowCross?: number;
  midCross?: number;
  highCross?: number;
  lowWidth?: number;
  midWidth?: number;
  highWidth?: number;
  topWidth?: number;
  harmonics?: number;
  mix?: number;
  wet?: number;
}

export class MultibandEnhancerEffect extends Tone.ToneAudioNode {
  readonly name = 'MultibandEnhancer';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowCross: number;
  private _midCross: number;
  private _highCross: number;
  private _lowWidth: number;
  private _midWidth: number;
  private _highWidth: number;
  private _topWidth: number;
  private _harmonics: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultibandEnhancerOptions = {}) {
    super();
    this._lowCross  = options.lowCross ?? 200;
    this._midCross  = options.midCross ?? 2000;
    this._highCross = options.highCross ?? 8000;
    this._lowWidth  = options.lowWidth ?? 1;
    this._midWidth  = options.midWidth ?? 1;
    this._highWidth = options.highWidth ?? 1;
    this._topWidth  = options.topWidth ?? 1;
    this._harmonics = options.harmonics ?? 0;
    this._mix       = options.mix ?? 1;
    this._wet       = options.wet ?? 1.0;

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
      await MultibandEnhancerEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multiband-enhancer-processor', {
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
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[MultibandEnhancer] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MultibandEnhancerEffect.wasmBinary!, jsCode: MultibandEnhancerEffect.jsCode! },
        [MultibandEnhancerEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowCross', this._lowCross);
      this.sendParam('midCross', this._midCross);
      this.sendParam('highCross', this._highCross);
      this.sendParam('lowWidth', this._lowWidth);
      this.sendParam('midWidth', this._midWidth);
      this.sendParam('highWidth', this._highWidth);
      this.sendParam('topWidth', this._topWidth);
      this.sendParam('harmonics', this._harmonics);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[MultibandEnhancer] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-enhancer/MultibandEnhancer.wasm`), fetch(`${base}multiband-enhancer/MultibandEnhancer.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-enhancer/MultibandEnhancer.worklet.js`);
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

  setLowCross(v: number): void { this._lowCross = clamp(v, 20, 500); this.sendParam('lowCross', this._lowCross); }
  setMidCross(v: number): void { this._midCross = clamp(v, 200, 5000); this.sendParam('midCross', this._midCross); }
  setHighCross(v: number): void { this._highCross = clamp(v, 2000, 16000); this.sendParam('highCross', this._highCross); }
  setLowWidth(v: number): void { this._lowWidth = clamp(v, 0, 2); this.sendParam('lowWidth', this._lowWidth); }
  setMidWidth(v: number): void { this._midWidth = clamp(v, 0, 2); this.sendParam('midWidth', this._midWidth); }
  setHighWidth(v: number): void { this._highWidth = clamp(v, 0, 2); this.sendParam('highWidth', this._highWidth); }
  setTopWidth(v: number): void { this._topWidth = clamp(v, 0, 2); this.sendParam('topWidth', this._topWidth); }
  setHarmonics(v: number): void { this._harmonics = clamp(v, 0, 1); this.sendParam('harmonics', this._harmonics); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get lowCross(): number { return this._lowCross; }
  get midCross(): number { return this._midCross; }
  get highCross(): number { return this._highCross; }
  get lowWidth(): number { return this._lowWidth; }
  get midWidth(): number { return this._midWidth; }
  get highWidth(): number { return this._highWidth; }
  get topWidth(): number { return this._topWidth; }
  get harmonics(): number { return this._harmonics; }
  get mix(): number { return this._mix; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'lowCross':  this.setLowCross(value);  break;
      case 'midCross':  this.setMidCross(value);  break;
      case 'highCross': this.setHighCross(value); break;
      case 'lowWidth':  this.setLowWidth(value);  break;
      case 'midWidth':  this.setMidWidth(value);  break;
      case 'highWidth': this.setHighWidth(value); break;
      case 'topWidth':  this.setTopWidth(value);  break;
      case 'harmonics': this.setHarmonics(value); break;
      case 'mix':       this.setMix(value);       break;
      case 'wet':       this.wet = value;         break;
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
