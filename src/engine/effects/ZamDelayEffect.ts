import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ZamDelayOptions {
  time?: number;
  feedback?: number;
  lpf?: number;
  hpf?: number;
  invert?: number;
  mix?: number;
  wet?: number;
}

export class ZamDelayEffect extends Tone.ToneAudioNode {
  readonly name = 'ZamDelay';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];
  private _time: number;
  private _feedback: number;
  private _lpf: number;
  private _hpf: number;
  private _invert: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: ZamDelayOptions = {}) {
    super();
    this._time = options.time ?? 500;
    this._feedback = options.feedback ?? 0.4;
    this._lpf = options.lpf ?? 8000;
    this._hpf = options.hpf ?? 60;
    this._invert = options.invert ?? 0;
    this._mix = options.mix ?? 0.5;
    this._wet = options.wet ?? 1.0;
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);
    void this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await ZamDelayEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'zam-delay-processor', {
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
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            // Keepalive: ensure Chrome schedules the worklet
            const rawCtx = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[ZamDelay] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: ZamDelayEffect.wasmBinary!, jsCode: ZamDelayEffect.jsCode! },
        [ZamDelayEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('time', this._time);
      this.sendParam('feedback', this._feedback);
      this.sendParam('lpf', this._lpf);
      this.sendParam('hpf', this._hpf);
      this.sendParam('invert', this._invert);
      this.sendParam('mix', this._mix);
    } catch (err) { console.warn('[ZamDelay] Worklet init failed:', err); }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}zam-delay/ZamDelay.wasm`),
        fetch(`${base}zam-delay/ZamDelay.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}zam-delay/ZamDelay.worklet.js`);
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
  set time(v: number) { this._time = clamp(v, 10, 2000); this.sendParam('time', this._time); }

  get feedbackAmount(): number { return this._feedback; }
  set feedbackAmount(v: number) { this._feedback = clamp(v, 0, 0.95); this.sendParam('feedback', this._feedback); }

  get lpf(): number { return this._lpf; }
  set lpf(v: number) { this._lpf = clamp(v, 500, 16000); this.sendParam('lpf', this._lpf); }

  get hpf(): number { return this._hpf; }
  set hpf(v: number) { this._hpf = clamp(v, 20, 500); this.sendParam('hpf', this._hpf); }

  get invertPhase(): number { return this._invert; }
  set invertPhase(v: number) { this._invert = v >= 0.5 ? 1 : 0; this.sendParam('invert', this._invert); }

  get mixAmount(): number { return this._mix; }
  set mixAmount(v: number) { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'time': this.time = value; break;
      case 'feedback': this.feedbackAmount = value; break;
      case 'lpf': this.lpf = value; break;
      case 'hpf': this.hpf = value; break;
      case 'invert': this.invertPhase = value; break;
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
    this.dryGain.dispose(); this.wetGain.dispose(); this.input.dispose(); this.output.dispose();
    super.dispose(); return this;
  }
}
