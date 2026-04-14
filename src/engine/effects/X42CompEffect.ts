/**
 * X42CompEffect — RMS compressor with hold feature via WASM AudioWorklet.
 *
 * Parameters:
 *   threshold   -50..-10 dB  Compression threshold
 *   ratio       1..20        Compression ratio
 *   attack      0.1..100 ms  Attack time
 *   release     10..1000 ms  Release time
 *   hold        0 or 1       Freeze gain when below threshold
 *   inputGain   -10..30 dB   Input gain
 *   mix         0..1         Dry/wet mix
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface X42CompOptions {
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  hold?: number;
  inputGain?: number;
  wet?: number;
}

export class X42CompEffect extends Tone.ToneAudioNode {
  readonly name = 'X42Comp';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _threshold: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _hold: number;
  private _inputGain: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: X42CompOptions = {}) {
    super();
    this._threshold = options.threshold ?? -20;
    this._ratio     = options.ratio     ?? 4;
    this._attack    = options.attack    ?? 10;
    this._release   = options.release   ?? 100;
    this._hold      = options.hold      ?? 0;
    this._inputGain = options.inputGain ?? 0;
    this._wet       = options.wet       ?? 1.0;

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
      await X42CompEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'x42-comp-processor', {
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
            console.warn('[X42Comp] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: X42CompEffect.wasmBinary!, jsCode: X42CompEffect.jsCode! },
        [X42CompEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('threshold', this._threshold);
      this.sendParam('ratio', this._ratio);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('hold', this._hold);
      this.sendParam('inputGain', this._inputGain);
    } catch (err) {
      console.warn('[X42Comp] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}x42-comp/X42Comp.wasm`), fetch(`${base}x42-comp/X42Comp.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}x42-comp/X42Comp.worklet.js`);
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

  get threshold(): number { return this._threshold; }
  set threshold(v: number) { this._threshold = clamp(v, -50, -10); this.sendParam('threshold', this._threshold); }
  get ratio(): number { return this._ratio; }
  set ratio(v: number) { this._ratio = clamp(v, 1, 20); this.sendParam('ratio', this._ratio); }
  get attack(): number { return this._attack; }
  set attack(v: number) { this._attack = clamp(v, 0.1, 100); this.sendParam('attack', this._attack); }
  get release(): number { return this._release; }
  set release(v: number) { this._release = clamp(v, 10, 1000); this.sendParam('release', this._release); }
  get holdEnabled(): number { return this._hold; }
  set holdEnabled(v: number) { this._hold = v > 0.5 ? 1 : 0; this.sendParam('hold', this._hold); }
  get inputGainDb(): number { return this._inputGain; }
  set inputGainDb(v: number) { this._inputGain = clamp(v, -10, 30); this.sendParam('inputGain', this._inputGain); }
  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'threshold': this.threshold = value;   break;
      case 'ratio':     this.ratio = value;       break;
      case 'attack':    this.attack = value;      break;
      case 'release':   this.release = value;     break;
      case 'hold':      this.holdEnabled = value; break;
      case 'inputGain': this.inputGainDb = value; break;
      case 'wet':       this.wet = value;         break;
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
