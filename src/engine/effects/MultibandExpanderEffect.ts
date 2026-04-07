/**
 * MultibandExpanderEffect.ts — MultibandExpander via WASM AudioWorklet.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface MultibandExpanderOptions {
  lowCross?: number;
  highCross?: number;
  lowThresh?: number;
  midThresh?: number;
  highThresh?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  range?: number;
  mix?: number;
  wet?: number;
}

export class MultibandExpanderEffect extends Tone.ToneAudioNode {
  readonly name = 'MultibandExpander';
  readonly _input: Tone.Gain;
  readonly _output: Tone.Gain;

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
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _range: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultibandExpanderOptions = {}) {
    super();
    this._lowCross = options.lowCross ?? 200.0;
    this._highCross = options.highCross ?? 4000.0;
    this._lowThresh = options.lowThresh ?? -40.0;
    this._midThresh = options.midThresh ?? -40.0;
    this._highThresh = options.highThresh ?? -40.0;
    this._ratio = options.ratio ?? 2.0;
    this._attack = options.attack ?? 5.0;
    this._release = options.release ?? 100.0;
    this._range = options.range ?? -40.0;
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
      await MultibandExpanderEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multiband-expander-processor', {
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
        { type: 'init', wasmBinary: MultibandExpanderEffect.wasmBinary!, jsCode: MultibandExpanderEffect.jsCode! },
        [MultibandExpanderEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowCross', this._lowCross);
      this.sendParam('highCross', this._highCross);
      this.sendParam('lowThresh', this._lowThresh);
      this.sendParam('midThresh', this._midThresh);
      this.sendParam('highThresh', this._highThresh);
      this.sendParam('ratio', this._ratio);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('range', this._range);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[MultibandExpander] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-expander/MultibandExpander.wasm`), fetch(`${base}multiband-expander/MultibandExpander.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-expander/MultibandExpander.worklet.js`);
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
  setLowThresh(v: number): void { this._lowThresh = Math.max(-60.0, Math.min(0.0, v)); this.sendParam('lowThresh', this._lowThresh); }
  setMidThresh(v: number): void { this._midThresh = Math.max(-60.0, Math.min(0.0, v)); this.sendParam('midThresh', this._midThresh); }
  setHighThresh(v: number): void { this._highThresh = Math.max(-60.0, Math.min(0.0, v)); this.sendParam('highThresh', this._highThresh); }
  setRatio(v: number): void { this._ratio = Math.max(1.0, Math.min(10.0, v)); this.sendParam('ratio', this._ratio); }
  setAttack(v: number): void { this._attack = Math.max(0.1, Math.min(100.0, v)); this.sendParam('attack', this._attack); }
  setRelease(v: number): void { this._release = Math.max(10.0, Math.min(1000.0, v)); this.sendParam('release', this._release); }
  setRange(v: number): void { this._range = Math.max(-90.0, Math.min(0.0, v)); this.sendParam('range', this._range); }
  setMix(v: number): void { this._mix = Math.max(0.0, Math.min(1.0, v)); this.sendParam('mix', this._mix); }

  get lowCross(): number { return this._lowCross; }
  get highCross(): number { return this._highCross; }
  get lowThresh(): number { return this._lowThresh; }
  get midThresh(): number { return this._midThresh; }
  get highThresh(): number { return this._highThresh; }
  get ratio(): number { return this._ratio; }
  get attack(): number { return this._attack; }
  get release(): number { return this._release; }
  get range(): number { return this._range; }
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
      case 'lowThresh': this.setLowThresh(value); break;
      case 'midThresh': this.setMidThresh(value); break;
      case 'highThresh': this.setHighThresh(value); break;
      case 'ratio': this.setRatio(value); break;
      case 'attack': this.setAttack(value); break;
      case 'release': this.setRelease(value); break;
      case 'range': this.setRange(value); break;
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
