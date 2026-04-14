// src/engine/effects/NoiseGateEffect.ts
/**
 * NoiseGateEffect — Envelope-following noise gate via WASM AudioWorklet.
 *
 * Parameters:
 *   threshold  -80..0 dB   Gate opens above this level
 *   attack     0.01..100ms Attack time for gate opening
 *   hold       0..2000ms   Hold time before gate closes
 *   release    1..5000ms   Release time for gate closing
 *   range      0..1        Closed-gate attenuation (0=full silence, 1=none)
 *   hpf        0..2000Hz   Sidechain high-pass filter (0=off)
 *
 * Signal path:
 *   input → [worklet → wetGain] → output
 *          ↘ [dryGain]         ↗
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface NoiseGateOptions {
  threshold?: number;
  attack?: number;
  hold?: number;
  release?: number;
  range?: number;
  hpf?: number;
  wet?: number;
}

export class NoiseGateEffect extends Tone.ToneAudioNode {
  readonly name = 'NoiseGate';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ param: string; value: number }> = [];

  private _threshold: number;
  private _attack: number;
  private _hold: number;
  private _release: number;
  private _range: number;
  private _hpf: number;
  private _wet: number;

  // Static WASM module cache
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: NoiseGateOptions = {}) {
    super();

    this._threshold = options.threshold ?? -40;
    this._attack    = options.attack    ?? 0.5;
    this._hold      = options.hold      ?? 50;
    this._release   = options.release   ?? 100;
    this._range     = options.range     ?? 0;
    this._hpf       = options.hpf       ?? 0;
    this._wet       = options.wet       ?? 1.0;

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._wet);
    this.wetGain = new Tone.Gain(this._wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    // Start with passthrough until WASM is ready
    this.input.connect(this.wetGain);

    void this._initWorklet();
  }

  // ─── Worklet initialization ─────────────────────────────────────────────────

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await NoiseGateEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'noise-gate-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.isWasmReady = true;
          // Flush queued params
          for (const p of this.pendingParams) {
            this.workletNode!.port.postMessage({ type: 'parameter', param: p.param, value: p.value });
          }
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
            console.warn('[NoiseGate] WASM swap failed, staying on passthrough:', swapErr);
          }
        }
      };

      // Send WASM binary + JS to worklet
      this.workletNode.port.postMessage(
        {
          type: 'init',
          wasmBinary: NoiseGateEffect.wasmBinary!,
          jsCode: NoiseGateEffect.jsCode!,
        },
        [NoiseGateEffect.wasmBinary!.slice(0)],
      );

      // Push current params
      this.sendParam('threshold', this._threshold);
      this.sendParam('attack', this._attack);
      this.sendParam('hold', this._hold);
      this.sendParam('release', this._release);
      this.sendParam('range', this._range);
      this.sendParam('hpf', this._hpf);

    } catch (err) {
      console.warn('[NoiseGate] Worklet init failed:', err);
      // Passthrough already connected as fallback
    }
  }

  // ─── Static initialization (once per AudioContext) ──────────────────────────

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}noise-gate/NoiseGate.wasm`),
        fetch(`${base}noise-gate/NoiseGate.js`),
      ]);

      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();

      // Strip Node.js / AMD wrapper that doesn't work in AudioWorklet scope
      js = js.replace(
        /if\s*\(typeof exports\s*===\s*"object".*$/s,
        '',
      );

      this.jsCode = js;

      await ctx.audioWorklet.addModule(`${base}noise-gate/NoiseGate.worklet.js`);
      this.loadedContexts.add(ctx);
    })();

    this.initPromises.set(ctx, p);
    return p;
  }

  // ─── Parameter messaging ────────────────────────────────────────────────────

  private sendParam(param: string, value: number): void {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', param, value });
    } else {
      // Last-write-wins per param
      this.pendingParams = this.pendingParams.filter(p => p.param !== param);
      this.pendingParams.push({ param, value });
    }
  }

  // ─── Parameter setters ──────────────────────────────────────────────────────

  setThreshold(v: number): void {
    this._threshold = clamp(v, -80, 0);
    this.sendParam('threshold', this._threshold);
  }

  setAttack(v: number): void {
    this._attack = clamp(v, 0.01, 100);
    this.sendParam('attack', this._attack);
  }

  setHold(v: number): void {
    this._hold = clamp(v, 0, 2000);
    this.sendParam('hold', this._hold);
  }

  setRelease(v: number): void {
    this._release = clamp(v, 1, 5000);
    this.sendParam('release', this._release);
  }

  setRange(v: number): void {
    this._range = clamp(v, 0, 1);
    this.sendParam('range', this._range);
  }

  setHpf(v: number): void {
    this._hpf = clamp(v, 0, 2000);
    this.sendParam('hpf', this._hpf);
  }

  // ─── Wet / dry ──────────────────────────────────────────────────────────────

  get wet(): number { return this._wet; }
  set wet(value: number) {
    this._wet = clamp(value, 0, 1);
    this.wetGain.gain.value = this._wet;
    this.dryGain.gain.value = 1 - this._wet;
  }

  // ─── Read-back accessors ────────────────────────────────────────────────────

  get threshold(): number { return this._threshold; }
  get attack(): number { return this._attack; }
  get hold(): number { return this._hold; }
  get release(): number { return this._release; }
  get range(): number { return this._range; }
  get hpf(): number { return this._hpf; }

  // ─── setParam (for registry/parameter engine) ───────────────────────────────

  setParam(param: string, value: number): void {
    switch (param) {
      case 'threshold': this.setThreshold(value); break;
      case 'attack':    this.setAttack(value);    break;
      case 'hold':      this.setHold(value);      break;
      case 'release':   this.setRelease(value);   break;
      case 'range':     this.setRange(value);     break;
      case 'hpf':       this.setHpf(value);       break;
      case 'wet':       this.wet = value;         break;
    }
  }

  // ─── Dispose ────────────────────────────────────────────────────────────────

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
