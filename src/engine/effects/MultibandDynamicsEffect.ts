/**
 * MultibandDynamicsEffect.ts — MultibandDynamics via WASM AudioWorklet.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface MultibandDynamicsOptions {
  lowCross?: number;
  highCross?: number;
  lowExpThresh?: number;
  midExpThresh?: number;
  highExpThresh?: number;
  lowCompThresh?: number;
  midCompThresh?: number;
  highCompThresh?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  mix?: number;
  wet?: number;
}

export class MultibandDynamicsEffect extends Tone.ToneAudioNode {
  readonly name = 'MultibandDynamics';
  readonly _input: Tone.Gain;
  readonly _output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _lowCross: number;
  private _highCross: number;
  private _lowExpThresh: number;
  private _midExpThresh: number;
  private _highExpThresh: number;
  private _lowCompThresh: number;
  private _midCompThresh: number;
  private _highCompThresh: number;
  private _ratio: number;
  private _attack: number;
  private _release: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultibandDynamicsOptions = {}) {
    super();
    this._lowCross = options.lowCross ?? 200.0;
    this._highCross = options.highCross ?? 4000.0;
    this._lowExpThresh = options.lowExpThresh ?? -40.0;
    this._midExpThresh = options.midExpThresh ?? -40.0;
    this._highExpThresh = options.highExpThresh ?? -40.0;
    this._lowCompThresh = options.lowCompThresh ?? -12.0;
    this._midCompThresh = options.midCompThresh ?? -12.0;
    this._highCompThresh = options.highCompThresh ?? -12.0;
    this._ratio = options.ratio ?? 4.0;
    this._attack = options.attack ?? 10.0;
    this._release = options.release ?? 100.0;
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
      await MultibandDynamicsEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multiband-dynamics-processor', {
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
            const rawInput = getNativeAudioNode(this._input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            // Now safe to disconnect passthrough
            try { this._input.disconnect(this.wetGain); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[MultibandDynamics] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MultibandDynamicsEffect.wasmBinary!, jsCode: MultibandDynamicsEffect.jsCode! },
        [MultibandDynamicsEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('lowCross', this._lowCross);
      this.sendParam('highCross', this._highCross);
      this.sendParam('lowExpThresh', this._lowExpThresh);
      this.sendParam('midExpThresh', this._midExpThresh);
      this.sendParam('highExpThresh', this._highExpThresh);
      this.sendParam('lowCompThresh', this._lowCompThresh);
      this.sendParam('midCompThresh', this._midCompThresh);
      this.sendParam('highCompThresh', this._highCompThresh);
      this.sendParam('ratio', this._ratio);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[MultibandDynamics] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multiband-dynamics/MultibandDynamics.wasm`), fetch(`${base}multiband-dynamics/MultibandDynamics.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multiband-dynamics/MultibandDynamics.worklet.js`);
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
  setLowExpThresh(v: number): void { this._lowExpThresh = Math.max(-60.0, Math.min(-10.0, v)); this.sendParam('lowExpThresh', this._lowExpThresh); }
  setMidExpThresh(v: number): void { this._midExpThresh = Math.max(-60.0, Math.min(-10.0, v)); this.sendParam('midExpThresh', this._midExpThresh); }
  setHighExpThresh(v: number): void { this._highExpThresh = Math.max(-60.0, Math.min(-10.0, v)); this.sendParam('highExpThresh', this._highExpThresh); }
  setLowCompThresh(v: number): void { this._lowCompThresh = Math.max(-30.0, Math.min(0.0, v)); this.sendParam('lowCompThresh', this._lowCompThresh); }
  setMidCompThresh(v: number): void { this._midCompThresh = Math.max(-30.0, Math.min(0.0, v)); this.sendParam('midCompThresh', this._midCompThresh); }
  setHighCompThresh(v: number): void { this._highCompThresh = Math.max(-30.0, Math.min(0.0, v)); this.sendParam('highCompThresh', this._highCompThresh); }
  setRatio(v: number): void { this._ratio = Math.max(1.0, Math.min(20.0, v)); this.sendParam('ratio', this._ratio); }
  setAttack(v: number): void { this._attack = Math.max(0.1, Math.min(100.0, v)); this.sendParam('attack', this._attack); }
  setRelease(v: number): void { this._release = Math.max(10.0, Math.min(1000.0, v)); this.sendParam('release', this._release); }
  setMix(v: number): void { this._mix = Math.max(0.0, Math.min(1.0, v)); this.sendParam('mix', this._mix); }

  get lowCross(): number { return this._lowCross; }
  get highCross(): number { return this._highCross; }
  get lowExpThresh(): number { return this._lowExpThresh; }
  get midExpThresh(): number { return this._midExpThresh; }
  get highExpThresh(): number { return this._highExpThresh; }
  get lowCompThresh(): number { return this._lowCompThresh; }
  get midCompThresh(): number { return this._midCompThresh; }
  get highCompThresh(): number { return this._highCompThresh; }
  get ratio(): number { return this._ratio; }
  get attack(): number { return this._attack; }
  get release(): number { return this._release; }
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
      case 'lowExpThresh': this.setLowExpThresh(value); break;
      case 'midExpThresh': this.setMidExpThresh(value); break;
      case 'highExpThresh': this.setHighExpThresh(value); break;
      case 'lowCompThresh': this.setLowCompThresh(value); break;
      case 'midCompThresh': this.setMidCompThresh(value); break;
      case 'highCompThresh': this.setHighCompThresh(value); break;
      case 'ratio': this.setRatio(value); break;
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
    this.dryGain.dispose(); this.wetGain.dispose();
    this._input.dispose(); this._output.dispose();
    super.dispose();
    return this;
  }
}
