import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface ArtisticDelayOptions {
  timeL?: number;
  timeR?: number;
  feedback?: number;
  pan?: number;
  lpf?: number;
  hpf?: number;
  mix?: number;
  wet?: number;
}

export class ArtisticDelayEffect extends Tone.ToneAudioNode {
  readonly name = 'ArtisticDelay';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];
  private _timeL: number;
  private _timeR: number;
  private _feedback: number;
  private _pan: number;
  private _lpf: number;
  private _hpf: number;
  private _mix: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: ArtisticDelayOptions = {}) {
    super();
    this._timeL = options.timeL ?? 500;
    this._timeR = options.timeR ?? 375;
    this._feedback = options.feedback ?? 0.4;
    this._pan = options.pan ?? 0.5;
    this._lpf = options.lpf ?? 12000;
    this._hpf = options.hpf ?? 40;
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
      await ArtisticDelayEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'artistic-delay-processor', {
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
            console.warn('[ArtisticDelay] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: ArtisticDelayEffect.wasmBinary!, jsCode: ArtisticDelayEffect.jsCode! },
        [ArtisticDelayEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('timeL', this._timeL);
      this.sendParam('timeR', this._timeR);
      this.sendParam('feedback', this._feedback);
      this.sendParam('pan', this._pan);
      this.sendParam('lpf', this._lpf);
      this.sendParam('hpf', this._hpf);
      this.sendParam('mix', this._mix);
    } catch (err) { console.warn('[ArtisticDelay] Worklet init failed:', err); }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}artistic-delay/ArtisticDelay.wasm`),
        fetch(`${base}artistic-delay/ArtisticDelay.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}artistic-delay/ArtisticDelay.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  private sendParam(param: string, value: number): void {
    if (this.workletNode && this.isWasmReady) this.workletNode.port.postMessage({ type: 'parameter', param, value });
    else { this.pendingParams = this.pendingParams.filter(p => p.param !== param); this.pendingParams.push({ param, value }); }
  }

  get timeL(): number { return this._timeL; }
  set timeL(v: number) { this._timeL = clamp(v, 10, 2000); this.sendParam('timeL', this._timeL); }

  get timeR(): number { return this._timeR; }
  set timeR(v: number) { this._timeR = clamp(v, 10, 2000); this.sendParam('timeR', this._timeR); }

  get feedbackAmount(): number { return this._feedback; }
  set feedbackAmount(v: number) { this._feedback = clamp(v, 0, 0.95); this.sendParam('feedback', this._feedback); }

  get pan(): number { return this._pan; }
  set pan(v: number) { this._pan = clamp(v, 0, 1); this.sendParam('pan', this._pan); }

  get lpf(): number { return this._lpf; }
  set lpf(v: number) { this._lpf = clamp(v, 200, 20000); this.sendParam('lpf', this._lpf); }

  get hpf(): number { return this._hpf; }
  set hpf(v: number) { this._hpf = clamp(v, 20, 2000); this.sendParam('hpf', this._hpf); }

  get mixAmount(): number { return this._mix; }
  set mixAmount(v: number) { this._mix = clamp(v, 0, 1); this.sendParam('mix', this._mix); }

  get wet(): number { return this._wet; }
  set wet(value: number) { this._wet = clamp(value, 0, 1); this.wetGain.gain.value = this._wet; this.dryGain.gain.value = 1 - this._wet; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'timeL': this.timeL = value; break;
      case 'timeR': this.timeR = value; break;
      case 'feedback': this.feedbackAmount = value; break;
      case 'pan': this.pan = value; break;
      case 'lpf': this.lpf = value; break;
      case 'hpf': this.hpf = value; break;
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
