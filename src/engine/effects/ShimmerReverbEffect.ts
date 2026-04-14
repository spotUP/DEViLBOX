import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

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
 * ShimmerReverbEffect - WASM-powered shimmer reverb.
 *
 * Uses AudioWorklet+WASM for the reverb DSP. Passthrough until WASM is ready
 * (no ScriptProcessorNode fallback — that caused main-thread buffer underruns
 * and the "brrrrr" stutter).
 */
export class ShimmerReverbEffect extends Tone.ToneAudioNode {
  readonly name = 'ShimmerReverb';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  private _options: Required<ShimmerReverbOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<ShimmerReverbOptions> = {}) {
    super();

    this._options = {
      decay: options.decay ?? 0.5,
      shimmer: options.shimmer ?? 0.3,
      pitch: options.pitch ?? 12,
      damping: options.damping ?? 0.6,
      size: options.size ?? 0.6,
      predelay: options.predelay ?? 0.0,
      modRate: options.modRate ?? 0.3,
      modDepth: options.modDepth ?? 0.2,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);
    this.passthroughGain = new Tone.Gain(1);

    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet passthrough (until WASM takes over)
    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    void this.initWasm();
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

  setParam(param: string, value: number): void {
    switch (param) {
      case 'decay': this.setDecay(value); break;
      case 'shimmer': this.setShimmer(value); break;
      case 'pitch': this.setPitch(value); break;
      case 'damping': this.setDamping(value); break;
      case 'size': this.setSize(value); break;
      case 'predelay': this.setPredelay(value); break;
      case 'modRate': this.setModRate(value); break;
      case 'modDepth': this.setModDepth(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  private async initWasm() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await ShimmerReverbEffect.ensureInitialized(rawContext);

      if (!ShimmerReverbEffect.wasmBinary || !ShimmerReverbEffect.jsCode) {
        console.warn('[ShimmerReverb] WASM not available, staying on passthrough');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'shimmer-reverb-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          // Send all params
          this.sendParam(PARAM_DECAY, this._options.decay);
          this.sendParam(PARAM_SHIMMER, this._options.shimmer);
          this.sendParam(PARAM_PITCH, this._options.pitch);
          this.sendParam(PARAM_DAMPING, this._options.damping);
          this.sendParam(PARAM_SIZE, this._options.size);
          this.sendParam(PARAM_PREDELAY, this._options.predelay);
          this.sendParam(PARAM_MOD_RATE, this._options.modRate);
          this.sendParam(PARAM_MOD_DEPTH, this._options.modDepth);
          this.sendParam(PARAM_MIX, 1.0);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];

          // Wire worklet into wet path, mute passthrough
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            this.passthroughGain.gain.value = 0;

            // Keepalive
            const keepalive = rawContext.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawContext.destination);
          } catch (err) {
            console.warn('[ShimmerReverb] WASM swap failed, staying on passthrough:', err);
          }
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
      console.warn('[ShimmerReverb] WASM init failed, staying on passthrough:', err);
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

  private sendParam(paramId: number, value: number) {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', paramId, value });
    } else {
      this.pendingParams = this.pendingParams.filter(p => p.paramId !== paramId);
      this.pendingParams.push({ paramId, value });
    }
  }

  dispose(): this {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
