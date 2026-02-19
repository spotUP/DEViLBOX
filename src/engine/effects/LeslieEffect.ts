import * as Tone from 'tone';

// WASM parameter IDs (must match LeslieEffect.cpp)
const PARAM_SPEED = 0;
const PARAM_HORN_RATE = 1;
const PARAM_DRUM_RATE = 2;
const PARAM_HORN_DEPTH = 3;
const PARAM_DRUM_DEPTH = 4;
const PARAM_DOPPLER = 5;
const PARAM_MIX = 6;
const PARAM_WIDTH = 7;
const PARAM_ACCELERATION = 8;

export interface LeslieOptions {
  speed?: number;        // 0=slow, 0.5=brake, 1=fast
  hornRate?: number;     // 0.1-10 Hz
  drumRate?: number;     // 0.1-8 Hz
  hornDepth?: number;    // 0-1
  drumDepth?: number;    // 0-1
  doppler?: number;      // 0-1
  mix?: number;          // 0-1
  width?: number;        // 0-1
  acceleration?: number; // 0-1
  wet?: number;          // 0-1 (Tone.js dry/wet)
}

/**
 * LeslieEffect - WASM-powered rotary speaker with JS fallback
 *
 * Built from scratch. Classic electromechanical Leslie simulation
 * with crossover, AM/doppler, and speed ramping.
 */
/** Extract the underlying native AudioNode from a Tone.js wrapper */
function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

export class LeslieEffect extends Tone.ToneAudioNode {
  readonly name = 'Leslie';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  private fallbackNode: ScriptProcessorNode | null = null;
  private fallbackLeslie: LeslieFallback | null = null;
  private usingFallback = false;

  private _options: Required<LeslieOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<LeslieOptions> = {}) {
    super();

    this._options = {
      speed: options.speed ?? 0.0,
      hornRate: options.hornRate ?? 6.8,
      drumRate: options.drumRate ?? 5.9,
      hornDepth: options.hornDepth ?? 0.7,
      drumDepth: options.drumDepth ?? 0.5,
      doppler: options.doppler ?? 0.5,
      mix: options.mix ?? 1.0,
      width: options.width ?? 0.8,
      acceleration: options.acceleration ?? 0.5,
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

  setSpeed(v: number) { this._options.speed = clamp01(v); this.sendParam(PARAM_SPEED, v); }
  setHornRate(v: number) { this._options.hornRate = Math.max(0.1, Math.min(10, v)); this.sendParam(PARAM_HORN_RATE, v); }
  setDrumRate(v: number) { this._options.drumRate = Math.max(0.1, Math.min(8, v)); this.sendParam(PARAM_DRUM_RATE, v); }
  setHornDepth(v: number) { this._options.hornDepth = clamp01(v); this.sendParam(PARAM_HORN_DEPTH, v); }
  setDrumDepth(v: number) { this._options.drumDepth = clamp01(v); this.sendParam(PARAM_DRUM_DEPTH, v); }
  setDoppler(v: number) { this._options.doppler = clamp01(v); this.sendParam(PARAM_DOPPLER, v); }
  setMix(v: number) { this._options.mix = clamp01(v); this.sendParam(PARAM_MIX, v); }
  setWidth(v: number) { this._options.width = clamp01(v); this.sendParam(PARAM_WIDTH, v); }
  setAcceleration(v: number) { this._options.acceleration = clamp01(v); this.sendParam(PARAM_ACCELERATION, v); }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  private async initWasm() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await LeslieEffect.ensureInitialized(rawContext);

      if (!LeslieEffect.wasmBinary || !LeslieEffect.jsCode) {
        console.warn('[Leslie] WASM not available, using JS fallback');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'leslie-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          this.sendParam(PARAM_SPEED, this._options.speed);
          this.sendParam(PARAM_HORN_RATE, this._options.hornRate);
          this.sendParam(PARAM_DRUM_RATE, this._options.drumRate);
          this.sendParam(PARAM_HORN_DEPTH, this._options.hornDepth);
          this.sendParam(PARAM_DRUM_DEPTH, this._options.drumDepth);
          this.sendParam(PARAM_DOPPLER, this._options.doppler);
          this.sendParam(PARAM_MIX, 1.0);
          this.sendParam(PARAM_WIDTH, this._options.width);
          this.sendParam(PARAM_ACCELERATION, this._options.acceleration);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[Leslie] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: LeslieEffect.wasmBinary,
        jsCode: LeslieEffect.jsCode,
      });

    } catch (err) {
      console.warn('[Leslie] WASM init failed, using JS fallback:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try { await context.audioWorklet.addModule(`${baseUrl}leslie/Leslie.worklet.js`); } catch { /* ignored */ }

      if (!this.wasmBinary || !this.jsCode) {
        try {
          const [wasmResponse, jsResponse] = await Promise.all([
            fetch(`${baseUrl}leslie/Leslie.wasm`),
            fetch(`${baseUrl}leslie/Leslie.js`),
          ]);
          if (wasmResponse.ok) this.wasmBinary = await wasmResponse.arrayBuffer();
          if (jsResponse.ok) {
            let code = await jsResponse.text();
            code = code
              .replace(/import\.meta\.url/g, "'.'")
              .replace(/export\s+default\s+\w+;?\s*$/m, '')
              .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
              .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
              .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');
            // Inject shim for AudioWorklet scope (has globalThis but no `self`)
            code = 'var self = globalThis;\n' + code;
            this.jsCode = code;
          }
        } catch (fetchErr) {
          console.warn('[Leslie] Failed to fetch WASM files:', fetchErr);
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
      this.fallbackLeslie = new LeslieFallback(rawContext.sampleRate);

      this.fallbackNode.onaudioprocess = (e) => {
        const inL = e.inputBuffer.getChannelData(0);
        const inR = e.inputBuffer.getChannelData(1);
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        this.fallbackLeslie!.process(inL, inR, outL, outR);
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
      console.warn('[Leslie] Fallback init failed:', err);
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
      console.warn('[Leslie] WASM swap failed, staying on fallback:', err);
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
 * Simple Leslie fallback: Tremolo + Chorus approximation
 */
class LeslieFallback {
  private phase = 0;
  private rate = 6.8;
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array) {
    const n = inL.length;
    for (let i = 0; i < n; i++) {
      const mod = Math.sin(this.phase * 2 * Math.PI);
      const am = 0.7 + 0.3 * mod;
      outL[i] = inL[i] * am;
      outR[i] = inR[i] * (0.7 - 0.3 * mod);
      this.phase += this.rate / this.sampleRate;
      if (this.phase >= 1) this.phase -= 1;
    }
  }
}
