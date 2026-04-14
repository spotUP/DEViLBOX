// src/engine/effects/DynamicEQEffect.ts
/**
 * DynamicEQEffect — Dynamic EQ via WASM AudioWorklet.
 *
 * Frequency-dependent dynamic processing: detect energy in one band,
 * apply gain boost/cut in another band when above threshold.
 *
 * Parameters:
 *   detectFreq   20..20000 Hz — frequency to detect
 *   detectQ      0.1..10 — detector bandwidth
 *   processFreq  20..20000 Hz — band to boost/cut
 *   processQ     0.1..10 — process bandwidth
 *   threshold    -60..0 dB
 *   maxGain      -24..24 dB
 *   attack       0.1..100 ms
 *   release      10..1000 ms
 *   mix          0..1
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

export interface DynamicEQOptions {
  detectFreq?: number; detectQ?: number;
  processFreq?: number; processQ?: number;
  threshold?: number; maxGain?: number;
  attack?: number; release?: number;
  mix?: number; wet?: number;
}

export class DynamicEQEffect extends Tone.ToneAudioNode {
  readonly name = 'DynamicEQ';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _detectFreq: number; private _detectQ: number;
  private _processFreq: number; private _processQ: number;
  private _threshold: number; private _maxGain: number;
  private _attack: number; private _release: number;
  private _mix: number; private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: DynamicEQOptions = {}) {
    super();
    this._detectFreq = options.detectFreq ?? 1000;
    this._detectQ = options.detectQ ?? 1;
    this._processFreq = options.processFreq ?? 1000;
    this._processQ = options.processQ ?? 1;
    this._threshold = options.threshold ?? -20;
    this._maxGain = options.maxGain ?? 0;
    this._attack = options.attack ?? 10;
    this._release = options.release ?? 100;
    this._mix = options.mix ?? 1;
    this._wet = options.wet ?? 1;

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
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
      await DynamicEQEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'dynamic-eq-processor', {
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
            this.passthroughGain.gain.value = 0;
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[DynamicEQ] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: DynamicEQEffect.wasmBinary!, jsCode: DynamicEQEffect.jsCode! },
        [DynamicEQEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('detectFreq', this._detectFreq);
      this.sendParam('detectQ', this._detectQ);
      this.sendParam('processFreq', this._processFreq);
      this.sendParam('processQ', this._processQ);
      this.sendParam('threshold', this._threshold);
      this.sendParam('maxGain', this._maxGain);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[DynamicEQ] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}dynamic-eq/DynamicEQ.wasm`), fetch(`${base}dynamic-eq/DynamicEQ.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}dynamic-eq/DynamicEQ.worklet.js`);
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

  setDetectFreq(v: number): void { this._detectFreq = clamp(v, 20, 20000); this.sendParam('detectFreq', this._detectFreq); }
  setDetectQ(v: number): void { this._detectQ = clamp(v, 0.1, 10); this.sendParam('detectQ', this._detectQ); }
  setProcessFreq(v: number): void { this._processFreq = clamp(v, 20, 20000); this.sendParam('processFreq', this._processFreq); }
  setProcessQ(v: number): void { this._processQ = clamp(v, 0.1, 10); this.sendParam('processQ', this._processQ); }
  setThreshold(v: number): void { this._threshold = clamp(v, -60, 0); this.sendParam('threshold', this._threshold); }
  setMaxGain(v: number): void { this._maxGain = clamp(v, -24, 24); this.sendParam('maxGain', this._maxGain); }
  setAttack(v: number): void { this._attack = clamp(v, 0.1, 100); this.sendParam('attack', this._attack); }
  setRelease(v: number): void { this._release = clamp(v, 10, 1000); this.sendParam('release', this._release); }
  setMix(v: number): void { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get detectFreq(): number { return this._detectFreq; }
  get detectQ(): number { return this._detectQ; }
  get processFreq(): number { return this._processFreq; }
  get processQ(): number { return this._processQ; }
  get threshold(): number { return this._threshold; }
  get maxGain(): number { return this._maxGain; }
  get attack(): number { return this._attack; }
  get release(): number { return this._release; }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'detectFreq': this.setDetectFreq(value); break;
      case 'detectQ': this.setDetectQ(value); break;
      case 'processFreq': this.setProcessFreq(value); break;
      case 'processQ': this.setProcessQ(value); break;
      case 'threshold': this.setThreshold(value); break;
      case 'maxGain': this.setMaxGain(value); break;
      case 'attack': this.setAttack(value); break;
      case 'release': this.setRelease(value); break;
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
    this.passthroughGain.dispose(); this.dryGain.dispose(); this.wetGain.dispose();
    this.input.dispose(); this.output.dispose();
    super.dispose();
    return this;
  }
}
