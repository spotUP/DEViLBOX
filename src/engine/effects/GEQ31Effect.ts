// src/engine/effects/GEQ31Effect.ts
/**
 * GEQ31Effect — 31-band graphic EQ via WASM AudioWorklet.
 *
 * 31 peaking biquad filters at ISO 1/3-octave center frequencies (20Hz–20kHz).
 * Fixed Q of 4.318 for 1/3-octave bandwidth.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

export const GEQ31_ISO_FREQS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
] as const;

export interface GEQ31Options {
  mix?: number; wet?: number;
}

export class GEQ31Effect extends Tone.ToneAudioNode {
  readonly name = 'GEQ31';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];
  private _mix: number;
  private _wet: number;

  private bandGains: number[] = new Array(31).fill(0);

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: GEQ31Options = {}) {
    super();
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
      await GEQ31Effect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'geq31-processor', {
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
            console.warn('[GEQ31] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: GEQ31Effect.wasmBinary!, jsCode: GEQ31Effect.jsCode! },
        [GEQ31Effect.wasmBinary!.slice(0)],
      );

      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[GEQ31] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}geq31/GEQ31.wasm`), fetch(`${base}geq31/GEQ31.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}geq31/GEQ31.worklet.js`);
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

  setBandGain(band: number, gain: number): void {
    if (band < 0 || band > 30) return;
    this.bandGains[band] = clamp(gain, -12, 12);
    this.sendParam(`band_${band}`, this.bandGains[band]);
  }

  getBandGain(band: number): number { return this.bandGains[band] ?? 0; }
  getBandFreq(band: number): number { return GEQ31_ISO_FREQS[band] ?? 0; }

  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  setParam(param: string, value: number): void {
    if (param === 'wet') { this.wet = value; return; }
    if (param === 'mix') { this.setMix(value); return; }
    if (param.startsWith('band_')) {
      const idx = parseInt(param.substring(5));
      if (!isNaN(idx)) this.setBandGain(idx, value);
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
