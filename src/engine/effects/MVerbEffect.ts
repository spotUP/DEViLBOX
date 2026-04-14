import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

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
 * MVerbEffect - WASM-powered plate reverb via AudioWorklet.
 *
 * Wraps Martin Eastwood's MVerb (GPL v3) via AudioWorklet+WASM.
 * Uses passthrough until WASM is ready, then swaps in the worklet.
 */
export class MVerbEffect extends Tone.ToneAudioNode {
  readonly name = 'MVerb';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

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
    this.passthroughGain = new Tone.Gain(1);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);

    void this._initWorklet();
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

  setParam(param: string, value: number): void {
    switch (param) {
      case 'damping': this.setDamping(value); break;
      case 'density': this.setDensity(value); break;
      case 'bandwidth': this.setBandwidth(value); break;
      case 'decay': this.setDecay(value); break;
      case 'predelay': this.setPredelay(value); break;
      case 'size': this.setSize(value); break;
      case 'gain': this.setGain(value); break;
      case 'mix': this.setMix(value); break;
      case 'earlyMix': this.setEarlyMix(value); break;
      case 'wet': this.wet = value; break;
    }
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      console.log('[MVerb] ⚡ _initWorklet starting (refactored v2)');
      await MVerbEffect.ensureInitialized(rawCtx);
      console.log('[MVerb] ⚡ ensureInitialized done, wasmBinary:', !!MVerbEffect.wasmBinary, 'jsCode:', !!MVerbEffect.jsCode);

      if (!MVerbEffect.wasmBinary || !MVerbEffect.jsCode) {
        console.error('[MVerb] WASM not available, staying on passthrough');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawCtx, 'mverb-processor');
      console.log('[MVerb] ⚡ AudioWorkletNode created, sending init message');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          console.log('[MVerb] ⚡ WASM ready! Connecting worklet to audio chain');
          this.isWasmReady = true;
          this.sendParam(PARAM_DAMPING, this._options.damping);
          this.sendParam(PARAM_DENSITY, this._options.density);
          this.sendParam(PARAM_BANDWIDTH, this._options.bandwidth);
          this.sendParam(PARAM_DECAY, this._options.decay);
          this.sendParam(PARAM_PREDELAY, this._options.predelay);
          this.sendParam(PARAM_SIZE, this._options.size);
          this.sendParam(PARAM_GAIN, this._options.gain);
          this.sendParam(PARAM_MIX, 1.0);
          this.sendParam(PARAM_EARLYMIX, this._options.earlyMix);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            console.log('[MVerb] ⚡ rawInput:', !!rawInput, 'rawWet:', !!rawWet);
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            this.passthroughGain.gain.value = 0;
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
            console.log('[MVerb] ⚡ WASM swap complete — effect should be active!');
          } catch (swapErr) {
            console.error('[MVerb] WASM swap failed, staying on passthrough:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[MVerb] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: MVerbEffect.wasmBinary,
        jsCode: MVerbEffect.jsCode,
      });

    } catch (err) {
      console.error('[MVerb] Worklet init failed, staying on passthrough:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}mverb/MVerb.wasm`), fetch(`${base}mverb/MVerb.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}mverb/MVerb.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
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
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* */ }
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
