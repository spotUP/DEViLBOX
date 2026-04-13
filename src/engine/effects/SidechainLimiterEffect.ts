/**
 * SidechainLimiterEffect — Limiter with sidechain frequency weighting via WASM AudioWorklet.
 *
 * Parameters:
 *   ceiling   -24..0 dB      Output ceiling
 *   release   10..500 ms     Release time
 *   scFreq    20..20000 Hz   Sidechain bell filter center frequency
 *   scGain    -12..12 dB     Sidechain bell filter gain (boost/cut)
 *   mix       0..1           Dry/wet mix
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface SidechainLimiterOptions {
  ceiling?: number;
  release?: number;
  scFreq?: number;
  scGain?: number;
  wet?: number;
}

export class SidechainLimiterEffect extends Tone.ToneAudioNode {
  readonly name = 'SidechainLimiter';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private sidechainInput: Tone.Gain;
  private selfRouteGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _ceiling: number;
  private _release: number;
  private _scFreq: number;
  private _scGain: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: SidechainLimiterOptions = {}) {
    super();
    this._ceiling = options.ceiling ?? -1;
    this._release = options.release ?? 50;
    this._scFreq  = options.scFreq  ?? 1000;
    this._scGain  = options.scGain  ?? 0;
    this._wet     = options.wet     ?? 1.0;

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);
    this.sidechainInput = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);

    // Self-route: main input feeds sidechain for self-detection mode.
    // Controlled by selfRouteGain — set to 0 when external source is wired.
    this.selfRouteGain = new Tone.Gain(1);
    this.input.connect(this.selfRouteGain);
    this.selfRouteGain.connect(this.sidechainInput);

    void this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await SidechainLimiterEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'sidechain-limiter-processor', {
        numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
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
            // Connect sidechain input to worklet's 2nd input
            const rawSc = getNativeAudioNode(this.sidechainInput)!;
            if (rawSc) rawSc.connect(this.workletNode!, 0, 1);
            // Now safe to disconnect passthrough
            try { this.input.disconnect(this.wetGain); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[SidechainLimiter] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: SidechainLimiterEffect.wasmBinary!, jsCode: SidechainLimiterEffect.jsCode! },
        [SidechainLimiterEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('ceiling', this._ceiling);
      this.sendParam('release', this._release);
      this.sendParam('scFreq', this._scFreq);
      this.sendParam('scGain', this._scGain);
    } catch (err) {
      console.warn('[SidechainLimiter] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}sidechain-limiter/SidechainLimiter.wasm`), fetch(`${base}sidechain-limiter/SidechainLimiter.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}sidechain-limiter/SidechainLimiter.worklet.js`);
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

  get ceiling(): number { return this._ceiling; }
  set ceiling(v: number) { this._ceiling = clamp(v, -24, 0); this.sendParam('ceiling', this._ceiling); }
  get release(): number { return this._release; }
  set release(v: number) { this._release = clamp(v, 10, 500); this.sendParam('release', this._release); }
  get scFreq(): number { return this._scFreq; }
  set scFreq(v: number) { this._scFreq = clamp(v, 20, 20000); this.sendParam('scFreq', this._scFreq); }
  get scGain(): number { return this._scGain; }
  set scGain(v: number) { this._scGain = clamp(v, -12, 12); this.sendParam('scGain', this._scGain); }
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  getSidechainInput(): Tone.Gain {
    return this.sidechainInput;
  }

  /** Enable/disable self-route (input→sidechain). Called by wireMasterSidechain. */
  setSelfSidechain(enabled: boolean): void {
    this.selfRouteGain.gain.value = enabled ? 1 : 0;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'ceiling': this.ceiling = value; break;
      case 'release': this.release = value; break;
      case 'scFreq':  this.scFreq = value;  break;
      case 'scGain':  this.scGain = value;  break;
      case 'wet':     this.wet = value;     break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.dryGain.dispose(); this.wetGain.dispose(); this.sidechainInput.dispose();
    this.selfRouteGain.dispose();
    this.input.dispose(); this.output.dispose();
    super.dispose();
    return this;
  }
}
