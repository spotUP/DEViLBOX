/**
 * ResonanceTamerEffect — master-bus adaptive resonance suppressor.
 *
 * Drops on master. Detects frequency-domain resonances (bins that stick
 * out above their own long-time average) and dynamically attenuates them.
 * Soothe-style automatic "fighting frequencies" cleanup with one knob.
 *
 * Parameters:
 *   amount     0..1 — primary dial. 0 = passthrough; 1 = aggressive.
 *   character  0..1 — quantized to 3 modes: 0=Transparent, 0.5=Warm, 1=Bright.
 *   mix        0..1 — dry/wet mix.
 *
 * Pattern matches DattorroPlateEffect / DynamicEQEffect: passthrough until
 * WASM loads, then swaps the worklet into the signal path.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

// Param IDs must match ResonanceTamerEffect.cpp ResonanceTamerParam enum.
const PARAM_AMOUNT    = 0;
const PARAM_CHARACTER = 1;
const PARAM_MIX       = 2;

export type ResonanceTamerCharacter = 'transparent' | 'warm' | 'bright';

export interface ResonanceTamerOptions {
  amount?: number;     // 0..1
  character?: ResonanceTamerCharacter;
  mix?: number;        // 0..1
  wet?: number;        // 0..1 — overall dry/wet for the effect node
}

const CHARACTER_TO_FLOAT: Record<ResonanceTamerCharacter, number> = {
  transparent: 0.0,
  warm:        0.5,
  bright:      1.0,
};
const FLOAT_TO_CHARACTER = (v: number): ResonanceTamerCharacter => {
  if (v < 0.33) return 'transparent';
  if (v < 0.66) return 'warm';
  return 'bright';
};

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export class ResonanceTamerEffect extends Tone.ToneAudioNode {
  readonly name = 'ResonanceTamer';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  private _options: Required<ResonanceTamerOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: ResonanceTamerOptions = {}) {
    super();

    this._options = {
      amount:    options.amount    ?? 0.35,
      character: options.character ?? 'transparent',
      mix:       options.mix       ?? 1.0,
      wet:       options.wet       ?? 1.0,
    };

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);
    this.passthroughGain = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    // Passthrough while WASM loads — avoids a hard-silent effect during
    // the 200-500 ms first-load WASM fetch.
    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);

    void this._initWorklet();
  }

  setAmount(v: number):    void { this._options.amount    = clamp01(v); this.sendParam(PARAM_AMOUNT, this._options.amount); }
  setMix(v: number):       void { this._options.mix       = clamp01(v); this.sendParam(PARAM_MIX, this._options.mix); }
  setCharacter(c: ResonanceTamerCharacter): void {
    this._options.character = c;
    this.sendParam(PARAM_CHARACTER, CHARACTER_TO_FLOAT[c]);
  }

  get amount():    number { return this._options.amount; }
  get mix():       number { return this._options.mix; }
  get character(): ResonanceTamerCharacter { return this._options.character; }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    const v = clamp01(value);
    this._options.wet = v;
    this.wetGain.gain.value = v;
    this.dryGain.gain.value = 1 - v;
  }

  // Preset-apply + automation both route through `setParam`. `value` is
  // typed as number for numeric params, but `character` is a string enum
  // in preset JSON and in the store. Accept either form at runtime.
  setParam(param: string, value: number | string): void {
    switch (param) {
      case 'amount':
        this.setAmount(typeof value === 'number' ? value : Number(value));
        break;
      case 'mix':
        this.setMix(typeof value === 'number' ? value : Number(value));
        break;
      case 'character':
        if (value === 'transparent' || value === 'warm' || value === 'bright') {
          this.setCharacter(value);
        } else if (typeof value === 'number') {
          // Numeric path (MIDI automation): 0..1 → discrete enum.
          this.setCharacter(FLOAT_TO_CHARACTER(value));
        }
        break;
      case 'wet':
        this.wet = typeof value === 'number' ? value : Number(value);
        break;
    }
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await ResonanceTamerEffect.ensureInitialized(rawCtx);

      if (!ResonanceTamerEffect.wasmBinary || !ResonanceTamerEffect.jsCode) {
        console.error('[ResonanceTamer] WASM not available, staying on passthrough');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawCtx, 'resonance-tamer-processor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          // Push initial param values so the worklet starts with the config,
          // not just the C++ defaults.
          this.sendParam(PARAM_AMOUNT, this._options.amount);
          this.sendParam(PARAM_CHARACTER, CHARACTER_TO_FLOAT[this._options.character]);
          this.sendParam(PARAM_MIX, this._options.mix);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];

          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet   = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            this.passthroughGain.gain.value = 0;
            // Keepalive so Chrome keeps the worklet scheduled even if the
            // signal is quiet (same trick DattorroPlate uses).
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.error('[ResonanceTamer] WASM swap failed, staying on passthrough:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[ResonanceTamer] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: ResonanceTamerEffect.wasmBinary,
        jsCode:     ResonanceTamerEffect.jsCode,
      });

    } catch (err) {
      console.error('[ResonanceTamer] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}resonance-tamer/ResonanceTamer.wasm`),
        fetch(`${base}resonance-tamer/ResonanceTamer.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      // Strip UMD's node-specific `if (typeof exports === "object"…)` tail
      // so the factory resolves inside AudioWorkletGlobalScope.
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}resonance-tamer/ResonanceTamer.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  private sendParam(paramId: number, value: number): void {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', paramId, value });
    } else {
      this.pendingParams = this.pendingParams.filter(p => p.paramId !== paramId);
      this.pendingParams.push({ paramId, value });
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
      try { this.workletNode.disconnect(); } catch { /* */ }
      this.workletNode = null;
    }
    this.passthroughGain.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
