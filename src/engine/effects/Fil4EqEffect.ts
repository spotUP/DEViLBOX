// src/engine/effects/Fil4EqEffect.ts
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

export interface Fil4Params {
  hp:  { enabled: boolean; freq: number; q: number };
  lp:  { enabled: boolean; freq: number; q: number };
  ls:  { enabled: boolean; freq: number; gain: number; q: number };
  hs:  { enabled: boolean; freq: number; gain: number; q: number };
  p:   Array<{ enabled: boolean; freq: number; bw: number; gain: number }>;
  masterGain: number;
}

type ParamsListener = (params: Fil4Params) => void;

const DEFAULT_PARAMS: Fil4Params = {
  hp: { enabled: false, freq: 20, q: 0.7 },
  lp: { enabled: false, freq: 20000, q: 0.7 },
  ls: { enabled: false, freq: 80, gain: 0, q: 0.7 },
  hs: { enabled: false, freq: 8000, gain: 0, q: 0.7 },
  p: [
    { enabled: false, freq: 200,  bw: 1.0, gain: 0 },
    { enabled: false, freq: 500,  bw: 1.0, gain: 0 },
    { enabled: false, freq: 2000, bw: 1.0, gain: 0 },
    { enabled: false, freq: 8000, bw: 1.0, gain: 0 },
  ],
  masterGain: 1.0,
};

function deepClone(p: Fil4Params): Fil4Params {
  return {
    hp: { ...p.hp },
    lp: { ...p.lp },
    ls: { ...p.ls },
    hs: { ...p.hs },
    p: p.p.map(b => ({ ...b })),
    masterGain: p.masterGain,
  };
}

export class Fil4EqEffect extends Tone.ToneAudioNode {
  readonly name = 'Fil4EQ';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isReady = false;
  private pendingMessages: Array<Record<string, unknown>> = [];

  private params: Fil4Params = deepClone(DEFAULT_PARAMS);
  private listeners = new Set<ParamsListener>();

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor() {
    super();

    this.input            = new Tone.Gain(1);
    this.output           = new Tone.Gain(1);
    this.passthroughGain  = new Tone.Gain(1);

    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.output);

    void this._initWorklet();
  }

  // ── Static WASM init ──────────────────────────────────────────────────────

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}fil4/Fil4.wasm`),
        fetch(`${base}fil4/Fil4.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}fil4/Fil4.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  // ── Worklet init & hot-swap ───────────────────────────────────────────────

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await Fil4EqEffect.ensureInitialized(rawCtx);
      this.workletNode = new AudioWorkletNode(rawCtx, 'fil4-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.workletNode.port.onmessage = (ev: MessageEvent) => {
        const { type } = ev.data as { type: string };
        if (type === 'ready') {
          this.isReady = true;
          // Flush pending messages
          for (const msg of this.pendingMessages)
            this.workletNode!.port.postMessage(msg);
          this.pendingMessages = [];
          // Hot-swap: connect WASM first, then silence passthrough
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawOutput = getNativeAudioNode(this.output)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawOutput);
            this.passthroughGain.gain.value = 0;
            // Keepalive so Chrome keeps the worklet scheduled
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.warn('[Fil4EQ] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
        // magnitude_result is handled per-request inside getMagnitude()
      };
      this.workletNode.port.postMessage(
        { type: 'init', wasmBinary: Fil4EqEffect.wasmBinary!, jsCode: Fil4EqEffect.jsCode! },
        [Fil4EqEffect.wasmBinary!.slice(0)],
      );
      // Send current state so worklet initialises with our defaults
      this._sendAllParams();
    } catch (err) {
      console.warn('[Fil4EQ] Worklet init failed:', err);
    }
  }

  // ── Internal messaging ────────────────────────────────────────────────────

  private _send(msg: Record<string, unknown>): void {
    if (this.workletNode && this.isReady) {
      this.workletNode.port.postMessage(msg);
    } else {
      this.pendingMessages.push(msg);
    }
  }

  private _sendAllParams(): void {
    const { hp, lp, ls, hs, p, masterGain } = this.params;
    this._send({ type: 'set_hp',    enabled: hp.enabled, freq: hp.freq, q: hp.q });
    this._send({ type: 'set_lp',    enabled: lp.enabled, freq: lp.freq, q: lp.q });
    this._send({ type: 'set_shelf', which: 0, enabled: ls.enabled, freq: ls.freq, gain: ls.gain, q: ls.q });
    this._send({ type: 'set_shelf', which: 1, enabled: hs.enabled, freq: hs.freq, gain: hs.gain, q: hs.q });
    for (let i = 0; i < p.length; i++)
      this._send({ type: 'set_band', band: i, enabled: p[i].enabled, freq: p[i].freq, bw: p[i].bw, gain: p[i].gain });
    this._send({ type: 'set_gain', gain: masterGain });
  }

  private _notifyListeners(): void {
    const snapshot = deepClone(this.params);
    for (const fn of this.listeners) fn(snapshot);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setHP(enabled: boolean, freq: number, q: number): void {
    this.params.hp = { enabled, freq, q };
    this._send({ type: 'set_hp', enabled, freq, q });
    this._notifyListeners();
  }

  setLP(enabled: boolean, freq: number, q: number): void {
    this.params.lp = { enabled, freq, q };
    this._send({ type: 'set_lp', enabled, freq, q });
    this._notifyListeners();
  }

  setLowShelf(enabled: boolean, freq: number, gain: number, q: number): void {
    this.params.ls = { enabled, freq, gain, q };
    this._send({ type: 'set_shelf', which: 0, enabled, freq, gain, q });
    this._notifyListeners();
  }

  setHighShelf(enabled: boolean, freq: number, gain: number, q: number): void {
    this.params.hs = { enabled, freq, gain, q };
    this._send({ type: 'set_shelf', which: 1, enabled, freq, gain, q });
    this._notifyListeners();
  }

  setBand(band: number, enabled: boolean, freq: number, bw: number, gain: number): void {
    if (band < 0 || band >= this.params.p.length) return;
    this.params.p[band] = { enabled, freq, bw, gain };
    this._send({ type: 'set_band', band, enabled, freq, bw, gain });
    this._notifyListeners();
  }

  setMasterGain(gain: number): void {
    this.params.masterGain = gain;
    this._send({ type: 'set_gain', gain });
    this._notifyListeners();
  }

  getParams(): Fil4Params {
    return deepClone(this.params);
  }

  // ── Backwards-compat aliases for DubBus ──────────────────────────────────

  setB1Freq(v: number): void {
    const b = this.params.p[0];
    this.setBand(0, b.enabled, v, b.bw, b.gain);
  }
  setB1Gain(v: number): void {
    const b = this.params.p[0];
    this.setBand(0, v !== 0, b.freq, b.bw, v);
  }
  setB1Q(v: number): void {
    const b = this.params.p[0];
    this.setBand(0, b.enabled, b.freq, v, b.gain);
  }

  setB2Freq(v: number): void {
    const b = this.params.p[1];
    this.setBand(1, b.enabled, v, b.bw, b.gain);
  }
  setB2Gain(v: number): void {
    const b = this.params.p[1];
    this.setBand(1, v !== 0, b.freq, b.bw, v);
  }
  setB2Q(v: number): void {
    const b = this.params.p[1];
    this.setBand(1, b.enabled, b.freq, v, b.gain);
  }

  setB3Freq(v: number): void {
    const b = this.params.p[2];
    this.setBand(2, b.enabled, v, b.bw, b.gain);
  }
  setB3Gain(v: number): void {
    const b = this.params.p[2];
    this.setBand(2, v !== 0, b.freq, b.bw, v);
  }
  setB3Q(v: number): void {
    const b = this.params.p[2];
    this.setBand(2, b.enabled, b.freq, v, b.gain);
  }

  setB4Freq(v: number): void {
    const b = this.params.p[3];
    this.setBand(3, b.enabled, v, b.bw, b.gain);
  }
  setB4Gain(v: number): void {
    const b = this.params.p[3];
    this.setBand(3, v !== 0, b.freq, b.bw, v);
  }
  setB4Q(v: number): void {
    const b = this.params.p[3];
    this.setBand(3, b.enabled, b.freq, v, b.gain);
  }

  // ── getMagnitude ──────────────────────────────────────────────────────────

  getMagnitude(n = 512): Promise<Float32Array> {
    if (!this.workletNode || !this.isReady) {
      return Promise.resolve(new Float32Array(n));
    }
    const id = `mag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const freqs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      freqs[i] = 20 * Math.pow(20000 / 20, i / (n - 1));
    }
    return new Promise<Float32Array>((resolve) => {
      const handler = (e: MessageEvent) => {
        const data = e.data as { type: string; id: string; data: Float32Array };
        if (data.type === 'magnitude_result' && data.id === id) {
          this.workletNode!.port.removeEventListener('message', handler);
          resolve(data.data);
        }
      };
      this.workletNode!.port.addEventListener('message', handler);
      this.workletNode!.port.postMessage({ type: 'get_magnitude', id, freqs }, [freqs.buffer]);
    });
  }

  // ── Event emitter ─────────────────────────────────────────────────────────

  on(event: 'params', listener: ParamsListener): this {
    if (event === 'params') this.listeners.add(listener);
    return this;
  }

  off(event: 'params', listener: ParamsListener): this {
    if (event === 'params') this.listeners.delete(listener);
    return this;
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.listeners.clear();
    this.passthroughGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
