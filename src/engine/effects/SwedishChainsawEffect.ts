import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

const PARAM_TIGHT      = 0;
const PARAM_PEDAL_GAIN = 1;
const PARAM_AMP_GAIN   = 2;
const PARAM_BASS       = 3;
const PARAM_MIDDLE     = 4;
const PARAM_TREBLE     = 5;
const PARAM_VOLUME     = 6;

export interface SwedishChainsawOptions {
  tight?: number;     // 0 or 1
  pedalGain?: number; // 0-1
  ampGain?: number;   // 0-1
  bass?: number;      // 0-1
  middle?: number;    // 0-1
  treble?: number;    // 0-1
  volume?: number;    // 0-1
  wet?: number;       // 0-1
}

export class SwedishChainsawEffect extends Tone.ToneAudioNode {
  readonly name = 'SwedishChainsaw';

  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];

  private _options: Required<SwedishChainsawOptions>;

  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<SwedishChainsawOptions> = {}) {
    super();

    this._options = {
      tight:     options.tight ?? 0,
      pedalGain: options.pedalGain ?? 0.5,
      ampGain:   options.ampGain ?? 0.5,
      bass:      options.bass ?? 0.05,
      middle:    options.middle ?? 0.5,
      treble:    options.treble ?? 0.5,
      volume:    options.volume ?? 0.5,
      wet:       options.wet ?? 1.0,
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

  setTight(v: number)     { this._options.tight = v > 0.5 ? 1 : 0; this.sendParam(PARAM_TIGHT, this._options.tight); }
  setPedalGain(v: number) { this._options.pedalGain = clamp01(v); this.sendParam(PARAM_PEDAL_GAIN, v); }
  setAmpGain(v: number)   { this._options.ampGain = clamp01(v); this.sendParam(PARAM_AMP_GAIN, v); }
  setBass(v: number)      { this._options.bass = clamp01(v); this.sendParam(PARAM_BASS, v); }
  setMiddle(v: number)    { this._options.middle = clamp01(v); this.sendParam(PARAM_MIDDLE, v); }
  setTreble(v: number)    { this._options.treble = clamp01(v); this.sendParam(PARAM_TREBLE, v); }
  setVolume(v: number)    { this._options.volume = clamp01(v); this.sendParam(PARAM_VOLUME, v); }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = clamp01(value);
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await SwedishChainsawEffect.ensureInitialized(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'swedishchainsaw-processor');

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          this.sendParam(PARAM_TIGHT, this._options.tight);
          this.sendParam(PARAM_PEDAL_GAIN, this._options.pedalGain);
          this.sendParam(PARAM_AMP_GAIN, this._options.ampGain);
          this.sendParam(PARAM_BASS, this._options.bass);
          this.sendParam(PARAM_MIDDLE, this._options.middle);
          this.sendParam(PARAM_TREBLE, this._options.treble);
          this.sendParam(PARAM_VOLUME, this._options.volume);
          for (const { paramId, value } of this.pendingParams) {
            this.sendParam(paramId, value);
          }
          this.pendingParams = [];
          try {
            const rawInput = getNativeAudioNode(this.input)!;
            const rawWet = getNativeAudioNode(this.wetGain)!;
            rawInput.connect(this.workletNode!);
            this.workletNode!.connect(rawWet);
            try { this.input.disconnect(this.wetGain); } catch { /* */ }
            const rawCtx2 = Tone.getContext().rawContext as AudioContext;
            const keepalive = rawCtx2.createGain();
            keepalive.gain.value = 0;
            this.workletNode!.connect(keepalive);
            keepalive.connect(rawCtx2.destination);
          } catch (swapErr) {
            console.error('[SwedishChainsaw] WASM swap failed:', swapErr);
          }
        } else if (event.data.type === 'error') {
          console.error('[SwedishChainsaw] WASM worklet error:', event.data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: SwedishChainsawEffect.wasmBinary,
        jsCode: SwedishChainsawEffect.jsCode,
      });

    } catch (err) {
      console.error('[SwedishChainsaw] Worklet init failed:', err);
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${base}swedishchainsaw/SwedishChainsaw.wasm`),
        fetch(`${base}swedishchainsaw/SwedishChainsaw.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let js = await jsResp.text();
      js = js.replace(/if\s*\(typeof exports\s*===\s*"object".*$/s, '');
      this.jsCode = js;
      await ctx.audioWorklet.addModule(`${base}swedishchainsaw/SwedishChainsaw.worklet.js`);
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
