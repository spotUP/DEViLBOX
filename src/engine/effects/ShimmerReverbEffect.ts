import * as Tone from 'tone';

// WASM parameter IDs (must match ShimmerReverbEffect.cpp)
const PARAM_DECAY     = 0;
const PARAM_SHIMMER   = 1;
const PARAM_PITCH     = 2;
const PARAM_DAMPING   = 3;
const PARAM_SIZE      = 4;
const PARAM_PREDELAY  = 5;
const PARAM_MOD_RATE  = 6;
const PARAM_MOD_DEPTH = 7;
const PARAM_MIX       = 8;

export interface ShimmerReverbOptions {
  decay?: number;     // 0-1
  shimmer?: number;   // 0-1
  pitch?: number;     // -24 to +24 semitones
  damping?: number;   // 0-1
  size?: number;      // 0-1
  predelay?: number;  // 0-0.5 seconds
  modRate?: number;   // 0-1
  modDepth?: number;  // 0-1
  wet?: number;       // 0-1
}

/**
 * ShimmerReverbEffect - WASM-powered shimmer reverb with JS Schroeder fallback
 *
 * Wraps a pitch-shifting shimmer reverb via AudioWorklet+WASM.
 * Falls back to a simple Schroeder reverb if WASM fails to load.
 */
/** Extract the underlying native AudioNode from a Tone.js wrapper */
function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

export class ShimmerReverbEffect extends Tone.ToneAudioNode {
  readonly name = 'ShimmerReverb';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  private fallbackNode: ScriptProcessorNode | null = null;
  private fallbackReverb: SchroederFallback | null = null;
  private usingFallback = false;

  private _options: Required<ShimmerReverbOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<ShimmerReverbOptions> = {}) {
    super();

    this._options = {
      decay: options.decay ?? 0.7,
      shimmer: options.shimmer ?? 0.5,
      pitch: options.pitch ?? 12,
      damping: options.damping ?? 0.5,
      size: options.size ?? 0.8,
      predelay: options.predelay ?? 0.0,
      modRate: options.modRate ?? 0.3,
      modDepth: options.modDepth ?? 0.3,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.initFallback();
    this.initWasm();
  }

  setDecay(v: number) { this._options.decay = clamp01(v); this.sendParam(PARAM_DECAY, v); }
  setShimmer(v: number) { this._options.shimmer = clamp01(v); this.sendParam(PARAM_SHIMMER, v); }
  setPitch(v: number) { this._options.pitch = clamp(v, -24, 24); this.sendParam(PARAM_PITCH, v); }
  setDamping(v: number) { this._options.damping = clamp01(v); this.sendParam(PARAM_DAMPING, v); }
  setSize(v: number) { this._options.size = clamp01(v); this.sendParam(PARAM_SIZE, v); }
  setPredelay(v: number) { this._options.predelay = clamp(v, 0, 0.5); this.sendParam(PARAM_PREDELAY, v); }
  setModRate(v: number) { this._options.modRate = clamp01(v); this.sendParam(PARAM_MOD_RATE, v); }
  setModDepth(v: number) { this._options.modDepth = clamp01(v); this.sendParam(PARAM_MOD_DEPTH, v); }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  private async initWasm() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await ShimmerReverbEffect.ensureInitialized(rawContext);

      if (!ShimmerReverbEffect.wasmBinary || !ShimmerReverbEffect.jsCode) {
        console.warn('[ShimmerReverb] WASM not available, using JS fallback');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'shimmer-reverb-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          // Send initial params from _options (always up-to-date via setters)
          this.sendParam(PARAM_DECAY, this._options.decay);
          this.sendParam(PARAM_SHIMMER, this._options.shimmer);
          this.sendParam(PARAM_PITCH, this._options.pitch);
          this.sendParam(PARAM_DAMPING, this._options.damping);
          this.sendParam(PARAM_SIZE, this._options.size);
          this.sendParam(PARAM_PREDELAY, this._options.predelay);
          this.sendParam(PARAM_MOD_RATE, this._options.modRate);
          this.sendParam(PARAM_MOD_DEPTH, this._options.modDepth);
          this.sendParam(PARAM_MIX, 1.0); // WASM always 100% wet
          // Flush any params queued before WASM was ready (overrides _options with latest user values)
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[ShimmerReverb] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: ShimmerReverbEffect.wasmBinary,
        jsCode: ShimmerReverbEffect.jsCode,
      });

    } catch (err) {
      console.warn('[ShimmerReverb] WASM init failed, using JS fallback:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}shimmer-reverb/ShimmerReverb.worklet.js`);
      } catch {
        // May already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        try {
          const [wasmResponse, jsResponse] = await Promise.all([
            fetch(`${baseUrl}shimmer-reverb/ShimmerReverb.wasm`),
            fetch(`${baseUrl}shimmer-reverb/ShimmerReverb.js`),
          ]);

          if (wasmResponse.ok) {
            this.wasmBinary = await wasmResponse.arrayBuffer();
          }
          if (jsResponse.ok) {
            let code = await jsResponse.text();
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
          console.warn('[ShimmerReverb] Failed to fetch WASM files:', fetchErr);
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private initFallback() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      this.fallbackNode = rawContext.createScriptProcessor(256, 2, 2);
      this.fallbackReverb = new SchroederFallback(rawContext.sampleRate);

      this.fallbackNode.onaudioprocess = (e) => {
        const inL = e.inputBuffer.getChannelData(0);
        const inR = e.inputBuffer.getChannelData(1);
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        this.fallbackReverb!.process(inL, inR, outL, outR);
      };

      const rawInput = getRawNode(this.input);
      const rawWet = getRawNode(this.wetGain);

      rawInput.connect(this.fallbackNode);
      this.fallbackNode.connect(rawWet);
      // wetGain -> output already connected via Tone.js in constructor

      // Keepalive: ensure ScriptProcessorNode is processed
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.fallbackNode.connect(keepalive);
      keepalive.connect(rawContext.destination);

      this.usingFallback = true;
    } catch (err) {
      console.warn('[ShimmerReverb] Fallback init failed:', err);
      this.input.connect(this.wetGain);
    }
  }

  private swapToWasm() {
    if (!this.workletNode) return;

    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      // Connect WASM first, then disconnect fallback (avoids silent gap)
      const rawInput = getRawNode(this.input);
      const rawWet = getRawNode(this.wetGain);

      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);
      // wetGain -> output already connected via Tone.js in constructor

      // Now safe to disconnect fallback
      if (this.fallbackNode && this.usingFallback) {
        try { this.fallbackNode.disconnect(); } catch { /* ignored */ }
        this.fallbackNode.onaudioprocess = null;
        this.usingFallback = false;
      }

      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);

    } catch (err) {
      console.warn('[ShimmerReverb] WASM swap failed, staying on fallback:', err);
    }
  }

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
      this.workletNode.port.postMessage({ type: 'dispose' });
      try { this.workletNode.disconnect(); } catch { /* ignored */ }
      this.workletNode = null;
    }
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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Simple Schroeder reverb fallback (4 parallel comb filters + 2 allpass in series)
 */
class SchroederFallback {
  private combs: CombFilter[];
  private allpasses: AllpassFilter[];

  constructor(sampleRate: number) {
    const sr = sampleRate / 44100;
    this.combs = [
      new CombFilter(Math.round(1116 * sr), 0.84),
      new CombFilter(Math.round(1188 * sr), 0.84),
      new CombFilter(Math.round(1277 * sr), 0.84),
      new CombFilter(Math.round(1356 * sr), 0.84),
    ];
    this.allpasses = [
      new AllpassFilter(Math.round(556 * sr), 0.5),
      new AllpassFilter(Math.round(441 * sr), 0.5),
    ];
  }

  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array) {
    const n = inL.length;
    for (let i = 0; i < n; i++) {
      const mono = (inL[i] + inR[i]) * 0.5;
      let sum = 0;
      for (const comb of this.combs) {
        sum += comb.process(mono);
      }
      sum *= 0.25;
      for (const ap of this.allpasses) {
        sum = ap.process(sum);
      }
      outL[i] = sum;
      outR[i] = sum;
    }
  }
}

class CombFilter {
  private buffer: Float32Array;
  private index = 0;
  private feedback: number;

  constructor(size: number, feedback: number) {
    this.buffer = new Float32Array(size);
    this.feedback = feedback;
  }

  process(input: number): number {
    const out = this.buffer[this.index];
    this.buffer[this.index] = input + out * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return out;
  }
}

class AllpassFilter {
  private buffer: Float32Array;
  private index = 0;
  private feedback: number;

  constructor(size: number, feedback: number) {
    this.buffer = new Float32Array(size);
    this.feedback = feedback;
  }

  process(input: number): number {
    const buffered = this.buffer[this.index];
    const out = -input + buffered;
    this.buffer[this.index] = input + buffered * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return out;
  }
}
