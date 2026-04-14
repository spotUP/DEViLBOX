import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

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
 * LeslieEffect - WASM-powered rotary speaker
 *
 * Built from scratch. Classic electromechanical Leslie simulation
 * with crossover, AM/doppler, and speed ramping.
 */
export class LeslieEffect extends Tone.ToneAudioNode {
  readonly name = 'Leslie';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

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
    this.passthroughGain = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);
    void this._initWorklet();
  }

  setSpeed(v: number) { this._options.speed = clamp01(v); this.sendParam(PARAM_SPEED, v); }
  setHornRate(v: number) {
    this._options.hornRate = Math.max(0.1, Math.min(10, v));
    this.sendParam(PARAM_HORN_RATE, v);
  }
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

  setParam(param: string, value: number): void {
    switch (param) {
      case 'speed': this.setSpeed(value); break;
      case 'hornRate': this.setHornRate(value); break;
      case 'drumRate': this.setDrumRate(value); break;
      case 'hornDepth': this.setHornDepth(value); break;
      case 'drumDepth': this.setDrumDepth(value); break;
      case 'doppler': this.setDoppler(value); break;
      case 'mix': this.setMix(value); break;
      case 'width': this.setWidth(value); break;
      case 'acceleration': this.setAcceleration(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  private async _initWorklet() {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await LeslieEffect.ensureInitialized(rawContext);

      if (!LeslieEffect.wasmBinary || !LeslieEffect.jsCode) {
        console.error('[Leslie] WASM not available, staying on passthrough');
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

          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            this.passthroughGain.gain.value = 0;
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.error('[Leslie] WASM swap failed, staying on passthrough:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[Leslie] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: LeslieEffect.wasmBinary,
        jsCode: LeslieEffect.jsCode,
      });

    } catch (err) {
      console.error('[Leslie] WASM init failed, staying on passthrough:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}leslie/Leslie.wasm`), fetch(`${base}leslie/Leslie.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}leslie/Leslie.worklet.js`);
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
      this.workletNode.port.postMessage({ type: 'dispose' });
      try { this.workletNode.disconnect(); } catch { /* ignored */ }
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
