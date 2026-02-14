import * as Tone from 'tone';

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
 * MoogFilterEffect - WASM-powered analog Moog ladder filter with JS fallback
 *
 * Wraps 6 MoogLadders filter implementations via AudioWorklet+WASM.
 * Falls back to a pure-JS Krajeski implementation if WASM fails to load.
 * Extends Tone.ToneAudioNode for direct integration with existing effect chains.
 */
/** Extract the underlying native GainNode from a Tone.js Gain wrapper */
function getRawGainNode(node: Tone.Gain): GainNode {
  const n = node as unknown as Record<string, GainNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as GainNode);
}

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

  // JS fallback (ScriptProcessor)
  private fallbackNode: ScriptProcessorNode | null = null;
  private fallbackFilter: KrajeskiFallback | null = null;
  private usingFallback = false;

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

    // Wet path output: wetGain → output (Tone.js connection)
    // The processor (fallback/worklet) inserts between input and wetGain via raw Web Audio.
    // This Tone.js connection ensures the wet path is part of the graph that Tone.js knows about.
    this.wetGain.connect(this.output);

    console.warn('[MoogFilter] Created, wet:', this._options.wet, 'cutoff:', this._options.cutoff);

    // Start WASM loading, use JS fallback immediately
    this.initFallback();
    this.initWasm();
  }

  // --- Parameter setters ---

  setCutoff(hz: number) {
    this._options.cutoff = Math.max(20, Math.min(20000, hz));
    this.sendParam(PARAM_CUTOFF, this._options.cutoff);
    if (this.fallbackFilter) this.fallbackFilter.setCutoff(this._options.cutoff);
  }

  setResonance(r: number) {
    this._options.resonance = Math.max(0, Math.min(1, r));
    this.sendParam(PARAM_RESONANCE, this._options.resonance);
    if (this.fallbackFilter) this.fallbackFilter.setResonance(this._options.resonance);
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
    // Dry/wet mixing is handled entirely by the TS gain nodes.
    // WASM always runs at 100% wet to avoid double-mixing.
  }

  // --- WASM initialization ---

  private async initWasm() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await MoogFilterEffect.ensureInitialized(rawContext);

      if (!MoogFilterEffect.wasmBinary || !MoogFilterEffect.jsCode) {
        console.warn('[MoogFilter] WASM not available, using JS fallback');
        return;
      }

      // Create AudioWorkletNode
      this.workletNode = new AudioWorkletNode(rawContext, 'moogfilters-processor');

      // Listen for ready signal
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          console.warn('[MoogFilter] WASM ready! Swapping from fallback...');
          this.isWasmReady = true;
          // Send all current parameters
          this.sendParam(PARAM_MODEL, this._options.model);
          this.sendParam(PARAM_CUTOFF, this._options.cutoff);
          this.sendParam(PARAM_RESONANCE, this._options.resonance);
          this.sendParam(PARAM_DRIVE, this._options.drive);
          this.sendParam(PARAM_FILTER_MODE, this._options.filterMode);
          // WASM always runs at 100% wet; dry/wet handled by TS gain nodes
          this.sendParam(PARAM_WET, 1.0);
          // Hot-swap from fallback to WASM
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[MoogFilter] WASM worklet error:', event.data.error);
        }
      };

      // Send init message with WASM binary
      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: MoogFilterEffect.wasmBinary,
        jsCode: MoogFilterEffect.jsCode,
      });

    } catch (err) {
      console.warn('[MoogFilter] WASM init failed, using JS fallback:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Register worklet processor
      try {
        await context.audioWorklet.addModule(`${baseUrl}moogfilters/MoogFilters.worklet.js`);
      } catch {
        // May already be registered
      }

      // Fetch WASM binary and JS glue code
      if (!this.wasmBinary || !this.jsCode) {
        try {
          const [wasmResponse, jsResponse] = await Promise.all([
            fetch(`${baseUrl}moogfilters/MoogFilters.wasm`),
            fetch(`${baseUrl}moogfilters/MoogFilters.js`),
          ]);

          if (wasmResponse.ok) {
            this.wasmBinary = await wasmResponse.arrayBuffer();
          }
          if (jsResponse.ok) {
            let code = await jsResponse.text();
            // Transform Emscripten ES module for AudioWorklet scope
            code = code
              .replace(/import\.meta\.url/g, "'.'")
              .replace(/export\s+default\s+\w+;?\s*$/m, '')
              .replace(
                /if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g,
                ''
              )
              .replace(
                /var\s+wasmBinary;/,
                'var wasmBinary = Module["wasmBinary"];'
              )
              .replace(
                /(wasmMemory=wasmExports\["\w+"\])/,
                '$1;Module["wasmMemory"]=wasmMemory'
              );
            // Inject shim for AudioWorklet scope (has globalThis but no `self`)
            code = 'var self = globalThis;\n' + code;
            this.jsCode = code;
          }
        } catch (fetchErr) {
          console.warn('[MoogFilter] Failed to fetch WASM files:', fetchErr);
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  // --- JS Fallback (Krajeski algorithm) ---

  private initFallback() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      // Use ScriptProcessorNode for immediate fallback
      // (deprecated but universally supported and simple)
      this.fallbackNode = rawContext.createScriptProcessor(256, 2, 2);
      this.fallbackFilter = new KrajeskiFallback(rawContext.sampleRate);
      this.fallbackFilter.setCutoff(this._options.cutoff);
      this.fallbackFilter.setResonance(this._options.resonance);

      let fallbackFrameCount = 0;
      this.fallbackNode.onaudioprocess = (e) => {
        const inL = e.inputBuffer.getChannelData(0);
        const inR = e.inputBuffer.getChannelData(1);
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        this.fallbackFilter!.process(inL, inR, outL, outR);

        // DIAGNOSTIC: Log fallback audio levels — frequent initially, then sparse
        fallbackFrameCount++;
        const shouldLog = fallbackFrameCount <= 200
          ? (fallbackFrameCount % 50 === 1)   // Every ~0.3sec for first ~1.2sec
          : (fallbackFrameCount % 2000 === 1); // Every ~12sec after
        if (shouldLog) {
          let maxIn = 0, maxOut = 0;
          for (let i = 0; i < inL.length; i++) {
            maxIn = Math.max(maxIn, Math.abs(inL[i]));
            maxOut = Math.max(maxOut, Math.abs(outL[i]));
          }
          console.warn('[MoogFilter] Fallback frame:', fallbackFrameCount,
            'inPeak:', maxIn.toFixed(6), 'outPeak:', maxOut.toFixed(6));
        }
      };

      // Connect fallback: input._gainNode → fallbackNode → wetGain._gainNode
      // (wetGain → output is already connected via Tone.js in the constructor)
      const rawInput = getRawGainNode(this.input);
      const rawWet = getRawGainNode(this.wetGain);

      rawInput.connect(this.fallbackNode);
      this.fallbackNode.connect(rawWet);

      // Keepalive: ensure the ScriptProcessorNode is always processed by the audio engine.
      // Connect it (with zero gain) to the destination so Chrome doesn't skip processing.
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.fallbackNode.connect(keepalive);
      keepalive.connect(rawContext.destination);

      this.usingFallback = true;
      console.warn('[MoogFilter] Fallback connected with keepalive');
    } catch (err) {
      console.warn('[MoogFilter] Fallback init failed:', err);
      // Last resort: direct passthrough (input → wetGain → output already connected)
      this.input.connect(this.wetGain);
    }
  }

  private swapToWasm() {
    if (!this.workletNode) return;

    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      // Connect WASM worklet FIRST, then disconnect fallback (avoids silent gap)
      // Route: input._gainNode → workletNode → wetGain._gainNode
      // (wetGain → output is already connected via Tone.js in the constructor)
      const rawInput = getRawGainNode(this.input);
      const rawWet = getRawGainNode(this.wetGain);

      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Now safe to disconnect fallback
      if (this.fallbackNode && this.usingFallback) {
        try { this.fallbackNode.disconnect(); } catch { /* ignored */ }
        this.fallbackNode.onaudioprocess = null;
        this.usingFallback = false;
      }

      // Keepalive: ensure the AudioWorkletNode is always processed
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);

      console.warn('[MoogFilter] WASM swap complete with keepalive');

    } catch (err) {
      console.warn('[MoogFilter] WASM swap failed, staying on fallback:', err);
    }
  }

  // --- Helper ---

  private sendParam(paramId: number, value: number) {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({
        type: 'parameter',
        paramId,
        value,
      });
    }
  }

  dispose(): this {
    // Clean up WASM worklet
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      try { this.workletNode.disconnect(); } catch { /* ignored */ }
      this.workletNode = null;
    }

    // Clean up fallback
    if (this.fallbackNode) {
      this.fallbackNode.onaudioprocess = null;
      try { this.fallbackNode.disconnect(); } catch { /* ignored */ }
      this.fallbackNode = null;
    }

    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();

    super.dispose();
    return this;
  }
}

/**
 * Pure-JS Krajeski Moog filter implementation for instant fallback.
 * Port of KrajeskiModel.h — enhanced Stilson with drive/saturation.
 */
class KrajeskiFallback {
  private sampleRate: number;

  // Per-channel state (L and R)
  private stateL = new Float64Array(5);
  private delayL = new Float64Array(5);
  private stateR = new Float64Array(5);
  private delayR = new Float64Array(5);

  private wc = 0;
  private g = 0;
  private gRes = 0;
  private gComp = 1.0;
  private drive = 1.0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.setCutoff(1000);
    this.setResonance(0.1);
  }

  setCutoff(c: number) {
    this.wc = (2 * Math.PI * c) / this.sampleRate;
    this.g =
      0.9892 * this.wc -
      0.4342 * this.wc ** 2 +
      0.1381 * this.wc ** 3 -
      0.0202 * this.wc ** 4;
    // Recalculate resonance compensation with new wc
    this.updateResonance();
  }

  setResonance(r: number) {
    this._resonance = r;
    this.updateResonance();
  }

  private _resonance = 0.1;

  private updateResonance() {
    this.gRes =
      this._resonance *
      (1.0029 +
        0.0526 * this.wc -
        0.926 * this.wc ** 2 +
        0.0218 * this.wc ** 3);
  }

  process(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array
  ) {
    const n = inL.length;
    const { stateL, delayL, stateR, delayR, g, gRes, gComp, drive } = this;

    for (let s = 0; s < n; s++) {
      // Left channel
      stateL[0] = Math.tanh(
        drive * (inL[s] - 4 * gRes * (stateL[4] - gComp * inL[s]))
      );
      for (let i = 0; i < 4; i++) {
        stateL[i + 1] = clampF(
          g * ((0.3 / 1.3) * stateL[i] + (1 / 1.3) * delayL[i] - stateL[i + 1]) +
            stateL[i + 1]
        );
        delayL[i] = stateL[i];
      }
      outL[s] = stateL[4];

      // Right channel
      stateR[0] = Math.tanh(
        drive * (inR[s] - 4 * gRes * (stateR[4] - gComp * inR[s]))
      );
      for (let i = 0; i < 4; i++) {
        stateR[i + 1] = clampF(
          g * ((0.3 / 1.3) * stateR[i] + (1 / 1.3) * delayR[i] - stateR[i + 1]) +
            stateR[i + 1]
        );
        delayR[i] = stateR[i];
      }
      outR[s] = stateR[4];
    }
  }
}

function clampF(x: number): number {
  return Math.min(Math.max(x, -1e30), 1e30);
}
