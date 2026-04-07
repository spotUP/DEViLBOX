import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

// WASM parameter IDs (must match GranularFreezeEffect.cpp)
const PARAM_FREEZE       = 0;
const PARAM_GRAIN_SIZE   = 1;
const PARAM_DENSITY      = 2;
const PARAM_SCATTER      = 3;
const PARAM_PITCH        = 4;
const PARAM_SPRAY        = 5;
const PARAM_SHIMMER      = 6;
const PARAM_STEREO_WIDTH = 7;
const PARAM_FEEDBACK     = 8;
const PARAM_CAPTURE_LEN  = 9;
const PARAM_ATTACK       = 10;
const PARAM_RELEASE      = 11;
const PARAM_THRU         = 12;
const PARAM_MIX          = 13;

export interface GranularFreezeOptions {
  freeze?: number;          // 0 or 1
  grainSize?: number;       // 0.01-0.5 seconds
  density?: number;         // 1-50 grains/sec
  scatter?: number;         // 0-1
  pitch?: number;           // -24 to +24 semitones
  spray?: number;           // 0-1
  shimmer?: number;         // 0-1 (octave-up probability)
  stereoWidth?: number;     // 0-1
  feedback?: number;        // 0-1
  captureLength?: number;   // 0.05-2.0 seconds
  attack?: number;          // 0.001-0.05 seconds
  release?: number;         // 0.001-0.2 seconds
  thru?: number;            // 0 or 1
  wet?: number;             // 0-1
}

/** Extract the underlying native AudioNode from a Tone.js wrapper */
/**
 * GranularFreezeEffect - WASM-powered granular freeze with JS ring-buffer fallback
 *
 * Wraps granular freeze DSP via AudioWorklet+WASM.
 * Falls back to a simple ring-buffer looper when freeze is active if WASM fails to load.
 */
export class GranularFreezeEffect extends Tone.ToneAudioNode {
  readonly name = 'GranularFreeze';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  private fallbackNode: ScriptProcessorNode | null = null;
  private fallbackFreeze: FreezeFallback | null = null;
  private usingFallback = false;

  private _options: Required<GranularFreezeOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<GranularFreezeOptions> = {}) {
    super();

    this._options = {
      freeze: options.freeze ?? 0,
      grainSize: options.grainSize ?? 0.1,
      density: options.density ?? 10,
      scatter: options.scatter ?? 0.5,
      pitch: options.pitch ?? 0,
      spray: options.spray ?? 0.3,
      shimmer: options.shimmer ?? 0,
      stereoWidth: options.stereoWidth ?? 0.5,
      feedback: options.feedback ?? 0,
      captureLength: options.captureLength ?? 1.0,
      attack: options.attack ?? 0.01,
      release: options.release ?? 0.05,
      thru: options.thru ?? 0,
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

  setFreeze(v: number) { this._options.freeze = v >= 0.5 ? 1 : 0; this.sendParam(PARAM_FREEZE, this._options.freeze); if (this.fallbackFreeze) this.fallbackFreeze.frozen = this._options.freeze === 1; }
  setGrainSize(v: number) { this._options.grainSize = clamp(v, 0.01, 0.5); this.sendParam(PARAM_GRAIN_SIZE, v); }
  setDensity(v: number) { this._options.density = clamp(v, 1, 50); this.sendParam(PARAM_DENSITY, v); }
  setScatter(v: number) { this._options.scatter = clamp01(v); this.sendParam(PARAM_SCATTER, v); }
  setPitch(v: number) { this._options.pitch = clamp(v, -24, 24); this.sendParam(PARAM_PITCH, v); }
  setSpray(v: number) { this._options.spray = clamp01(v); this.sendParam(PARAM_SPRAY, v); }
  setShimmer(v: number) { this._options.shimmer = clamp01(v); this.sendParam(PARAM_SHIMMER, v); }
  setStereoWidth(v: number) { this._options.stereoWidth = clamp01(v); this.sendParam(PARAM_STEREO_WIDTH, v); }
  setFeedback(v: number) { this._options.feedback = clamp01(v); this.sendParam(PARAM_FEEDBACK, v); }
  setCaptureLength(v: number) { this._options.captureLength = clamp(v, 0.05, 2.0); this.sendParam(PARAM_CAPTURE_LEN, v); }
  setAttack(v: number) { this._options.attack = clamp(v, 0.001, 0.05); this.sendParam(PARAM_ATTACK, v); }
  setRelease(v: number) { this._options.release = clamp(v, 0.001, 0.2); this.sendParam(PARAM_RELEASE, v); }
  setThru(v: number) { this._options.thru = v >= 0.5 ? 1 : 0; this.sendParam(PARAM_THRU, this._options.thru); }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  private async initWasm() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await GranularFreezeEffect.ensureInitialized(rawContext);

      if (!GranularFreezeEffect.wasmBinary || !GranularFreezeEffect.jsCode) {
        console.warn('[GranularFreeze] WASM not available, using JS fallback');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'granular-freeze-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          // Send initial params from _options
          this.sendParam(PARAM_FREEZE, this._options.freeze);
          this.sendParam(PARAM_GRAIN_SIZE, this._options.grainSize);
          this.sendParam(PARAM_DENSITY, this._options.density);
          this.sendParam(PARAM_SCATTER, this._options.scatter);
          this.sendParam(PARAM_PITCH, this._options.pitch);
          this.sendParam(PARAM_SPRAY, this._options.spray);
          this.sendParam(PARAM_SHIMMER, this._options.shimmer);
          this.sendParam(PARAM_STEREO_WIDTH, this._options.stereoWidth);
          this.sendParam(PARAM_FEEDBACK, this._options.feedback);
          this.sendParam(PARAM_CAPTURE_LEN, this._options.captureLength);
          this.sendParam(PARAM_ATTACK, this._options.attack);
          this.sendParam(PARAM_RELEASE, this._options.release);
          this.sendParam(PARAM_THRU, this._options.thru);
          this.sendParam(PARAM_MIX, 1.0); // WASM always 100% wet
          // Flush any params queued before WASM was ready
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
          this.swapToWasm();
        } else if (event.data.type === 'error') {
          console.warn('[GranularFreeze] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: GranularFreezeEffect.wasmBinary,
        jsCode: GranularFreezeEffect.jsCode,
      });

    } catch (err) {
      console.warn('[GranularFreeze] WASM init failed, using JS fallback:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}granular-freeze/GranularFreeze.worklet.js`);
      } catch {
        // May already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        try {
          const [wasmResponse, jsResponse] = await Promise.all([
            fetch(`${baseUrl}granular-freeze/GranularFreeze.wasm`),
            fetch(`${baseUrl}granular-freeze/GranularFreeze.js`),
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
          console.warn('[GranularFreeze] Failed to fetch WASM files:', fetchErr);
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
      this.fallbackFreeze = new FreezeFallback(rawContext.sampleRate, this._options.captureLength);

      this.fallbackNode.onaudioprocess = (e) => {
        const inL = e.inputBuffer.getChannelData(0);
        const inR = e.inputBuffer.getChannelData(1);
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        this.fallbackFreeze!.process(inL, inR, outL, outR);
      };

      const rawInput = getNativeAudioNode(this.input)!;
      const rawWet = getNativeAudioNode(this.wetGain)!;

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
      console.warn('[GranularFreeze] Fallback init failed:', err);
      this.input.connect(this.wetGain);
    }
  }

  private swapToWasm() {
    if (!this.workletNode) return;

    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      // Connect WASM first, then disconnect fallback (avoids silent gap)
      const rawInput = getNativeAudioNode(this.input)!;
      const rawWet = getNativeAudioNode(this.wetGain)!;

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
      console.warn('[GranularFreeze] WASM swap failed, staying on fallback:', err);
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
 * Simple freeze fallback: captures audio into a ring buffer and loops it when frozen.
 * No granular processing — just a clean loop of the last N seconds of captured audio.
 */
class FreezeFallback {
  frozen = false;

  private bufferL: Float32Array;
  private bufferR: Float32Array;
  private writePos = 0;
  private readPos = 0;
  private bufferLength: number;
  private filled = false;

  constructor(sampleRate: number, captureLengthSec: number) {
    this.bufferLength = Math.round(sampleRate * captureLengthSec);
    this.bufferL = new Float32Array(this.bufferLength);
    this.bufferR = new Float32Array(this.bufferLength);
  }

  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array) {
    const n = inL.length;

    if (!this.frozen) {
      // Not frozen: passthrough input and keep capturing into ring buffer
      for (let i = 0; i < n; i++) {
        this.bufferL[this.writePos] = inL[i];
        this.bufferR[this.writePos] = inR[i];
        this.writePos++;
        if (this.writePos >= this.bufferLength) {
          this.writePos = 0;
          this.filled = true;
        }
        outL[i] = inL[i];
        outR[i] = inR[i];
      }
    } else {
      // Frozen: loop the captured buffer
      const len = this.filled ? this.bufferLength : this.writePos;
      if (len === 0) {
        // Nothing captured yet — output silence
        outL.fill(0);
        outR.fill(0);
        return;
      }
      for (let i = 0; i < n; i++) {
        outL[i] = this.bufferL[this.readPos];
        outR[i] = this.bufferR[this.readPos];
        this.readPos++;
        if (this.readPos >= len) {
          this.readPos = 0;
        }
      }
    }
  }
}
