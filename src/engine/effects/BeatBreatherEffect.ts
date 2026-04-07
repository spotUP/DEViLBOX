/**
 * BeatBreatherEffect.ts — BeatBreather via WASM AudioWorklet.
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface BeatBreatherOptions {
  transientBoost?: number;
  sustainBoost?: number;
  sensitivity?: number;
  attack?: number;
  release?: number;
  mix?: number;
  wet?: number;
}

export class BeatBreatherEffect extends Tone.ToneAudioNode {
  readonly name = 'BeatBreather';
  readonly _input: Tone.Gain;
  readonly _output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _transientBoost: number;
  private _sustainBoost: number;
  private _sensitivity: number;
  private _attack: number;
  private _release: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: BeatBreatherOptions = {}) {
    super();
    this._transientBoost = options.transientBoost ?? 0.0;
    this._sustainBoost = options.sustainBoost ?? 0.0;
    this._sensitivity = options.sensitivity ?? 0.5;
    this._attack = options.attack ?? 5.0;
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
      await BeatBreatherEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'beat-breather-processor', {
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
        { type: 'init', wasmBinary: BeatBreatherEffect.wasmBinary!, jsCode: BeatBreatherEffect.jsCode! },
        [BeatBreatherEffect.wasmBinary!.slice(0)],
      );

      this.sendParam('transientBoost', this._transientBoost);
      this.sendParam('sustainBoost', this._sustainBoost);
      this.sendParam('sensitivity', this._sensitivity);
      this.sendParam('attack', this._attack);
      this.sendParam('release', this._release);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[BeatBreather] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}beat-breather/BeatBreather.wasm`), fetch(`${base}beat-breather/BeatBreather.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}beat-breather/BeatBreather.worklet.js`);
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

  setTransientBoost(v: number): void { this._transientBoost = Math.max(-1.0, Math.min(1.0, v)); this.sendParam('transientBoost', this._transientBoost); }
  setSustainBoost(v: number): void { this._sustainBoost = Math.max(-1.0, Math.min(1.0, v)); this.sendParam('sustainBoost', this._sustainBoost); }
  setSensitivity(v: number): void { this._sensitivity = Math.max(0.0, Math.min(1.0, v)); this.sendParam('sensitivity', this._sensitivity); }
  setAttack(v: number): void { this._attack = Math.max(0.1, Math.min(50.0, v)); this.sendParam('attack', this._attack); }
  setRelease(v: number): void { this._release = Math.max(10.0, Math.min(500.0, v)); this.sendParam('release', this._release); }
  setMix(v: number): void { this._mix = Math.max(0.0, Math.min(1.0, v)); this.sendParam('mix', this._mix); }

  get transientBoost(): number { return this._transientBoost; }
  get sustainBoost(): number { return this._sustainBoost; }
  get sensitivity(): number { return this._sensitivity; }
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
      case 'transientBoost': this.setTransientBoost(value); break;
      case 'sustainBoost': this.setSustainBoost(value); break;
      case 'sensitivity': this.setSensitivity(value); break;
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
