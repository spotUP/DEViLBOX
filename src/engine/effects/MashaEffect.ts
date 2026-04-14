// src/engine/effects/MashaEffect.ts
/**
 * MashaEffect — Beat grinder / stutter effect via WASM AudioWorklet.
 *
 * Parameters:
 *   time         10..500 ms   Chunk length
 *   volume       0..1         Loop volume
 *   passthrough  0..1         Blend original signal
 *   active       0 or 1       Toggle stutter on/off
 *   mix          0..1         Wet/dry mix (internal to WASM)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface MashaOptions {
  time?: number;
  volume?: number;
  passthrough?: number;
  active?: number;
  mix?: number;
  wet?: number;
}

export class MashaEffect extends Tone.ToneAudioNode {
  readonly name = 'Masha';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _time: number;
  private _volume: number;
  private _passthrough: number;
  private _active: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MashaOptions = {}) {
    super();
    this._time        = options.time ?? 100;
    this._volume      = options.volume ?? 1;
    this._passthrough = options.passthrough ?? 0;
    this._active      = options.active ?? 0;
    this._mix         = options.mix ?? 1;
    this._wet         = options.wet ?? 1.0;

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
      await MashaEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'masha-processor', {
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
            console.warn('[Masha] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MashaEffect.wasmBinary!, jsCode: MashaEffect.jsCode! },
        [MashaEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('time', this._time);
      this.sendParam('volume', this._volume);
      this.sendParam('passthrough', this._passthrough);
      this.sendParam('active', this._active);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[Masha] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}masha/Masha.wasm`), fetch(`${base}masha/Masha.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}masha/Masha.worklet.js`);
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

  setTime(v: number): void { this._time = clamp(v, 10, 500); this.sendParam('time', this._time); }
  setVolume(v: number): void { this._volume = clamp(v, 0, 1); this.sendParam('volume', this._volume); }
  setPassthrough(v: number): void { this._passthrough = clamp(v, 0, 1); this.sendParam('passthrough', this._passthrough); }
  setActive(v: number): void { this._active = v >= 0.5 ? 1 : 0; this.sendParam('active', this._active); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get time(): number { return this._time; }
  get mashaVolume(): number { return this._volume; }
  get passthrough(): number { return this._passthrough; }
  get mashaActive(): number { return this._active; }
  get mix(): number { return this._mix; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'time':        this.setTime(value);        break;
      case 'volume':      this.setVolume(value);      break;
      case 'passthrough': this.setPassthrough(value); break;
      case 'active':      this.setActive(value);      break;
      case 'mix':         this.setMix(value);         break;
      case 'wet':         this.wet = value;           break;
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
