// src/engine/effects/TubeAmpEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface TubeAmpOptions {
  drive?: number;
  bass?: number;
  mid?: number;
  treble?: number;
  presence?: number;
  master?: number;
  sag?: number;
  wet?: number;
}

export class TubeAmpEffect extends Tone.ToneAudioNode {
  readonly name = 'TubeAmp';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _drive: number;
  private _bass: number;
  private _mid: number;
  private _treble: number;
  private _presence: number;
  private _master: number;
  private _sag: number;
  private _wet: number;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: TubeAmpOptions = {}) {
    super();
    this._drive = options.drive ?? 0.5;
    this._bass = options.bass ?? 0.5;
    this._mid = options.mid ?? 0.5;
    this._treble = options.treble ?? 0.5;
    this._presence = options.presence ?? 0.5;
    this._master = options.master ?? 0.5;
    this._sag = options.sag ?? 0.2;
    this._wet = options.wet ?? 1.0;

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
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
      await TubeAmpEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'tube-amp-processor', {
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
            console.warn('[TubeAmp] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: TubeAmpEffect.wasmBinary!, jsCode: TubeAmpEffect.jsCode! },
        [TubeAmpEffect.wasmBinary!.slice(0)],
      );
      this.sendParam('drive', this._drive);
      this.sendParam('bass', this._bass);
      this.sendParam('mid', this._mid);
      this.sendParam('treble', this._treble);
      this.sendParam('presence', this._presence);
      this.sendParam('master', this._master);
      this.sendParam('sag', this._sag);
    } catch (err) {
      console.warn('[TubeAmp] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}tube-amp/TubeAmp.wasm`), fetch(`${base}tube-amp/TubeAmp.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}tube-amp/TubeAmp.worklet.js`);
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

  setDrive(v: number): void { this._drive = clamp(v, 0, 1); this.sendParam('drive', this._drive); }
  setBass(v: number): void { this._bass = clamp(v, 0, 1); this.sendParam('bass', this._bass); }
  setMid(v: number): void { this._mid = clamp(v, 0, 1); this.sendParam('mid', this._mid); }
  setTreble(v: number): void { this._treble = clamp(v, 0, 1); this.sendParam('treble', this._treble); }
  setPresence(v: number): void { this._presence = clamp(v, 0, 1); this.sendParam('presence', this._presence); }
  setMaster(v: number): void { this._master = clamp(v, 0, 1); this.sendParam('master', this._master); }
  setSag(v: number): void { this._sag = clamp(v, 0, 1); this.sendParam('sag', this._sag); }

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  get drive(): number { return this._drive; }
  get bass(): number { return this._bass; }
  get mid(): number { return this._mid; }
  get treble(): number { return this._treble; }
  get presence(): number { return this._presence; }
  get master(): number { return this._master; }
  get sag(): number { return this._sag; }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'drive': this.setDrive(value); break;
      case 'bass': this.setBass(value); break;
      case 'mid': this.setMid(value); break;
      case 'treble': this.setTreble(value); break;
      case 'presence': this.setPresence(value); break;
      case 'master': this.setMaster(value); break;
      case 'sag': this.setSag(value); break;
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
