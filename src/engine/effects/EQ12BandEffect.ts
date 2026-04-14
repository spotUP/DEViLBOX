// src/engine/effects/EQ12BandEffect.ts
/**
 * EQ12BandEffect — 12-band parametric EQ via WASM AudioWorklet.
 *
 * Fixed structure: HP + lowShelf + 8×peaking + highShelf + LP
 * Bands indexed 0..11. Per-band freq/gain/Q control.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

export interface EQ12BandOptions {
  mix?: number; wet?: number;
}

export class EQ12BandEffect extends Tone.ToneAudioNode {
  readonly name = 'EQ12Band';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];
  private _mix: number;
  private _wet: number;

  private bandFreqs: number[] = [30, 80, 160, 400, 800, 1500, 3000, 5000, 8000, 12000, 14000, 18000];
  private bandGains: number[] = new Array(12).fill(0);
  private bandQs: number[] = new Array(12).fill(1);

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: EQ12BandOptions = {}) {
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
      await EQ12BandEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'eq12-processor', {
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
            console.warn('[EQ12Band] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: EQ12BandEffect.wasmBinary!, jsCode: EQ12BandEffect.jsCode! },
        [EQ12BandEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[EQ12Band] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}eq12/EQ12Band.wasm`), fetch(`${base}eq12/EQ12Band.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}eq12/EQ12Band.worklet.js`);
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

  setBandFreq(band: number, freq: number): void {
    if (band < 0 || band > 11) return;
    this.bandFreqs[band] = clamp(freq, 20, 20000);
    this.sendParam(`freq_${band}`, this.bandFreqs[band]);
  }

  setBandGain(band: number, gain: number): void {
    if (band < 0 || band > 11) return;
    this.bandGains[band] = clamp(gain, -36, 36);
    this.sendParam(`gain_${band}`, this.bandGains[band]);
  }

  setBandQ(band: number, q: number): void {
    if (band < 0 || band > 11) return;
    this.bandQs[band] = clamp(q, 0.1, 10);
    this.sendParam(`q_${band}`, this.bandQs[band]);
  }

  getBandFreq(band: number): number { return this.bandFreqs[band] ?? 0; }
  getBandGain(band: number): number { return this.bandGains[band] ?? 0; }
  getBandQ(band: number): number { return this.bandQs[band] ?? 1; }

  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  setParam(param: string, value: number): void {
    if (param === 'wet') { this.wet = value; return; }
    if (param === 'mix') { this.setMix(value); return; }
    // Parse 'freq_3', 'gain_7', 'q_11'
    const idx = param.lastIndexOf('_');
    if (idx >= 0) {
      const name = param.substring(0, idx);
      const band = parseInt(param.substring(idx + 1));
      if (!isNaN(band)) {
        if (name === 'freq') this.setBandFreq(band, value);
        else if (name === 'gain') this.setBandGain(band, value);
        else if (name === 'q') this.setBandQ(band, value);
      }
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
