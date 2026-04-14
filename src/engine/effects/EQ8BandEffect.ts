// src/engine/effects/EQ8BandEffect.ts
/**
 * EQ8BandEffect — 8-band parametric EQ via WASM AudioWorklet.
 *
 * HP + LP (Butterworth) + 2 shelving + 4 peaking biquad filters.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

export interface EQ8BandOptions {
  hpFreq?: number; lpFreq?: number;
  lowShelfFreq?: number; lowShelfGain?: number;
  peak1Freq?: number; peak1Gain?: number; peak1Q?: number;
  peak2Freq?: number; peak2Gain?: number; peak2Q?: number;
  peak3Freq?: number; peak3Gain?: number; peak3Q?: number;
  peak4Freq?: number; peak4Gain?: number; peak4Q?: number;
  highShelfFreq?: number; highShelfGain?: number;
  mix?: number; wet?: number;
}

export class EQ8BandEffect extends Tone.ToneAudioNode {
  readonly name = 'EQ8Band';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];
  private params: Record<string, number>;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: EQ8BandOptions = {}) {
    super();
    this.params = {
      hpFreq: options.hpFreq ?? 20,
      lpFreq: options.lpFreq ?? 20000,
      lowShelfFreq: options.lowShelfFreq ?? 100,
      lowShelfGain: options.lowShelfGain ?? 0,
      peak1Freq: options.peak1Freq ?? 250,
      peak1Gain: options.peak1Gain ?? 0,
      peak1Q: options.peak1Q ?? 1,
      peak2Freq: options.peak2Freq ?? 1000,
      peak2Gain: options.peak2Gain ?? 0,
      peak2Q: options.peak2Q ?? 1,
      peak3Freq: options.peak3Freq ?? 3500,
      peak3Gain: options.peak3Gain ?? 0,
      peak3Q: options.peak3Q ?? 1,
      peak4Freq: options.peak4Freq ?? 8000,
      peak4Gain: options.peak4Gain ?? 0,
      peak4Q: options.peak4Q ?? 1,
      highShelfFreq: options.highShelfFreq ?? 8000,
      highShelfGain: options.highShelfGain ?? 0,
      mix: options.mix ?? 1,
    };
    this._wet = options.wet ?? 1;

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
      await EQ8BandEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'eq8-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
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
            console.warn('[EQ8Band] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: EQ8BandEffect.wasmBinary!, jsCode: EQ8BandEffect.jsCode! },
        [EQ8BandEffect.wasmBinary!.slice(0)],
      );

      for (const [k, v] of Object.entries(this.params)) this.sendParam(k, v);
    } catch (err) {
      console.warn('[EQ8Band] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}eq8/EQ8Band.wasm`), fetch(`${base}eq8/EQ8Band.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}eq8/EQ8Band.worklet.js`);
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

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  get hpFreq(): number { return this.params.hpFreq; }
  get lpFreq(): number { return this.params.lpFreq; }
  get lowShelfFreq(): number { return this.params.lowShelfFreq; }
  get lowShelfGain(): number { return this.params.lowShelfGain; }
  get highShelfFreq(): number { return this.params.highShelfFreq; }
  get highShelfGain(): number { return this.params.highShelfGain; }
  get mix(): number { return this.params.mix; }

  setParam(param: string, value: number): void {
    if (param === 'wet') { this.wet = value; return; }
    if (param in this.params) {
      this.params[param] = value;
      this.sendParam(param, value);
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
