/**
 * AelapseEffect — Tone.js wrapper around the Ælapse DSP WASM module.
 *
 * Ports the tape-delay + spring-reverb signal chain from smiarx/aelapse
 * (third-party/aelapse) to DEViLBOX via:
 *
 *   AelapseEffect.ts (this file)          — Tone.ToneAudioNode, dry/wet mix
 *      ↓ postMessage
 *   public/aelapse/Aelapse.worklet.js     — AudioWorklet, 128-sample blocks
 *      ↓ WASM call
 *   public/aelapse/Aelapse.wasm           — TapeDelay + Springs DSP
 *
 * Every parameter is a normalized 0..1 value. The WASM wrapper converts to
 * the DSP's native units (seconds, Hz, %, etc.) — see juce-wasm/aelapse/
 * AelapseEffect.cpp for the conversion table.
 *
 * In addition to audio, the worklet streams the Springs RMS ring buffer
 * back to the main thread on every ~30th process block. The main-thread
 * snapshot is exposed via `getRMSSnapshot()` so the React hardware UI can
 * feed it into the WebGL2 springs shader overlay.
 */

import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

// ── Parameter IDs — must match juce-wasm/aelapse/AelapseEffect.cpp ──────────

export const PARAM_DELAY_ACTIVE     = 0;
export const PARAM_DELAY_DRYWET     = 1;
export const PARAM_DELAY_SECONDS    = 2;
export const PARAM_DELAY_FEEDBACK   = 3;
export const PARAM_DELAY_CUT_LOW    = 4;
export const PARAM_DELAY_CUT_HI     = 5;
export const PARAM_DELAY_SATURATION = 6;
export const PARAM_DELAY_DRIFT      = 7;
export const PARAM_DELAY_MODE       = 8;
export const PARAM_SPRINGS_ACTIVE   = 9;
export const PARAM_SPRINGS_DRYWET   = 10;
export const PARAM_SPRINGS_WIDTH    = 11;
export const PARAM_SPRINGS_LENGTH   = 12;
export const PARAM_SPRINGS_DECAY    = 13;
export const PARAM_SPRINGS_DAMP     = 14;
export const PARAM_SPRINGS_SHAPE    = 15;
export const PARAM_SPRINGS_TONE     = 16;
export const PARAM_SPRINGS_SCATTER  = 17;
export const PARAM_SPRINGS_CHAOS    = 18;
export const PARAM_COUNT            = 19;

/**
 * JUCE UI's ParamId enum has two extra entries the DSP WASM doesn't expose
 * (kDelayTimeType = 2 and kDelayBeats = 4 — BPM-sync is deferred). The
 * table below maps JUCE ParamId ordinals to DSP param IDs; entries set to
 * -1 are skipped when the hardware UI forwards a change.
 */
export const JUCE_TO_DSP_PARAM: number[] = [
  PARAM_DELAY_ACTIVE,    // 0  kDelayActive
  PARAM_DELAY_DRYWET,    // 1  kDelayDrywet
  -1,                    // 2  kDelayTimeType  (skipped — seconds-only)
  PARAM_DELAY_SECONDS,   // 3  kDelaySeconds
  -1,                    // 4  kDelayBeats     (skipped — seconds-only)
  PARAM_DELAY_FEEDBACK,  // 5  kDelayFeedback
  PARAM_DELAY_CUT_LOW,   // 6  kDelayCutLow
  PARAM_DELAY_CUT_HI,    // 7  kDelayCutHi
  PARAM_DELAY_SATURATION,// 8  kDelaySaturation
  PARAM_DELAY_DRIFT,     // 9  kDelayDrift
  PARAM_DELAY_MODE,      // 10 kDelayMode
  PARAM_SPRINGS_ACTIVE,  // 11 kSpringsActive
  PARAM_SPRINGS_DRYWET,  // 12 kSpringsDryWet
  PARAM_SPRINGS_WIDTH,   // 13 kSpringsWidth
  PARAM_SPRINGS_LENGTH,  // 14 kSpringsLength
  PARAM_SPRINGS_DECAY,   // 15 kSpringsDecay
  PARAM_SPRINGS_DAMP,    // 16 kSpringsDamp
  PARAM_SPRINGS_SHAPE,   // 17 kSpringsShape
  PARAM_SPRINGS_TONE,    // 18 kSpringsTone
  PARAM_SPRINGS_SCATTER, // 19 kSpringsScatter
  PARAM_SPRINGS_CHAOS,   // 20 kSpringsChaos
];

// ── Options ─────────────────────────────────────────────────────────────────

export interface AelapseOptions {
  delayActive?:     boolean;
  delayDryWet?:     number;
  delayTime?:       number;
  delayFeedback?:   number;
  delayCutLow?:     number;
  delayCutHi?:      number;
  delaySaturation?: number;
  delayDrift?:      number;
  delayMode?:       number; // 0=Normal, 1=BackForth, 2=Reverse
  springsActive?:   boolean;
  springsDryWet?:   number;
  springsWidth?:    number;
  springsLength?:   number;
  springsDecay?:    number;
  springsDamp?:     number;
  springsShape?:    number;
  springsTone?:     number;
  springsScatter?:  number;
  springsChaos?:    number;
  wet?:             number;  // overall dry/wet mix
}

type RequiredOptions = {
  [K in keyof AelapseOptions]-?: NonNullable<AelapseOptions[K]>;
};

const DEFAULTS: RequiredOptions = {
  delayActive:     true,
  delayDryWet:     0.35,
  delayTime:       0.30,
  delayFeedback:   0.45,
  delayCutLow:     0.05,
  delayCutHi:      0.75,
  delaySaturation: 0.25,
  delayDrift:      0.15,
  delayMode:       0,
  springsActive:   true,
  springsDryWet:   0.40,
  springsWidth:    1.0,
  springsLength:   0.50,
  springsDecay:    0.40,
  springsDamp:     0.30,
  springsShape:    0.30,
  springsTone:     0.50,
  springsScatter:  0.50,
  springsChaos:    0.10,
  wet:             1.0,
};

// ── Effect class ────────────────────────────────────────────────────────────

export class AelapseEffect extends Tone.ToneAudioNode {
  readonly name = 'Aelapse';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private passthroughGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];
  private _options: RequiredOptions;

  // Latest RMS snapshot from the worklet — 256 floats (64 frames × 4 springs)
  // + current ring-buffer write position. Updated via postMessage at ~30Hz.
  private rmsStack = new Float32Array(256);
  private rmsPos = 0;

  // Static WASM loading state (shared across instances)
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<AelapseOptions> = {}) {
    super();

    this._options = { ...DEFAULTS, ...options } as RequiredOptions;

    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);
    this.passthroughGain = new Tone.Gain(1);

    // Dry path is always live. Wet path swaps in once the worklet is ready.
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    // Passthrough the input to the wet path until the worklet swaps in.
    this.input.connect(this.passthroughGain);
    this.passthroughGain.connect(this.wetGain);

    void this._initWorklet();
  }

  // ── Parameter setters ────────────────────────────────────────────────────

  setParamById(paramId: number, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    // Keep the TS-side option cache in sync so _flushInitialParams() sends
    // the right value if the WASM comes up after a burst of pre-init sets.
    switch (paramId) {
      case PARAM_DELAY_ACTIVE:     this._options.delayActive     = clamped > 0.5; break;
      case PARAM_DELAY_DRYWET:     this._options.delayDryWet     = clamped; break;
      case PARAM_DELAY_SECONDS:    this._options.delayTime       = clamped; break;
      case PARAM_DELAY_FEEDBACK:   this._options.delayFeedback   = clamped; break;
      case PARAM_DELAY_CUT_LOW:    this._options.delayCutLow     = clamped; break;
      case PARAM_DELAY_CUT_HI:     this._options.delayCutHi      = clamped; break;
      case PARAM_DELAY_SATURATION: this._options.delaySaturation = clamped; break;
      case PARAM_DELAY_DRIFT:      this._options.delayDrift      = clamped; break;
      case PARAM_DELAY_MODE:       this._options.delayMode       = Math.round(clamped * 2); break;
      case PARAM_SPRINGS_ACTIVE:   this._options.springsActive   = clamped > 0.5; break;
      case PARAM_SPRINGS_DRYWET:   this._options.springsDryWet   = clamped; break;
      case PARAM_SPRINGS_WIDTH:    this._options.springsWidth    = clamped; break;
      case PARAM_SPRINGS_LENGTH:   this._options.springsLength   = clamped; break;
      case PARAM_SPRINGS_DECAY:    this._options.springsDecay    = clamped; break;
      case PARAM_SPRINGS_DAMP:     this._options.springsDamp     = clamped; break;
      case PARAM_SPRINGS_SHAPE:    this._options.springsShape    = clamped; break;
      case PARAM_SPRINGS_TONE:     this._options.springsTone     = clamped; break;
      case PARAM_SPRINGS_SCATTER:  this._options.springsScatter  = clamped; break;
      case PARAM_SPRINGS_CHAOS:    this._options.springsChaos    = clamped; break;
    }
    this.sendParam(paramId, clamped);
  }

  /**
   * Forward a parameter change received from the JUCE hardware UI. The UI
   * emits JUCE ParamId ordinals (0..20) which include two skipped entries
   * for BPM sync. Use this entry point instead of setParamById() when the
   * index comes from the hardware UI callback.
   */
  forwardJuceParam(juceIndex: number, value: number): void {
    if (juceIndex < 0 || juceIndex >= JUCE_TO_DSP_PARAM.length) return;
    const dspId = JUCE_TO_DSP_PARAM[juceIndex];
    if (dspId < 0) return;
    this.setParamById(dspId, value);
  }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.dryGain.gain.value = 1 - this._options.wet;
    this.wetGain.gain.value = this._outputMuted ? 0 : this._options.wet;
  }

  /* JS-graph-level output mute. Zeros wetGain so WASM output is silenced
     without affecting the WASM DSP state. Used by DubBus to silence
     spring output during parameter transitions — the WASM can resonate
     internally all it wants, we just don't let it reach downstream nodes
     (which prevents the sidechain compressor from locking up). */
  private _outputMuted = false;
  muteOutput(): void {
    this._outputMuted = true;
    this.wetGain.gain.value = 0;
  }
  unmuteOutput(): void {
    this._outputMuted = false;
    this.wetGain.gain.value = this._options.wet;
  }

  // ── RMS snapshot access (consumed by the hardware UI shader) ─────────────

  getRMSSnapshot(): { stack: Float32Array; pos: number } {
    return { stack: this.rmsStack, pos: this.rmsPos };
  }

  // ── WASM initialization ──────────────────────────────────────────────────

  private async _initWorklet(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await AelapseEffect.ensureInitialized(rawContext);

      if (!AelapseEffect.wasmBinary || !AelapseEffect.jsCode) {
        console.error('[Aelapse] WASM not available, staying on passthrough');
        return;
      }

      this.workletNode = new AudioWorkletNode(rawContext, 'aelapse-processor', {
        numberOfInputs:   1,
        numberOfOutputs:  1,
        outputChannelCount: [2],
      });

      this.workletNode.port.onmessage = (event) => {
        const data = event.data;
        if (data.type === 'ready') {
          this.isWasmReady = true;
          this._flushInitialParams();
          this._swapToWasm();
        } else if (data.type === 'rms') {
          // The worklet transferred the Float32Array buffer, so we own it.
          if (data.stack instanceof Float32Array) {
            this.rmsStack = data.stack;
            this.rmsPos   = data.pos | 0;
          }
        } else if (data.type === 'error') {
          console.error('[Aelapse] WASM worklet error:', data.error);
        }
      };

      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary: AelapseEffect.wasmBinary,
        jsCode:     AelapseEffect.jsCode,
      });
    } catch (err) {
      console.error('[Aelapse] Worklet init failed:', err);
    }
  }

  private _flushInitialParams(): void {
    this.sendParam(PARAM_DELAY_ACTIVE,     this._options.delayActive ? 1 : 0);
    this.sendParam(PARAM_DELAY_DRYWET,     this._options.delayDryWet);
    this.sendParam(PARAM_DELAY_SECONDS,    this._options.delayTime);
    this.sendParam(PARAM_DELAY_FEEDBACK,   this._options.delayFeedback);
    this.sendParam(PARAM_DELAY_CUT_LOW,    this._options.delayCutLow);
    this.sendParam(PARAM_DELAY_CUT_HI,     this._options.delayCutHi);
    this.sendParam(PARAM_DELAY_SATURATION, this._options.delaySaturation);
    this.sendParam(PARAM_DELAY_DRIFT,      this._options.delayDrift);
    this.sendParam(PARAM_DELAY_MODE,       this._options.delayMode / 2);
    this.sendParam(PARAM_SPRINGS_ACTIVE,   this._options.springsActive ? 1 : 0);
    this.sendParam(PARAM_SPRINGS_DRYWET,   this._options.springsDryWet);
    this.sendParam(PARAM_SPRINGS_WIDTH,    this._options.springsWidth);
    this.sendParam(PARAM_SPRINGS_LENGTH,   this._options.springsLength);
    this.sendParam(PARAM_SPRINGS_DECAY,    this._options.springsDecay);
    this.sendParam(PARAM_SPRINGS_DAMP,     this._options.springsDamp);
    this.sendParam(PARAM_SPRINGS_SHAPE,    this._options.springsShape);
    this.sendParam(PARAM_SPRINGS_TONE,     this._options.springsTone);
    this.sendParam(PARAM_SPRINGS_SCATTER,  this._options.springsScatter);
    this.sendParam(PARAM_SPRINGS_CHAOS,    this._options.springsChaos);

    for (const { paramId, value } of this.pendingParams) {
      this.sendParam(paramId, value);
    }
    this.pendingParams = [];
  }

  private _swapToWasm(): void {
    if (!this.workletNode) return;
    try {
      const rawInput = getNativeAudioNode(this.input);
      const rawWet   = getNativeAudioNode(this.wetGain);
      if (!rawInput || !rawWet) return;

      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);
      this.passthroughGain.gain.value = 0;

      // Keepalive silent connection so the worklet stays scheduled even when
      // no downstream consumer is active yet.
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const keepalive = rawCtx.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawCtx.destination);
    } catch (err) {
      console.error('[Aelapse] WASM swap failed:', err);
    }
  }

  private sendParam(paramId: number, value: number): void {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: 'parameter', paramId, value });
    } else {
      this.pendingParams = this.pendingParams.filter((p) => p.paramId !== paramId);
      this.pendingParams.push({ paramId, value });
    }
  }

  private static async ensureInitialized(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;

    const p = (async () => {
      const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${baseUrl}aelapse/Aelapse.wasm`),
        fetch(`${baseUrl}aelapse/Aelapse.js`),
      ]);
      this.wasmBinary = await wasmResp.arrayBuffer();
      let code = await jsResp.text();
      code = code.replace(/import\.meta\.url/g, "'.'")
                 .replace(/export\s+default\s+\w+;?/g, '');
      this.jsCode = code;
      await ctx.audioWorklet.addModule(`${baseUrl}aelapse/Aelapse.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
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
