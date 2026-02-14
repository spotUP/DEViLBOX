import * as Tone from 'tone';

// WASM parameter IDs (must match SpringReverbEffect.cpp)
const PARAM_DECAY = 0;
const PARAM_DAMPING = 1;
const PARAM_TENSION = 2;
const PARAM_MIX = 3;
const PARAM_DRIP = 4;
const PARAM_DIFFUSION = 5;

export interface SpringReverbOptions {
  decay?: number;     // 0-1
  damping?: number;   // 0-1
  tension?: number;   // 0-1
  mix?: number;       // 0-1
  drip?: number;      // 0-1
  diffusion?: number; // 0-1
  wet?: number;       // 0-1 (Tone.js dry/wet)
}

/**
 * SpringReverbEffect - WASM-powered spring reverb with JS fallback
 *
 * Built from scratch. Classic dub spring tank with metallic "drip" character.
 */
/** Extract the underlying native AudioNode from a Tone.js wrapper */
function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

export class SpringReverbEffect extends Tone.ToneAudioNode {
  readonly name = 'SpringReverb';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;

  private fallbackNode: ScriptProcessorNode | null = null;
  private fallbackReverb: SpringFallback | null = null;
  private usingFallback = false;

  private _options: Required<SpringReverbOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<SpringReverbOptions> = {}) {
    super();

    this._options = {
      decay: options.decay ?? 0.6,
      damping: options.damping ?? 0.4,
      tension: options.tension ?? 0.5,
      mix: options.mix ?? 0.35,
      drip: options.drip ?? 0.5,
      diffusion: options.diffusion ?? 0.7,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    // Wet path output connected immediately (fallback/wasm connects input → processor → wetGain)
    this.wetGain.connect(this.output);

    this.initFallback();
    this.initWasm();
  }

  setDecay(v: number) { this._options.decay = clamp01(v); this.sendParam(PARAM_DECAY, v); }
  setDamping(v: number) { this._options.damping = clamp01(v); this.sendParam(PARAM_DAMPING, v); }
  setTension(v: number) { this._options.tension = clamp01(v); this.sendParam(PARAM_TENSION, v); }
  setSpringMix(v: number) { this._options.mix = clamp01(v); this.sendParam(PARAM_MIX, v); }
  setDrip(v: number) { this._options.drip = clamp01(v); this.sendParam(PARAM_DRIP, v); }
  setDiffusion(v: number) { this._options.diffusion = clamp01(v); this.sendParam(PARAM_DIFFUSION, v); }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  private async initWasm() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await SpringReverbEffect.ensureInitialized(rawContext);

      if (!SpringReverbEffect.wasmBinary || !SpringReverbEffect.jsCode) {
        console.warn('[SpringReverb] WASM not available, using JS fallback');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'springreverb-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          this.sendParam(PARAM_DECAY, this._options.decay);
          this.sendParam(PARAM_DAMPING, this._options.damping);
          this.sendParam(PARAM_TENSION, this._options.tension);
          this.sendParam(PARAM_MIX, 1.0); // WASM always 100% wet
          this.sendParam(PARAM_DRIP, this._options.drip);
          this.sendParam(PARAM_DIFFUSION, this._options.diffusion);
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[SpringReverb] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: SpringReverbEffect.wasmBinary,
        jsCode: SpringReverbEffect.jsCode,
      });

    } catch (err) {
      console.warn('[SpringReverb] WASM init failed, using JS fallback:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try { await context.audioWorklet.addModule(`${baseUrl}springreverb/SpringReverb.worklet.js`); } catch { /* ignored */ }

      if (!this.wasmBinary || !this.jsCode) {
        try {
          const [wasmResponse, jsResponse] = await Promise.all([
            fetch(`${baseUrl}springreverb/SpringReverb.wasm`),
            fetch(`${baseUrl}springreverb/SpringReverb.js`),
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
          console.warn('[SpringReverb] Failed to fetch WASM files:', fetchErr);
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
      this.fallbackReverb = new SpringFallback(rawContext.sampleRate);

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
      console.warn('[SpringReverb] Fallback init failed:', err);
      // Direct passthrough as last resort
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
      console.warn('[SpringReverb] WASM swap failed, staying on fallback:', err);
    }
  }

  private sendParam(paramId: number, value: number) {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', paramId, value });
    }
    // Update fallback reverb parameters too
    if (this.usingFallback && this.fallbackReverb) {
      if (paramId === PARAM_DECAY) this.fallbackReverb.setFeedback(value);
      if (paramId === PARAM_DAMPING) this.fallbackReverb.setDamping(value);
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
 * Simple comb filter reverb fallback
 */
class SpringFallback {
  private combs: { buffer: Float32Array; index: number; feedback: number; lp: number }[];
  private dampingCoeff = 0.4;

  constructor(sampleRate: number) {
    const sr = sampleRate / 44100;
    this.combs = [
      { buffer: new Float32Array(Math.round(1116 * sr)), index: 0, feedback: 0.80, lp: 0 },
      { buffer: new Float32Array(Math.round(1188 * sr)), index: 0, feedback: 0.80, lp: 0 },
      { buffer: new Float32Array(Math.round(1277 * sr)), index: 0, feedback: 0.80, lp: 0 },
      { buffer: new Float32Array(Math.round(1356 * sr)), index: 0, feedback: 0.80, lp: 0 },
    ];
  }

  setFeedback(v: number) {
    const fb = 0.5 + clamp01(v) * 0.45; // map 0-1 → 0.5-0.95
    for (const c of this.combs) c.feedback = fb;
  }

  setDamping(v: number) {
    this.dampingCoeff = 0.1 + clamp01(v) * 0.8; // map 0-1 → 0.1-0.9
  }

  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array) {
    const n = inL.length;
    const damp = this.dampingCoeff;
    for (let i = 0; i < n; i++) {
      const mono = (inL[i] + inR[i]) * 0.5;
      let sum = 0;
      for (const c of this.combs) {
        const out = c.buffer[c.index];
        c.lp = out + damp * (c.lp - out);
        c.buffer[c.index] = mono + c.lp * c.feedback;
        c.index = (c.index + 1) % c.buffer.length;
        sum += out;
      }
      sum *= 0.25;
      outL[i] = sum;
      outR[i] = sum;
    }
  }
}
