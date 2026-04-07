/**
 * AGCEffect.ts — AGC via WASM AudioWorklet.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface AGCOptions {
  target?: number;
  speed?: number;
  maxGain?: number;
  mix?: number;
  wet?: number;
}

export class AGCEffect extends Tone.ToneAudioNode {
  readonly name = 'AGC';
  readonly _input: Tone.Gain;
  readonly _output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _target: number;
  private _speed: number;
  private _maxGain: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: AGCOptions = {}) {
    super();
    this._target = options.target ?? -12.0;
    this._speed = options.speed ?? 0.1;
    this._maxGain = options.maxGain ?? 12.0;
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
      await AGCEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'agc-processor', {
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
        { type: 'init', wasmBinary: AGCEffect.wasmBinary!, jsCode: AGCEffect.jsCode! },
        [AGCEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('target', this._target);
      this.sendParam('speed', this._speed);
      this.sendParam('maxGain', this._maxGain);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[AGC] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}agc/AGC.wasm`), fetch(`${base}agc/AGC.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}agc/AGC.worklet.js`);
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

  setTarget(v: number): void { this._target = Math.max(-24.0, Math.min(0.0, v)); this.sendParam('target', this._target); }
  setSpeed(v: number): void { this._speed = Math.max(0.01, Math.min(1.0, v)); this.sendParam('speed', this._speed); }
  setMaxGain(v: number): void { this._maxGain = Math.max(0.0, Math.min(24.0, v)); this.sendParam('maxGain', this._maxGain); }
  setMix(v: number): void { this._mix = Math.max(0.0, Math.min(1.0, v)); this.sendParam('mix', this._mix); }

  get target(): number { return this._target; }
  get speed(): number { return this._speed; }
  get maxGain(): number { return this._maxGain; }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'target': this.setTarget(value); break;
      case 'speed': this.setSpeed(value); break;
      case 'maxGain': this.setMaxGain(value); break;
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
