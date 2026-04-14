// src/engine/effects/FlangerEffect.ts
/**
 * FlangerEffect — BBD-style through-zero flanger via WASM AudioWorklet.
 *
 * Parameters:
 *   rate       0.01..20 Hz  LFO rate
 *   depth      0..1         LFO depth
 *   delay      0.1..20 ms   Center delay
 *   feedback   -0.99..0.99  Feedback amount
 *   stereo     0..360 deg   Stereo phase offset
 *   mix        0..1         Wet/dry mix (internal to WASM)
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface FlangerOptions {
  rate?: number;
  depth?: number;
  delay?: number;
  feedback?: number;
  stereo?: number;
  mix?: number;
  wet?: number;
}

export class FlangerEffect extends Tone.ToneAudioNode {
  readonly name = 'Flanger';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _rate: number;
  private _depth: number;
  private _delay: number;
  private _feedback: number;
  private _stereo: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: FlangerOptions = {}) {
    super();
    this._rate     = options.rate     ?? 0.3;
    this._depth    = options.depth    ?? 0.7;
    this._delay    = options.delay    ?? 5;
    this._feedback = options.feedback ?? 0.3;
    this._stereo   = options.stereo   ?? 90;
    this._mix      = options.mix      ?? 0.5;
    this._wet      = options.wet      ?? 1.0;

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
      await FlangerEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'flanger-processor', {
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
            console.warn('[Flanger] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: FlangerEffect.wasmBinary!, jsCode: FlangerEffect.jsCode! },
        [FlangerEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('rate', this._rate);
      this.sendParam('depth', this._depth);
      this.sendParam('delay', this._delay);
      this.sendParam('feedback', this._feedback);
      this.sendParam('stereo', this._stereo);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[Flanger] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}flanger/Flanger.wasm`), fetch(`${base}flanger/Flanger.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}flanger/Flanger.worklet.js`);
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

  setRate(v: number): void { this._rate = clamp(v, 0.01, 20); this.sendParam('rate', this._rate); }
  setDepth(v: number): void { this._depth = clamp(v, 0, 1); this.sendParam('depth', this._depth); }
  setDelay(v: number): void { this._delay = clamp(v, 0.1, 20); this.sendParam('delay', this._delay); }
  setFeedback(v: number): void { this._feedback = clamp(v, -0.99, 0.99); this.sendParam('feedback', this._feedback); }
  setStereo(v: number): void { this._stereo = clamp(v, 0, 360); this.sendParam('stereo', this._stereo); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get rate(): number { return this._rate; }
  get depth(): number { return this._depth; }
  get delay(): number { return this._delay; }
  get feedback(): number { return this._feedback; }
  get stereo(): number { return this._stereo; }
  get mix(): number { return this._mix; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'rate':     this.setRate(value);     break;
      case 'depth':    this.setDepth(value);    break;
      case 'delay':    this.setDelay(value);    break;
      case 'feedback': this.setFeedback(value); break;
      case 'stereo':   this.setStereo(value);   break;
      case 'mix':      this.setMix(value);      break;
      case 'wet':      this.wet = value;        break;
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
