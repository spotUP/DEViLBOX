import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

/**
 * Moog ladder filter model types
 */
export const MoogFilterModel = {
  Hyperion: 0,      // ZDF/TPT + ADAA, multi-mode (best quality)
  Krajeski: 1,      // Enhanced Stilson with drive/saturation
  Stilson: 2,       // Classic cascade, fast
  Microtracker: 3,  // Minimal, clean (cheapest CPU)
  Improved: 4,      // Circuit-accurate (D'Angelo/Valimaki), self-oscillation
  Oberheim: 5,      // VA one-pole cascade
} as const;
export type MoogFilterModel = (typeof MoogFilterModel)[keyof typeof MoogFilterModel];

/**
 * Hyperion filter modes (only applicable when model=Hyperion)
 */
export const MoogFilterMode = {
  LP2: 0,
  LP4: 1,
  BP2: 2,
  BP4: 3,
  HP2: 4,
  HP4: 5,
  NOTCH: 6,
} as const;
export type MoogFilterMode = (typeof MoogFilterMode)[keyof typeof MoogFilterMode];

// WASM parameter IDs (must match MoogFiltersEffect.cpp)
const PARAM_MODEL = 0;
const PARAM_CUTOFF = 1;
const PARAM_RESONANCE = 2;
const PARAM_DRIVE = 3;
const PARAM_FILTER_MODE = 4;
const PARAM_WET = 5;

export interface MoogFilterOptions {
  cutoff?: number;      // 20-20000 Hz
  resonance?: number;   // 0-1
  drive?: number;       // 0.1-4.0
  model?: MoogFilterModel;
  filterMode?: MoogFilterMode;  // Hyperion only
  wet?: number;         // 0-1
}

/**
 * MoogFilterEffect — WASM-powered analog Moog ladder filter via AudioWorklet.
 *
 * Wraps 6 MoogLadders filter implementations via AudioWorklet+WASM.
 * Passthrough until WASM is ready, then hot-swaps to the worklet.
 */
export class MoogFilterEffect extends Tone.ToneAudioNode {
  readonly name = 'MoogFilter';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Internal routing
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // WASM worklet
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  // State
  private _options: Required<MoogFilterOptions>;

  // Static WASM loading state (shared across instances)
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<MoogFilterOptions> = {}) {
    super();

    this._options = {
      cutoff: options.cutoff ?? 1000,
      resonance: options.resonance ?? 0.1,
      drive: options.drive ?? 1.0,
      model: options.model ?? MoogFilterModel.Hyperion,
      filterMode: options.filterMode ?? MoogFilterMode.LP4,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Dry/wet mixing
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Dry path: input → dryGain → output (Tone.js connections)
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path output: wetGain → output
    this.wetGain.connect(this.output);

    // Passthrough until WASM loads, then hot-swap to worklet
    this.input.connect(this.wetGain);
    void this._initWorklet();
  }

  // --- Parameter setters ---

  setCutoff(hz: number) {
    this._options.cutoff = Math.max(20, Math.min(20000, hz));
    this.sendParam(PARAM_CUTOFF, this._options.cutoff);
  }

  setResonance(r: number) {
    this._options.resonance = Math.max(0, Math.min(1, r));
    this.sendParam(PARAM_RESONANCE, this._options.resonance);
  }

  setDrive(d: number) {
    this._options.drive = Math.max(0.1, Math.min(4, d));
    this.sendParam(PARAM_DRIVE, this._options.drive);
  }

  setModel(model: MoogFilterModel) {
    this._options.model = model;
    this.sendParam(PARAM_MODEL, model);
  }

  setFilterMode(mode: MoogFilterMode) {
    this._options.filterMode = mode;
    this.sendParam(PARAM_FILTER_MODE, mode);
  }

  get wet(): number {
    return this._options.wet;
  }

  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'cutoff': this.setCutoff(value); break;
      case 'resonance': this.setResonance(value); break;
      case 'drive': this.setDrive(value); break;
      case 'model': this.setModel(value as any); break;
      case 'filterMode': this.setFilterMode(value as any); break;
      case 'wet': this.wet = value; break;
    }
  }

  // --- WASM initialization ---

  private async _initWorklet(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await MoogFilterEffect.ensureInitialized(rawContext);

      if (!MoogFilterEffect.wasmBinary || !MoogFilterEffect.jsCode) {
        console.error('[MoogFilter] WASM not available, staying on passthrough');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'moogfilters-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          this.sendParam(PARAM_MODEL, this._options.model);
          this.sendParam(PARAM_CUTOFF, this._options.cutoff);
          this.sendParam(PARAM_RESONANCE, this._options.resonance);
          this.sendParam(PARAM_DRIVE, this._options.drive);
          this.sendParam(PARAM_FILTER_MODE, this._options.filterMode);
          // WASM always runs at 100% wet; dry/wet handled by TS gain nodes
          this.sendParam(PARAM_WET, 1.0);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
          // Hot-swap from passthrough to WASM worklet
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            try { rawInput.disconnect(rawWet); } catch { /* */ }
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.error('[MoogFilter] WASM swap failed, staying on passthrough:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[MoogFilter] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: MoogFilterEffect.wasmBinary,
        jsCode: MoogFilterEffect.jsCode,
      });

    } catch (err) {
      console.error('[MoogFilter] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}moogfilters/MoogFilters.wasm`), fetch(`${base}moogfilters/MoogFilters.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}moogfilters/MoogFilters.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  // --- Helper ---

  private sendParam(paramId: number, value: number) {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', paramId, value });
    } else {
      // Queue param until WASM is ready; last write wins for each paramId
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

    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();

    super.dispose();
    return this;
  }
}
