// src/engine/effects/RingModEffect.ts
/**
 * RingModEffect — Ring Modulator via WASM AudioWorklet.
 *
 * Parameters:
 *   frequency  1..5000 Hz  Carrier frequency
 *   mix        0..1        Wet/dry mix (internal)
 *   waveform   0..3        Carrier waveform (sine/square/triangle/saw)
 *   lfoRate    0..20 Hz    FM LFO rate
 *   lfoDepth   0..1        FM LFO depth
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface RingModOptions {
  frequency?: number;
  mix?: number;
  waveform?: number;
  lfoRate?: number;
  lfoDepth?: number;
  wet?: number;
}

export class RingModEffect extends Tone.ToneAudioNode {
  readonly name = 'RingMod';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _frequency: number;
  private _mix: number;
  private _waveform: number;
  private _lfoRate: number;
  private _lfoDepth: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: RingModOptions = {}) {
    super();
    this._frequency = options.frequency ?? 440;
    this._mix       = options.mix       ?? 0.5;
    this._waveform  = options.waveform  ?? 0;
    this._lfoRate   = options.lfoRate   ?? 0;
    this._lfoDepth  = options.lfoDepth  ?? 0;
    this._wet       = options.wet       ?? 1.0;

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
      await RingModEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'ring-mod-processor', {
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
            console.warn('[RingMod] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: RingModEffect.wasmBinary!, jsCode: RingModEffect.jsCode! },
        [RingModEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('frequency', this._frequency);
      this.sendParam('mix', this._mix);
      this.sendParam('waveform', this._waveform);
      this.sendParam('lfoRate', this._lfoRate);
      this.sendParam('lfoDepth', this._lfoDepth);
    } catch (err) {
      console.warn('[RingMod] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}ring-mod/RingMod.wasm`), fetch(`${base}ring-mod/RingMod.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}ring-mod/RingMod.worklet.js`);
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

  setFrequency(v: number): void { this._frequency = clamp(v, 1, 5000); this.sendParam('frequency', this._frequency); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }
  setWaveform(v: number): void { this._waveform = clamp(v, 0, 3); this.sendParam('waveform', this._waveform); }
  setLfoRate(v: number): void { this._lfoRate = clamp(v, 0, 20); this.sendParam('lfoRate', this._lfoRate); }
  setLfoDepth(v: number): void { this._lfoDepth = clamp(v, 0, 1); this.sendParam('lfoDepth', this._lfoDepth); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get frequency(): number { return this._frequency; }
  get mix(): number { return this._mix; }
  get waveform(): number { return this._waveform; }
  get lfoRate(): number { return this._lfoRate; }
  get lfoDepth(): number { return this._lfoDepth; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'frequency': this.setFrequency(value); break;
      case 'mix':       this.setMix(value);       break;
      case 'waveform':  this.setWaveform(value);  break;
      case 'lfoRate':   this.setLfoRate(value);   break;
      case 'lfoDepth':  this.setLfoDepth(value);  break;
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
