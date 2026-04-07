/**
 * MultibandClipperEffect.ts — MultibandClipper via WASM AudioWorklet.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface MultibandClipperOptions {
  lowCross?: number;
  highCross?: number;
  lowCeil?: number;
  midCeil?: number;
  highCeil?: number;
  softness?: number;
  mix?: number;
  wet?: number;
}

export class MultibandClipperEffect extends Tone.ToneAudioNode {
  readonly name = 'MultibandClipper';
  readonly _input: Tone.Gain;
  readonly _output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowCross: number;
  private _highCross: number;
  private _lowCeil: number;
  private _midCeil: number;
  private _highCeil: number;
  private _softness: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultibandClipperOptions = {}) {
    super();
    this._lowCross = options.lowCross ?? 200.0;
    this._highCross = options.highCross ?? 4000.0;
    this._lowCeil = options.lowCeil ?? -3.0;
    this._midCeil = options.midCeil ?? -3.0;
    this._highCeil = options.highCeil ?? -3.0;
    this._softness = options.softness ?? 0.5;
    this._mix = options.mix ?? 1.0;
    this._wet = options.wet ?? 1.0;

    this._input  = new Tone.Gain(1);
    this._output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    this._input.connect(this.dryGain);
    this.dryGain.connect(this._output);
    this.wetGain.connect(this._output);
    this._input.connect(this.wetGain);

    void this._initWorklet();
  }

  get input() { return this._input; }
  get output() { return this._output; }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await MultibandClipperEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multiband-clipper-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.isWasmReady = true;
          for (const p of this.pendingParams) {
            this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
          }
          this.pendingParams = [];
          try { this._input.disconnect(this.wetGain); } catch { /* */ }
          const rawInput = getNativeAudioNode(this._input)!;
          const rawWet = getNativeAudioNode(this.wetGain)!;
          rawInput.connect(this.workletNode!);
          this.workletNode!.connect(rawWet);
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MultibandClipperEffect.wasmBinary!, jsCode: MultibandClipperEffect.jsCode! },
        [MultibandClipperEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowCross', this._lowCross);
      this.sendParam('highCross', this._highCross);
      this.sendParam('lowCeil', this._lowCeil);
      this.sendParam('midCeil', this._midCeil);
      this.sendParam('highCeil', this._highCeil);
      this.sendParam('softness', this._softness);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[MultibandClipper] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-clipper/MultibandClipper.wasm`), fetch(`${base}multiband-clipper/MultibandClipper.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-clipper/MultibandClipper.worklet.js`);
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

  setLowCross(v: number): void { this._lowCross = Math.max(20.0, Math.min(1000.0, v)); this.sendParam('lowCross', this._lowCross); }
  setHighCross(v: number): void { this._highCross = Math.max(500.0, Math.min(16000.0, v)); this.sendParam('highCross', this._highCross); }
  setLowCeil(v: number): void { this._lowCeil = Math.max(-24.0, Math.min(0.0, v)); this.sendParam('lowCeil', this._lowCeil); }
  setMidCeil(v: number): void { this._midCeil = Math.max(-24.0, Math.min(0.0, v)); this.sendParam('midCeil', this._midCeil); }
  setHighCeil(v: number): void { this._highCeil = Math.max(-24.0, Math.min(0.0, v)); this.sendParam('highCeil', this._highCeil); }
  setSoftness(v: number): void { this._softness = Math.max(0.0, Math.min(1.0, v)); this.sendParam('softness', this._softness); }
  setMix(v: number): void { this._mix = Math.max(0.0, Math.min(1.0, v)); this.sendParam('mix', this._mix); }

  get lowCross(): number { return this._lowCross; }
  get highCross(): number { return this._highCross; }
  get lowCeil(): number { return this._lowCeil; }
  get midCeil(): number { return this._midCeil; }
  get highCeil(): number { return this._highCeil; }
  get softness(): number { return this._softness; }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'lowCross': this.setLowCross(value); break;
      case 'highCross': this.setHighCross(value); break;
      case 'lowCeil': this.setLowCeil(value); break;
      case 'midCeil': this.setMidCeil(value); break;
      case 'highCeil': this.setHighCeil(value); break;
      case 'softness': this.setSoftness(value); break;
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
    this.dryGain.dispose(); this.wetGain.dispose();
    this._input.dispose(); this._output.dispose();
    super.dispose();
    return this;
  }
}
