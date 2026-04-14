// src/engine/effects/VinylEffect.ts
/**
 * VinylEffect — Vinyl record simulation via WASM AudioWorklet.
 *
 * Parameters:
 *   crackle  0..1   Random high-amplitude pops
 *   noise    0..1   Continuous background hiss
 *   rumble   0..1   Low-frequency motor noise
 *   wear     0..1   LP filter cutoff (more wear = darker)
 *   speed    0..1   Motor speed (0.5=33rpm normal)
 *   mix      0..1   Wet/dry mix (internal to WASM)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface VinylOptions {
  crackle?: number;
  noise?: number;
  rumble?: number;
  wear?: number;
  speed?: number;
  mix?: number;
  wet?: number;
}

export class VinylEffect extends Tone.ToneAudioNode {
  readonly name = 'Vinyl';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _crackle: number;
  private _noise: number;
  private _rumble: number;
  private _wear: number;
  private _speed: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: VinylOptions = {}) {
    super();
    this._crackle = options.crackle ?? 0.3;
    this._noise   = options.noise ?? 0.2;
    this._rumble  = options.rumble ?? 0.1;
    this._wear    = options.wear ?? 0.3;
    this._speed   = options.speed ?? 0.5;
    this._mix     = options.mix ?? 1;
    this._wet     = options.wet ?? 1.0;

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
      await VinylEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'vinyl-processor', {
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
            console.warn('[Vinyl] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: VinylEffect.wasmBinary!, jsCode: VinylEffect.jsCode! },
        [VinylEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('crackle', this._crackle);
      this.sendParam('noise', this._noise);
      this.sendParam('rumble', this._rumble);
      this.sendParam('wear', this._wear);
      this.sendParam('speed', this._speed);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[Vinyl] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}vinyl/Vinyl.wasm`), fetch(`${base}vinyl/Vinyl.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}vinyl/Vinyl.worklet.js`);
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

  setCrackle(v: number): void { this._crackle = clamp(v, 0, 1); this.sendParam('crackle', this._crackle); }
  setNoise(v: number): void { this._noise = clamp(v, 0, 1); this.sendParam('noise', this._noise); }
  setRumble(v: number): void { this._rumble = clamp(v, 0, 1); this.sendParam('rumble', this._rumble); }
  setWear(v: number): void { this._wear = clamp(v, 0, 1); this.sendParam('wear', this._wear); }
  setSpeed(v: number): void { this._speed = clamp(v, 0, 1); this.sendParam('speed', this._speed); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get crackle(): number { return this._crackle; }
  get noise(): number { return this._noise; }
  get rumble(): number { return this._rumble; }
  get wear(): number { return this._wear; }
  get speed(): number { return this._speed; }
  get mix(): number { return this._mix; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'crackle': this.setCrackle(value); break;
      case 'noise':   this.setNoise(value);   break;
      case 'rumble':  this.setRumble(value);  break;
      case 'wear':    this.setWear(value);    break;
      case 'speed':   this.setSpeed(value);   break;
      case 'mix':     this.setMix(value);     break;
      case 'wet':     this.wet = value;       break;
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
