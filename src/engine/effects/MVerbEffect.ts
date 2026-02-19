import * as Tone from 'tone';

// WASM parameter IDs (must match MVerbEffect.cpp)
const PARAM_DAMPING = 0;
const PARAM_DENSITY = 1;
const PARAM_BANDWIDTH = 2;
const PARAM_DECAY = 3;
const PARAM_PREDELAY = 4;
const PARAM_SIZE = 5;
const PARAM_GAIN = 6;
const PARAM_MIX = 7;
const PARAM_EARLYMIX = 8;

export interface MVerbOptions {
  damping?: number;     // 0-1
  density?: number;     // 0-1
  bandwidth?: number;   // 0-1
  decay?: number;       // 0-1
  predelay?: number;    // 0-1
  size?: number;        // 0-1
  gain?: number;        // 0-1
  mix?: number;         // 0-1 (internal MVerb mix)
  earlyMix?: number;    // 0-1
  wet?: number;         // 0-1 (Tone.js dry/wet)
}

/**
 * MVerbEffect - WASM-powered plate reverb with JS Schroeder fallback
 *
 * Wraps Martin Eastwood's MVerb (GPL v3) via AudioWorklet+WASM.
 * Falls back to a simple Schroeder reverb if WASM fails to load.
 */
/** Extract the underlying native AudioNode from a Tone.js wrapper */
function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

export class MVerbEffect extends Tone.ToneAudioNode {
  readonly name = 'MVerb';

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

  private _options: Required<MVerbOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<MVerbOptions> = {}) {
    super();

    this._options = {
      damping: options.damping ?? 0.5,
      density: options.density ?? 0.5,
      bandwidth: options.bandwidth ?? 0.5,
      decay: options.decay ?? 0.7,
      predelay: options.predelay ?? 0.0,
      size: options.size ?? 0.8,
      gain: options.gain ?? 1.0,
      mix: options.mix ?? 0.4,
      earlyMix: options.earlyMix ?? 0.5,
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

  setDamping(v: number) { this._options.damping = clamp01(v); this.sendParam(PARAM_DAMPING, v); }
  setDensity(v: number) { this._options.density = clamp01(v); this.sendParam(PARAM_DENSITY, v); }
  setBandwidth(v: number) { this._options.bandwidth = clamp01(v); this.sendParam(PARAM_BANDWIDTH, v); }
  setDecay(v: number) { this._options.decay = clamp01(v); this.sendParam(PARAM_DECAY, v); }
  setPredelay(v: number) { this._options.predelay = clamp01(v); this.sendParam(PARAM_PREDELAY, v); }
  setSize(v: number) { this._options.size = clamp01(v); this.sendParam(PARAM_SIZE, v); }
  setGain(v: number) { this._options.gain = clamp01(v); this.sendParam(PARAM_GAIN, v); }
  setMix(v: number) { this._options.mix = clamp01(v); this.sendParam(PARAM_MIX, v); }
  setEarlyMix(v: number) { this._options.earlyMix = clamp01(v); this.sendParam(PARAM_EARLYMIX, v); }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  private async initWasm() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await MVerbEffect.ensureInitialized(rawContext);

      if (!MVerbEffect.wasmBinary || !MVerbEffect.jsCode) {
        console.warn('[MVerb] WASM not available, using JS fallback');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'mverb-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          this.sendParam(PARAM_DAMPING, this._options.damping);
          this.sendParam(PARAM_DENSITY, this._options.density);
          this.sendParam(PARAM_BANDWIDTH, this._options.bandwidth);
          this.sendParam(PARAM_DECAY, this._options.decay);
          this.sendParam(PARAM_PREDELAY, this._options.predelay);
          this.sendParam(PARAM_SIZE, this._options.size);
          this.sendParam(PARAM_GAIN, this._options.gain);
          this.sendParam(PARAM_MIX, 1.0); // WASM always 100% wet
          this.sendParam(PARAM_EARLYMIX, this._options.earlyMix);
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[MVerb] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: MVerbEffect.wasmBinary,
        jsCode: MVerbEffect.jsCode,
      });

    } catch (err) {
      console.warn('[MVerb] WASM init failed, using JS fallback:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}mverb/MVerb.worklet.js`);
      } catch {
        // May already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        try {
          const [wasmResponse, jsResponse] = await Promise.all([
            fetch(`${baseUrl}mverb/MVerb.wasm`),
            fetch(`${baseUrl}mverb/MVerb.js`),
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
          console.warn('[MVerb] Failed to fetch WASM files:', fetchErr);
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
      // wetGain → output already connected via Tone.js in constructor

      // Keepalive: ensure ScriptProcessorNode is processed
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.fallbackNode.connect(keepalive);
      keepalive.connect(rawContext.destination);

      this.usingFallback = true;
    } catch (err) {
      console.warn('[MVerb] Fallback init failed:', err);
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
      // wetGain → output already connected via Tone.js in constructor

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
      console.warn('[MVerb] WASM swap failed, staying on fallback:', err);
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
