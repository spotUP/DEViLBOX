// src/engine/effects/OverdriveEffect.ts
/**
 * OverdriveEffect — Soft-clip tube overdrive via WASM AudioWorklet.
 *
 * Parameters:
 *   drive  0..1  Drive amount (waveshaper intensity)
 *   tone   0..1  Tone control (LP filter frequency)
 *   mix    0..1  Internal wet/dry mix
 *   level  0..1  Output level
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export interface OverdriveOptions {
  drive?: number;
  tone?: number;
  mix?: number;
  level?: number;
  wet?: number;
}

export class OverdriveEffect extends Tone.ToneAudioNode {
  readonly name = 'Overdrive';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _drive: number;
  private _tone: number;
  private _mix: number;
  private _level: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: OverdriveOptions = {}) {
    super();
    this._drive = options.drive ?? 0.5;
    this._tone  = options.tone  ?? 0.5;
    this._mix   = options.mix   ?? 1.0;
    this._level = options.level ?? 0.5;
    this._wet   = options.wet   ?? 1.0;

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
      console.log('[Overdrive] ⚡ _initWorklet starting');
      await OverdriveEffect.ensureInitialized(rawCtx);
      console.log('[Overdrive] ⚡ ensureInitialized done');

      this.workletNode = new AudioWorkletNode(rawCtx, 'overdrive-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          console.log('[Overdrive] ⚡ WASM ready! Swapping');
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
          }
          this.pendingParams = [];
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
            console.log('[Overdrive] ⚡ WASM swap complete!');
          } catch (swapErr) {
            console.error('[Overdrive] WASM swap failed:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: OverdriveEffect.wasmBinary!, jsCode: OverdriveEffect.jsCode! },
        [OverdriveEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('drive', this._drive);
      this.sendParam('tone', this._tone);
      this.sendParam('mix', this._mix);
      this.sendParam('level', this._level);
    } catch (err) {
      console.warn('[Overdrive] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}overdrive/Overdrive.wasm`), fetch(`${base}overdrive/Overdrive.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}overdrive/Overdrive.worklet.js`);
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

  setDrive(v: number): void { this._drive = clamp01(v); this.sendParam('drive', this._drive); }
  setTone(v: number): void { this._tone = clamp01(v); this.sendParam('tone', this._tone); }
  setMix(v: number): void { this._mix = clamp01(v); this.sendParam('mix', this._mix); }
  setLevel(v: number): void { this._level = clamp01(v); this.sendParam('level', this._level); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp01(value);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get drive(): number { return this._drive; }
  get tone(): number { return this._tone; }
  get mix(): number { return this._mix; }
  get level(): number { return this._level; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'drive': this.setDrive(value); break;
      case 'tone':  this.setTone(value);  break;
      case 'mix':   this.setMix(value);   break;
      case 'level': this.setLevel(value); break;
      case 'wet':   this.wet = value;     break;
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
