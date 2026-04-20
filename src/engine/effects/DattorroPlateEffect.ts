import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

/**
 * DattorroPlateEffect — WASM-powered Jon Dattorro 1997 plate reverb.
 *
 * Wraps el-visio/dattorro-verb (MIT, single-file C) via AudioWorklet + WASM.
 * Metallic, "infinite" character at high decay — closer to the Lexicon
 * PCM-70 / Mad Professor dub voicing than MVerb's softer plate.
 *
 * Uses passthrough until WASM is ready, then swaps in the worklet.
 * Mirrors MVerbEffect's init dance so async WASM load never clicks.
 */

// WASM parameter IDs (must match DattorroPlateEffect.cpp)
const PARAM_PREDELAY        = 0;
const PARAM_PREFILTER       = 1;
const PARAM_INPUT_DIFFUSION = 2;
const PARAM_DECAY_DIFFUSION = 3;
const PARAM_DECAY           = 4;
const PARAM_DAMPING         = 5;

export interface DattorroPlateOptions {
  predelay?: number;        // 0-1 (maps to 0..100 ms at 48 kHz)
  preFilter?: number;       // 0-1 (input LPF amount; higher = darker)
  inputDiffusion?: number;  // 0-1 (drives both input diffusion stages)
  decayDiffusion?: number;  // 0-1 (inside-tank diffusion, shapes density)
  decay?: number;           // 0-1 (tail length; 1.0 ≈ infinite)
  damping?: number;         // 0-1 (high-freq damping inside tank)
  wet?: number;             // 0-1 (dry/wet)
}

export class DattorroPlateEffect extends Tone.ToneAudioNode {
  readonly name = 'DattorroPlate';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  private _options: Required<DattorroPlateOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<DattorroPlateOptions> = {}) {
    super();

    this._options = {
      predelay:       options.predelay       ?? 0.15,
      preFilter:      options.preFilter      ?? 0.70,
      inputDiffusion: options.inputDiffusion ?? 0.75,
      decayDiffusion: options.decayDiffusion ?? 0.50,
      decay:          options.decay          ?? 0.85,
      damping:        options.damping        ?? 0.35,
      wet:            options.wet            ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);
    this.passthroughGain = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    // Passthrough until WASM swap lands — otherwise the effect is silent
    // while the worklet initializes (can be 200+ ms for a cold WASM fetch).
    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);

    void this._initWorklet();
  }

  setPredelay(v: number)       { this._options.predelay       = clamp01(v); this.sendParam(PARAM_PREDELAY, v); }
  setPreFilter(v: number)      { this._options.preFilter      = clamp01(v); this.sendParam(PARAM_PREFILTER, v); }
  setInputDiffusion(v: number) { this._options.inputDiffusion = clamp01(v); this.sendParam(PARAM_INPUT_DIFFUSION, v); }
  setDecayDiffusion(v: number) { this._options.decayDiffusion = clamp01(v); this.sendParam(PARAM_DECAY_DIFFUSION, v); }
  setDecay(v: number)          { this._options.decay          = clamp01(v); this.sendParam(PARAM_DECAY, v); }
  setDamping(v: number)        { this._options.damping        = clamp01(v); this.sendParam(PARAM_DAMPING, v); }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    const v = clamp01(value);
    this._options.wet = v;
    this.wetGain.gain.value = v;
    this.dryGain.gain.value = 1 - v;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'predelay':       this.setPredelay(value); break;
      case 'preFilter':      this.setPreFilter(value); break;
      case 'inputDiffusion': this.setInputDiffusion(value); break;
      case 'decayDiffusion': this.setDecayDiffusion(value); break;
      case 'decay':          this.setDecay(value); break;
      case 'damping':        this.setDamping(value); break;
      case 'wet':            this.wet = value; break;
    }
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await DattorroPlateEffect.ensureInitialized(rawCtx);

      if (!DattorroPlateEffect.wasmBinary || !DattorroPlateEffect.jsCode) {
        console.error('[DattorroPlate] WASM not available, staying on passthrough');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawCtx, 'dattorro-plate-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          this.sendParam(PARAM_PREDELAY,        this._options.predelay);
          this.sendParam(PARAM_PREFILTER,       this._options.preFilter);
          this.sendParam(PARAM_INPUT_DIFFUSION, this._options.inputDiffusion);
          this.sendParam(PARAM_DECAY_DIFFUSION, this._options.decayDiffusion);
          this.sendParam(PARAM_DECAY,           this._options.decay);
          this.sendParam(PARAM_DAMPING,         this._options.damping);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            this.passthroughGain.gain.value = 0;
            // Keepalive so the worklet's process() keeps being called even
            // when the dry/wet gains are 0 on either side.
            const keepalive = rawCtx.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx.destination);
          } catch (swapErr) {
            console.error('[DattorroPlate] WASM swap failed, staying on passthrough:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[DattorroPlate] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: DattorroPlateEffect.wasmBinary,
        jsCode: DattorroPlateEffect.jsCode,
      });

    } catch (err) {
      console.error('[DattorroPlate] Worklet init failed, staying on passthrough:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}dattorro-plate/DattorroPlate.wasm`),
        fetch(`${base}dattorro-plate/DattorroPlate.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      // Strip UMD's node-specific `if (typeof exports === "object"…)` tail —
      // AudioWorkletGlobalScope doesn't have `exports` and the regex eats it.
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}dattorro-plate/DattorroPlate.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  private sendParam(paramId: number, value: number) {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', paramId, value });
    } else {
      // Queue until WASM ready; last write wins per paramId
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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
