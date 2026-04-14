import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface SlapbackDelayOptions {
  time?: number;
  feedback?: number;
  tone?: number;
  mix?: number;
  wet?: number;
}

export class SlapbackDelayEffect extends Tone.ToneAudioNode {
  readonly name = 'SlapbackDelay';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];
  private _time: number;
  private _feedback: number;
  private _tone: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: SlapbackDelayOptions = {}) {
    super();
    this._time = options.time ?? 60;
    this._feedback = options.feedback ?? 0.1;
    this._tone = options.tone ?? 4000;
    this._mix = options.mix ?? 0.5;
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
      await SlapbackDelayEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'slapback-delay-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.isWasmReady = true;
          for (const p of this.pendingParams) this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
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
            console.warn('[SlapbackDelay] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: SlapbackDelayEffect.wasmBinary!, jsCode: SlapbackDelayEffect.jsCode! },
        [SlapbackDelayEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('time', this._time);
      this.sendParam('feedback', this._feedback);
      this.sendParam('tone', this._tone);
      this.sendParam('mix', this._mix);
    } catch (err) { console.warn('[SlapbackDelay] Worklet init failed:', err); }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}slapback-delay/SlapbackDelay.wasm`),
        fetch(`${base}slapback-delay/SlapbackDelay.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}slapback-delay/SlapbackDelay.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  private sendParam(param: string, value: number): void {
    if (this.workletNode && this.isWasmReady) this.workletNode.port.postMessage({ type: 'parameter', param, value });
    else { this.pendingParams = this.pendingParams.filter(p => p.param !== param); this.pendingParams.push({ param, value }); }
  }

  get time(): number { return this._time; }
  set time(v: number) { this._time = clamp(v, 10, 120); this.sendParam('time', this._time); }

  get feedbackAmount(): number { return this._feedback; }
  set feedbackAmount(v: number) { this._feedback = clamp(v, 0, 0.5); this.sendParam('feedback', this._feedback); }

  get toneFreq(): number { return this._tone; }
  set toneFreq(v: number) { this._tone = clamp(v, 200, 8000); this.sendParam('tone', this._tone); }

  get mixAmount(): number { return this._mix; }
  set mixAmount(v: number) { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'time': this.time = value; break;
      case 'feedback': this.feedbackAmount = value; break;
      case 'tone': this.toneFreq = value; break;
      case 'mix': this.mixAmount = value; break;
      case 'wet': this.wet = value; break;
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.passthroughGain.dispose(); this.dryGain.dispose(); this.wetGain.dispose(); this.input.dispose(); this.output.dispose();
    super.dispose(); return this;
  }
}
