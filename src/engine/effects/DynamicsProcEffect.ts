/**
 * DynamicsProcEffect — Full dynamics processor (expander + compressor) via WASM AudioWorklet.
 *
 * Parameters:
 *   lowerThresh  -60..0 dB    Expander threshold (below = expand)
 *   upperThresh  -30..0 dB    Compressor threshold (above = compress)
 *   ratio        1..20        Expansion/compression ratio
 *   attack       0.1..100 ms  Attack time
 *   release      10..1000 ms  Release time
 *   makeup       0..24 dB     Makeup gain
 *   mix          0..1         Dry/wet mix
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface DynamicsProcOptions {
  lowerThresh?: number;
  upperThresh?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  makeup?: number;
  wet?: number;
}

export class DynamicsProcEffect extends Tone.ToneAudioNode {
  readonly name = 'DynamicsProc';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowerThresh: number;
  private _upperThresh: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _makeup: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: DynamicsProcOptions = {}) {
    super();
    this._lowerThresh = options.lowerThresh ?? -40;
    this._upperThresh = options.upperThresh ?? -12;
    this._ratio       = options.ratio       ?? 4;
    this._attack      = options.attack      ?? 10;
    this._release     = options.release     ?? 100;
    this._makeup      = options.makeup      ?? 0;
    this._wet         = options.wet         ?? 1.0;

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
      await DynamicsProcEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'dynamics-proc-processor', {
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
            console.warn('[DynamicsProc] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: DynamicsProcEffect.wasmBinary!, jsCode: DynamicsProcEffect.jsCode! },
        [DynamicsProcEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowerThresh', this._lowerThresh);
      this.sendParam('upperThresh', this._upperThresh);
      this.sendParam('ratio', this._ratio);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('makeup', this._makeup);
    } catch (err) {
      console.warn('[DynamicsProc] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}dynamics-proc/DynamicsProc.wasm`), fetch(`${base}dynamics-proc/DynamicsProc.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}dynamics-proc/DynamicsProc.worklet.js`);
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

  get lowerThresh(): number { return this._lowerThresh; }
  set lowerThresh(v: number) { this._lowerThresh = clamp(v, -60, 0); this.sendParam('lowerThresh', this._lowerThresh); }
  get upperThresh(): number { return this._upperThresh; }
  set upperThresh(v: number) { this._upperThresh = clamp(v, -30, 0); this.sendParam('upperThresh', this._upperThresh); }
  get ratio(): number { return this._ratio; }
  set ratio(v: number) { this._ratio = clamp(v, 1, 20); this.sendParam('ratio', this._ratio); }
  get attack(): number { return this._attack; }
  set attack(v: number) { this._attack = clamp(v, 0.1, 100); this.sendParam('attack', this._attack); }
  get release(): number { return this._release; }
  set release(v: number) { this._release = clamp(v, 10, 1000); this.sendParam('release', this._release); }
  get makeup(): number { return this._makeup; }
  set makeup(v: number) { this._makeup = clamp(v, 0, 24); this.sendParam('makeup', this._makeup); }
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'lowerThresh': this.lowerThresh = value; break;
      case 'upperThresh': this.upperThresh = value; break;
      case 'ratio':       this.ratio = value;       break;
      case 'attack':      this.attack = value;      break;
      case 'release':     this.release = value;     break;
      case 'makeup':      this.makeup = value;      break;
      case 'wet':         this.wet = value;         break;
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
