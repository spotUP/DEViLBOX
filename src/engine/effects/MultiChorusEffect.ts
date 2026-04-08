/**
 * MultiChorusEffect.ts — MultiChorus via WASM AudioWorklet.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface MultiChorusOptions {
  rate?: number;
  depth?: number;
  voices?: number;
  stereoPhase?: number;
  mix?: number;
  wet?: number;
}

export class MultiChorusEffect extends Tone.ToneAudioNode {
  readonly name = 'MultiChorus';
  readonly _input: Tone.Gain;
  readonly _output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _rate: number;
  private _depth: number;
  private _voices: number;
  private _stereoPhase: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: MultiChorusOptions = {}) {
    super();
    this._rate = options.rate ?? 0.5;
    this._depth = options.depth ?? 0.5;
    this._voices = options.voices ?? 4.0;
    this._stereoPhase = options.stereoPhase ?? 90.0;
    this._mix = options.mix ?? 0.5;
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
      await MultiChorusEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'multi-chorus-processor', {
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
            console.warn('[MultiChorus] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: MultiChorusEffect.wasmBinary!, jsCode: MultiChorusEffect.jsCode! },
        [MultiChorusEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('rate', this._rate);
      this.sendParam('depth', this._depth);
      this.sendParam('voices', this._voices);
      this.sendParam('stereoPhase', this._stereoPhase);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[MultiChorus] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}multi-chorus/MultiChorus.wasm`), fetch(`${base}multi-chorus/MultiChorus.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}multi-chorus/MultiChorus.worklet.js`);
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

  setRate(v: number): void { this._rate = Math.max(0.01, Math.min(10.0, v)); this.sendParam('rate', this._rate); }
  setDepth(v: number): void { this._depth = Math.max(0.0, Math.min(1.0, v)); this.sendParam('depth', this._depth); }
  setVoices(v: number): void { this._voices = Math.max(1.0, Math.min(8.0, v)); this.sendParam('voices', this._voices); }
  setStereoPhase(v: number): void { this._stereoPhase = Math.max(0.0, Math.min(360.0, v)); this.sendParam('stereoPhase', this._stereoPhase); }
  setMix(v: number): void { this._mix = Math.max(0.0, Math.min(1.0, v)); this.sendParam('mix', this._mix); }

  get rate(): number { return this._rate; }
  get depth(): number { return this._depth; }
  get voices(): number { return this._voices; }
  get stereoPhase(): number { return this._stereoPhase; }
  get mix(): number { return this._mix; }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'rate': this.setRate(value); break;
      case 'depth': this.setDepth(value); break;
      case 'voices': this.setVoices(value); break;
      case 'stereoPhase': this.setStereoPhase(value); break;
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
