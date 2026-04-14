/**
 * MultibandGateEffect — 3-band crossover + per-band gate via WASM AudioWorklet.
 *
 * Parameters:
 *   lowCross    20..1000 Hz   Low/mid crossover frequency
 *   highCross   500..16000 Hz Mid/high crossover frequency
 *   lowThresh   -80..0 dB     Low band gate threshold
 *   midThresh   -80..0 dB     Mid band gate threshold
 *   highThresh  -80..0 dB     High band gate threshold
 *   lowRange    0..1          Low band gate floor
 *   midRange    0..1          Mid band gate floor
 *   highRange   0..1          High band gate floor
 *   attack      0.01..100 ms  Attack time
 *   release     1..5000 ms    Release time
 *   mix         0..1          Dry/wet mix
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface MultibandGateOptions {
  lowCross?: number;
  highCross?: number;
  lowThresh?: number;
  midThresh?: number;
  highThresh?: number;
  lowRange?: number;
  midRange?: number;
  highRange?: number;
  attack?: number;
  release?: number;
  wet?: number;
}

export class MultibandGateEffect extends Tone.ToneAudioNode {
  readonly name = 'MultibandGate';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowCross: number;
  private _highCross: number;
  private _lowThresh: number;
  private _midThresh: number;
  private _highThresh: number;
  private _lowRange: number;
  private _midRange: number;
  private _highRange: number;
  private _attack: number;
  private _release: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultibandGateOptions = {}) {
    super();
    this._lowCross   = options.lowCross   ?? 200;
    this._highCross  = options.highCross  ?? 3000;
    this._lowThresh  = options.lowThresh  ?? -40;
    this._midThresh  = options.midThresh  ?? -40;
    this._highThresh = options.highThresh ?? -40;
    this._lowRange   = options.lowRange   ?? 0;
    this._midRange   = options.midRange   ?? 0;
    this._highRange  = options.highRange  ?? 0;
    this._attack     = options.attack     ?? 1;
    this._release    = options.release    ?? 200;
    this._wet        = options.wet        ?? 1.0;

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
      await MultibandGateEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multiband-gate-processor', {
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
            console.warn('[MultibandGate] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MultibandGateEffect.wasmBinary!, jsCode: MultibandGateEffect.jsCode! },
        [MultibandGateEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowCross', this._lowCross);
      this.sendParam('highCross', this._highCross);
      this.sendParam('lowThresh', this._lowThresh);
      this.sendParam('midThresh', this._midThresh);
      this.sendParam('highThresh', this._highThresh);
      this.sendParam('lowRange', this._lowRange);
      this.sendParam('midRange', this._midRange);
      this.sendParam('highRange', this._highRange);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
    } catch (err) {
      console.warn('[MultibandGate] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-gate/MultibandGate.wasm`), fetch(`${base}multiband-gate/MultibandGate.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-gate/MultibandGate.worklet.js`);
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

  get lowCross(): number { return this._lowCross; }
  set lowCross(v: number) { this._lowCross = clamp(v, 20, 1000); this.sendParam('lowCross', this._lowCross); }
  get highCross(): number { return this._highCross; }
  set highCross(v: number) { this._highCross = clamp(v, 500, 16000); this.sendParam('highCross', this._highCross); }
  get lowThresh(): number { return this._lowThresh; }
  set lowThresh(v: number) { this._lowThresh = clamp(v, -80, 0); this.sendParam('lowThresh', this._lowThresh); }
  get midThresh(): number { return this._midThresh; }
  set midThresh(v: number) { this._midThresh = clamp(v, -80, 0); this.sendParam('midThresh', this._midThresh); }
  get highThresh(): number { return this._highThresh; }
  set highThresh(v: number) { this._highThresh = clamp(v, -80, 0); this.sendParam('highThresh', this._highThresh); }
  get lowRange(): number { return this._lowRange; }
  set lowRange(v: number) { this._lowRange = clamp(v, 0, 1); this.sendParam('lowRange', this._lowRange); }
  get midRange(): number { return this._midRange; }
  set midRange(v: number) { this._midRange = clamp(v, 0, 1); this.sendParam('midRange', this._midRange); }
  get highRange(): number { return this._highRange; }
  set highRange(v: number) { this._highRange = clamp(v, 0, 1); this.sendParam('highRange', this._highRange); }
  get attack(): number { return this._attack; }
  set attack(v: number) { this._attack = clamp(v, 0.01, 100); this.sendParam('attack', this._attack); }
  get release(): number { return this._release; }
  set release(v: number) { this._release = clamp(v, 1, 5000); this.sendParam('release', this._release); }
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'lowCross':   this.lowCross = value;   break;
      case 'highCross':  this.highCross = value;  break;
      case 'lowThresh':  this.lowThresh = value;  break;
      case 'midThresh':  this.midThresh = value;  break;
      case 'highThresh': this.highThresh = value; break;
      case 'lowRange':   this.lowRange = value;   break;
      case 'midRange':   this.midRange = value;   break;
      case 'highRange':  this.highRange = value;  break;
      case 'attack':     this.attack = value;     break;
      case 'release':    this.release = value;    break;
      case 'wet':        this.wet = value;        break;
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
