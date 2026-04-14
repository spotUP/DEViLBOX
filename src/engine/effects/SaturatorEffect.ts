import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface SaturatorOptions {
  drive?: number;
  blend?: number;
  preFreq?: number;
  postFreq?: number;
  mix?: number;
  wet?: number;
}

export class SaturatorEffect extends Tone.ToneAudioNode {
  readonly name = 'Saturator';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _drive: number;
  private _blend: number;
  private _preFreq: number;
  private _postFreq: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: SaturatorOptions = {}) {
    super();
    this._drive = options.drive ?? 0.5;
    this._blend = options.blend ?? 0.5;
    this._preFreq = options.preFreq ?? 20000;
    this._postFreq = options.postFreq ?? 20000;
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
      await SaturatorEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'saturator-processor', {
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
            console.warn('[Saturator] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: SaturatorEffect.wasmBinary!, jsCode: SaturatorEffect.jsCode! },
        [SaturatorEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('drive', this._drive);
      this.sendParam('blend', this._blend);
      this.sendParam('preFreq', this._preFreq);
      this.sendParam('postFreq', this._postFreq);
      this.sendParam('mix', this._mix);
    } catch (err) {
      console.warn('[Saturator] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}saturator/Saturator.wasm`), fetch(`${base}saturator/Saturator.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}saturator/Saturator.worklet.js`);
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

  get drive(): number { return this._drive; }
  set drive(v: number) { this._drive = clamp(v, 0, 1); this.sendParam('drive', this._drive); }

  get blend(): number { return this._blend; }
  set blend(v: number) { this._blend = clamp(v, 0, 1); this.sendParam('blend', this._blend); }

  get preFreq(): number { return this._preFreq; }
  set preFreq(v: number) { this._preFreq = clamp(v, 200, 20000); this.sendParam('preFreq', this._preFreq); }

  get postFreq(): number { return this._postFreq; }
  set postFreq(v: number) { this._postFreq = clamp(v, 200, 20000); this.sendParam('postFreq', this._postFreq); }

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
      case 'drive': this.drive = value; break;
      case 'blend': this.blend = value; break;
      case 'preFreq': this.preFreq = value; break;
      case 'postFreq': this.postFreq = value; break;
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
