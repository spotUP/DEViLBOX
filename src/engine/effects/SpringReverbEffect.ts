import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

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
 * SpringReverbEffect — WASM-powered spring reverb via AudioWorklet.
 *
 * Classic dub spring tank with metallic "drip" character.
 * Passthrough until WASM worklet is ready.
 */
export class SpringReverbEffect extends Tone.ToneAudioNode {
  readonly name = 'SpringReverb';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

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
    this.wetGain.connect(this.output);
    this.input.connect(this.wetGain);

    void this._initWorklet();
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

  setParam(param: string, value: number): void {
    switch (param) {
      case 'decay': this.setDecay(value); break;
      case 'damping': this.setDamping(value); break;
      case 'tension': this.setTension(value); break;
      case 'mix': this.setSpringMix(value); break;
      case 'drip': this.setDrip(value); break;
      case 'diffusion': this.setDiffusion(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await SpringReverbEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'springreverb-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          this.sendParam(PARAM_DECAY, this._options.decay);
          this.sendParam(PARAM_DAMPING, this._options.damping);
          this.sendParam(PARAM_TENSION, this._options.tension);
          this.sendParam(PARAM_MIX, 1.0); // WASM always 100% wet
          this.sendParam(PARAM_DRIP, this._options.drip);
          this.sendParam(PARAM_DIFFUSION, this._options.diffusion);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
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
            console.error('[SpringReverb] WASM swap failed, staying on passthrough:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[SpringReverb] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: SpringReverbEffect.wasmBinary,
        jsCode: SpringReverbEffect.jsCode,
      });

    } catch (err) {
      console.error('[SpringReverb] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}springreverb/SpringReverb.wasm`), fetch(`${base}springreverb/SpringReverb.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}springreverb/SpringReverb.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
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
