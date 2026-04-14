import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface DistortionShaperOptions {
  inputGain?: number;
  point1x?: number;
  point1y?: number;
  point2x?: number;
  point2y?: number;
  outputGain?: number;
  preLpf?: number;
  postLpf?: number;
  mix?: number;
  wet?: number;
}

export class DistortionShaperEffect extends Tone.ToneAudioNode {
  readonly name = 'DistortionShaper';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _inputGain: number;
  private _point1x: number;
  private _point1y: number;
  private _point2x: number;
  private _point2y: number;
  private _outputGain: number;
  private _preLpf: number;
  private _postLpf: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: DistortionShaperOptions = {}) {
    super();
    this._inputGain = options.inputGain ?? 1;
    this._point1x = options.point1x ?? -0.5;
    this._point1y = options.point1y ?? -0.5;
    this._point2x = options.point2x ?? 0.5;
    this._point2y = options.point2y ?? 0.5;
    this._outputGain = options.outputGain ?? 1;
    this._preLpf = options.preLpf ?? 20000;
    this._postLpf = options.postLpf ?? 20000;
    this._mix = options.mix ?? 1;
    this._wet = options.wet ?? 1.0;

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
      await DistortionShaperEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'distortion-shaper-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.workletNode.port.onmessage = (ev) => {
        if (ev.data.type === 'ready') {
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
            console.warn('[DistortionShaper] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: DistortionShaperEffect.wasmBinary!, jsCode: DistortionShaperEffect.jsCode! },
        [DistortionShaperEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('inputGain', this._inputGain);
      this.sendParam('point1x', this._point1x);
      this.sendParam('point1y', this._point1y);
      this.sendParam('point2x', this._point2x);
      this.sendParam('point2y', this._point2y);
      this.sendParam('outputGain', this._outputGain);
      this.sendParam('preLpf', this._preLpf);
      this.sendParam('postLpf', this._postLpf);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[DistortionShaper] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}distortion-shaper/DistortionShaper.wasm`), fetch(`${base}distortion-shaper/DistortionShaper.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}distortion-shaper/DistortionShaper.worklet.js`);
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

  get inputGain(): number { return this._inputGain; }
  set inputGain(v: number) { this._inputGain = clamp(v, 0, 4); this.sendParam('inputGain', this._inputGain); }

  get point1x(): number { return this._point1x; }
  set point1x(v: number) { this._point1x = clamp(v, -1, 1); this.sendParam('point1x', this._point1x); }

  get point1y(): number { return this._point1y; }
  set point1y(v: number) { this._point1y = clamp(v, -1, 1); this.sendParam('point1y', this._point1y); }

  get point2x(): number { return this._point2x; }
  set point2x(v: number) { this._point2x = clamp(v, -1, 1); this.sendParam('point2x', this._point2x); }

  get point2y(): number { return this._point2y; }
  set point2y(v: number) { this._point2y = clamp(v, -1, 1); this.sendParam('point2y', this._point2y); }

  get outputGain(): number { return this._outputGain; }
  set outputGain(v: number) { this._outputGain = clamp(v, 0, 4); this.sendParam('outputGain', this._outputGain); }

  get preLpf(): number { return this._preLpf; }
  set preLpf(v: number) { this._preLpf = clamp(v, 200, 20000); this.sendParam('preLpf', this._preLpf); }

  get postLpf(): number { return this._postLpf; }
  set postLpf(v: number) { this._postLpf = clamp(v, 200, 20000); this.sendParam('postLpf', this._postLpf); }

  get mix(): number { return this._mix; }
  set mix(v: number) { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'inputGain': this.inputGain = value; break;
      case 'point1x': this.point1x = value; break;
      case 'point1y': this.point1y = value; break;
      case 'point2x': this.point2x = value; break;
      case 'point2y': this.point2y = value; break;
      case 'outputGain': this.outputGain = value; break;
      case 'preLpf': this.preLpf = value; break;
      case 'postLpf': this.postLpf = value; break;
      case 'mix': this.mix = value; break;
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
