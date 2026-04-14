// src/engine/effects/ZamEQ2Effect.ts
/**
 * ZamEQ2Effect — 2-band parametric EQ with shelving via WASM AudioWorklet.
 *
 * Low shelf + high shelf biquads with bandwidth control.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

export interface ZamEQ2Options {
  lowFreq?: number; lowGain?: number; lowBw?: number;
  highFreq?: number; highGain?: number; highBw?: number;
  mix?: number; wet?: number;
}

export class ZamEQ2Effect extends Tone.ToneAudioNode {
  readonly name = 'ZamEQ2';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowFreq: number; private _lowGain: number; private _lowBw: number;
  private _highFreq: number; private _highGain: number; private _highBw: number;
  private _mix: number; private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: ZamEQ2Options = {}) {
    super();
    this._lowFreq = options.lowFreq ?? 200;
    this._lowGain = options.lowGain ?? 0;
    this._lowBw = options.lowBw ?? 1;
    this._highFreq = options.highFreq ?? 4000;
    this._highGain = options.highGain ?? 0;
    this._highBw = options.highBw ?? 1;
    this._mix = options.mix ?? 1;
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
      await ZamEQ2Effect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'zam-eq2-processor', {
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
            console.warn('[ZamEQ2] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: ZamEQ2Effect.wasmBinary!, jsCode: ZamEQ2Effect.jsCode! },
        [ZamEQ2Effect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowFreq', this._lowFreq);
      this.sendParam('lowGain', this._lowGain);
      this.sendParam('lowBw', this._lowBw);
      this.sendParam('highFreq', this._highFreq);
      this.sendParam('highGain', this._highGain);
      this.sendParam('highBw', this._highBw);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[ZamEQ2] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}zam-eq2/ZamEQ2.wasm`), fetch(`${base}zam-eq2/ZamEQ2.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}zam-eq2/ZamEQ2.worklet.js`);
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

  setLowFreq(v: number): void { this._lowFreq = clamp(v, 20, 1000); this.sendParam('lowFreq', this._lowFreq); }
  setLowGain(v: number): void { this._lowGain = clamp(v, -36, 36); this.sendParam('lowGain', this._lowGain); }
  setLowBw(v: number): void { this._lowBw = clamp(v, 0.1, 6); this.sendParam('lowBw', this._lowBw); }
  setHighFreq(v: number): void { this._highFreq = clamp(v, 1000, 20000); this.sendParam('highFreq', this._highFreq); }
  setHighGain(v: number): void { this._highGain = clamp(v, -36, 36); this.sendParam('highGain', this._highGain); }
  setHighBw(v: number): void { this._highBw = clamp(v, 0.1, 6); this.sendParam('highBw', this._highBw); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get lowFreq(): number { return this._lowFreq; }
  get lowGain(): number { return this._lowGain; }
  get lowBw(): number { return this._lowBw; }
  get highFreq(): number { return this._highFreq; }
  get highGain(): number { return this._highGain; }
  get highBw(): number { return this._highBw; }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'lowFreq': this.setLowFreq(value); break;
      case 'lowGain': this.setLowGain(value); break;
      case 'lowBw': this.setLowBw(value); break;
      case 'highFreq': this.setHighFreq(value); break;
      case 'highGain': this.setHighGain(value); break;
      case 'highBw': this.setHighBw(value); break;
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
    this.input.dispose(); this.output.dispose();
    super.dispose();
    return this;
  }
}
