/**
 * VocoderEffect — Channel vocoder as a drop-in Tone.js effect.
 *
 * Wraps the existing voclib WASM channel vocoder (public/vocoder/Vocoder.worklet.js
 * + Vocoder.wasm) so it can live on master + instrument effect chains alongside
 * Reverb, Delay, Distortion, etc.
 *
 * The WASM has a single-input/single-output design: it receives a modulator
 * signal and shapes an internally-generated carrier (saw / square / noise /
 * chord) by the modulator's spectral envelope.
 *
 * Two source modes:
 *   - 'self' (default): chain audio is the modulator. The effect output
 *     replaces the chain audio with its vocoded version. No mic needed.
 *   - 'mic': a microphone stream is the modulator. The chain audio is
 *     mixed into the dry path so you hear "synth + your-voice-shaped vocoder
 *     layered on top". Mic permission required on first use.
 *
 * Parameters (matching the existing VocoderEngine surface):
 *   - source        'self' | 'mic'
 *   - carrierType   0 saw | 1 square | 2 noise | 3 chord
 *   - carrierFreq   65-1000 Hz
 *   - formantShift  0.5-2.0 (1 = neutral)
 *   - reactionTime  0-0.2 s (envelope smoothing)
 *   - wet           0-1 (handled by TS gain nodes; WASM stays at 100 wet)
 */

import * as Tone from 'tone';
import { VOCODER_PRESETS, type CarrierType as StoreCarrierType } from '@/stores/useVocoderStore';

const PARAM_CARRIER_TYPE = 'carrierType';
const PARAM_CARRIER_FREQ = 'carrierFreq';
const PARAM_FORMANT = 'formantShift';
const PARAM_REACTION = 'reactionTime';

export type VocoderCarrierType = 0 | 1 | 2 | 3; // 0 saw, 1 square, 2 noise, 3 chord
export type VocoderSource = 'self' | 'mic';

const CARRIER_NAME_TO_INT: Record<StoreCarrierType, VocoderCarrierType> = {
  saw: 0,
  square: 1,
  noise: 2,
  chord: 3,
};

/** Re-exported preset list — same source of truth as the DJ view vocoder. */
export const VOCODER_EFFECT_PRESETS = VOCODER_PRESETS;

export interface VocoderEffectOptions {
  source?: VocoderSource;
  bands?: number;            // 12-64 (requires worklet reinit when changed)
  filtersPerBand?: number;   // 1-8 (requires worklet reinit when changed)
  carrierType?: VocoderCarrierType;
  carrierFreq?: number;
  formantShift?: number;
  reactionTime?: number;
  wet?: number;
}

/** Extract the underlying native GainNode from a Tone.js Gain wrapper */
function getRawGainNode(node: Tone.Gain): GainNode {
  const n = node as unknown as Record<string, GainNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as GainNode);
}

export class VocoderEffect extends Tone.ToneAudioNode {
  readonly name = 'VocoderEffect';

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Wet/dry split
  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;

  // WASM worklet
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ key: string; value: number }> = [];

  // Mic source (only used when source === 'mic')
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micPreamp: GainNode | null = null;

  // Connection state
  private workletConnectedToInput = false;

  // State
  private _options: Required<VocoderEffectOptions>;

  // Static cached WASM binary (shared across instances + contexts)
  private static wasmBinary: ArrayBuffer | null = null;
  private static loadedContexts = new WeakSet<BaseAudioContext>();
  private static initPromises = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: Partial<VocoderEffectOptions> = {}) {
    super();

    this._options = {
      source: options.source ?? 'self',
      bands: options.bands ?? 32,
      filtersPerBand: options.filtersPerBand ?? 6,
      carrierType: options.carrierType ?? 3, // chord
      carrierFreq: options.carrierFreq ?? 130.81, // C3
      formantShift: options.formantShift ?? 1.0,
      reactionTime: options.reactionTime ?? 0.03,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Dry: input → dryGain → output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet: workletNode (inserted by initWasm) → wetGain → output
    this.wetGain.connect(this.output);

    this.initWasm().catch((err) => {
      console.warn('[VocoderEffect] init failed:', err);
    });
  }

  // ── Parameter setters ──────────────────────────────────────────────────

  setSource(source: VocoderSource): void {
    if (this._options.source === source) return;
    this._options.source = source;
    if (this.isWasmReady) {
      this.rewireSource();
    }
  }

  setCarrierType(type: VocoderCarrierType): void {
    this._options.carrierType = type;
    this.sendParam(PARAM_CARRIER_TYPE, type);
  }

  setCarrierFreq(hz: number): void {
    this._options.carrierFreq = Math.max(20, Math.min(2000, hz));
    this.sendParam(PARAM_CARRIER_FREQ, this._options.carrierFreq);
  }

  setFormantShift(s: number): void {
    this._options.formantShift = Math.max(0.5, Math.min(2.0, s));
    this.sendParam(PARAM_FORMANT, this._options.formantShift);
  }

  setReactionTime(t: number): void {
    this._options.reactionTime = Math.max(0, Math.min(2.0, t));
    this.sendParam(PARAM_REACTION, this._options.reactionTime);
  }

  setBands(b: number): void {
    const clamped = Math.max(12, Math.min(64, Math.round(b)));
    if (clamped === this._options.bands) return;
    this._options.bands = clamped;
    this.reinitWorklet();
  }

  setFiltersPerBand(f: number): void {
    const clamped = Math.max(1, Math.min(8, Math.round(f)));
    if (clamped === this._options.filtersPerBand) return;
    this._options.filtersPerBand = clamped;
    this.reinitWorklet();
  }

  /** Load one of the named voice presets (Kraftwerk, Daft Punk, etc.) */
  loadPreset(name: string): void {
    const preset = VOCODER_EFFECT_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const p = preset.params;
    const newBands = p.bands;
    const newFilters = p.filtersPerBand;
    const reinitNeeded =
      newBands !== this._options.bands || newFilters !== this._options.filtersPerBand;

    this._options.bands = newBands;
    this._options.filtersPerBand = newFilters;
    this._options.carrierType = CARRIER_NAME_TO_INT[p.carrierType];
    this._options.carrierFreq = p.carrierFreq;
    this._options.formantShift = p.formantShift;
    this._options.reactionTime = p.reactionTime;

    if (reinitNeeded) {
      this.reinitWorklet();
    } else {
      this.sendParam(PARAM_CARRIER_TYPE, this._options.carrierType);
      this.sendParam(PARAM_CARRIER_FREQ, this._options.carrierFreq);
      this.sendParam(PARAM_FORMANT, this._options.formantShift);
      this.sendParam(PARAM_REACTION, this._options.reactionTime);
    }
  }

  /** Re-create the WASM vocoder with current bands/filtersPerBand. */
  private reinitWorklet(): void {
    if (!this.workletNode || !this.isWasmReady) return;
    const rawContext = Tone.getContext().rawContext as AudioContext;
    this.workletNode.port.postMessage({
      type: 'reinit',
      sampleRate: rawContext.sampleRate,
      bands: this._options.bands,
      filtersPerBand: this._options.filtersPerBand,
    });
    // After reinit re-send all runtime params
    this.workletNode.port.postMessage({ type: 'setCarrierType', value: this._options.carrierType });
    this.workletNode.port.postMessage({ type: 'setCarrierFreq', value: this._options.carrierFreq });
    this.workletNode.port.postMessage({ type: 'setFormantShift', value: this._options.formantShift });
    this.workletNode.port.postMessage({ type: 'setReactionTime', value: this._options.reactionTime });
    this.workletNode.port.postMessage({ type: 'setWet', value: 1.0 });
  }

  get wet(): number {
    return this._options.wet;
  }

  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.wetGain.gain.value = this._options.wet;
    this.dryGain.gain.value = 1 - this._options.wet;
  }

  // ── WASM init ──────────────────────────────────────────────────────────

  private async initWasm(): Promise<void> {
    const rawContext = Tone.getContext().rawContext as AudioContext;
    await VocoderEffect.ensureInitialized(rawContext);

    if (!VocoderEffect.wasmBinary) {
      console.warn('[VocoderEffect] WASM binary unavailable, vocoder will be silent');
      return;
    }

    this.workletNode = new AudioWorkletNode(rawContext, 'vocoder-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    this.workletNode.port.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'ready') {
        this.isWasmReady = true;
        this.sendParam(PARAM_CARRIER_TYPE, this._options.carrierType);
        this.sendParam(PARAM_CARRIER_FREQ, this._options.carrierFreq);
        this.sendParam(PARAM_FORMANT, this._options.formantShift);
        this.sendParam(PARAM_REACTION, this._options.reactionTime);
        // WASM always 100% wet — TS gains handle dry/wet
        this.workletNode!.port.postMessage({ type: 'setWet', value: 1.0 });
        for (const { key, value } of this.pendingParams) {
          this.workletNode!.port.postMessage({ type: this.paramTypeFor(key), value });
        }
        this.pendingParams = [];
        this.connectWorklet();
      } else if (data.type === 'error') {
        console.error('[VocoderEffect] worklet error:', data.message);
      }
    };

    // Send init with WASM binary
    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: VocoderEffect.wasmBinary,
      sampleRate: rawContext.sampleRate,
      bands: this._options.bands,
      filtersPerBand: this._options.filtersPerBand,
    });

    // Keepalive — make sure the worklet keeps processing even if its
    // output isn't currently routed (e.g., wet=0).
    const keepalive = rawContext.createGain();
    keepalive.gain.value = 0;
    this.workletNode.connect(keepalive);
    keepalive.connect(rawContext.destination);
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (VocoderEffect.loadedContexts.has(context)) return;
    const existing = VocoderEffect.initPromises.get(context);
    if (existing) return existing;

    const p = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try {
        await context.audioWorklet.addModule(`${baseUrl}vocoder/Vocoder.worklet.js?v=1`);
      } catch { /* may already be registered */ }

      if (!VocoderEffect.wasmBinary) {
        const resp = await fetch(`${baseUrl}vocoder/Vocoder.wasm`);
        if (resp.ok) {
          VocoderEffect.wasmBinary = await resp.arrayBuffer();
        }
      }
      VocoderEffect.loadedContexts.add(context);
    })();

    VocoderEffect.initPromises.set(context, p);
    return p;
  }

  // ── Connection management ──────────────────────────────────────────────

  /**
   * Wire up the worklet's input depending on the current source mode.
   * Self mode: chain audio → worklet → wetGain
   * Mic mode:  mic stream → worklet → wetGain (chain audio still goes through dry path)
   */
  private connectWorklet(): void {
    if (!this.workletNode) return;
    const rawContext = Tone.getContext().rawContext as AudioContext;
    const rawWet = getRawGainNode(this.wetGain);

    // Always connect worklet output to wet gain
    try { this.workletNode.connect(rawWet); } catch { /* may already be connected */ }

    this.rewireSource();
    void rawContext;
  }

  private rewireSource(): void {
    if (!this.workletNode) return;
    const rawInput = getRawGainNode(this.input);

    // Tear down any existing source connections to the worklet
    this.disconnectWorkletInput();

    if (this._options.source === 'self') {
      // Chain audio → worklet
      try { rawInput.connect(this.workletNode); this.workletConnectedToInput = true; } catch (err) {
        console.warn('[VocoderEffect] failed to connect chain audio to worklet:', err);
      }
    } else {
      // Mic → worklet (acquired lazily)
      this.acquireMic().catch((err) => {
        console.warn('[VocoderEffect] mic acquisition failed, falling back to self mode:', err);
        this._options.source = 'self';
        this.rewireSource();
      });
    }
  }

  private disconnectWorkletInput(): void {
    const rawInput = getRawGainNode(this.input);
    if (this.workletConnectedToInput && this.workletNode) {
      try { rawInput.disconnect(this.workletNode); } catch { /* ok */ }
      this.workletConnectedToInput = false;
    }
    if (this.micSource && this.workletNode) {
      try { this.micSource.disconnect(this.workletNode); } catch { /* ok */ }
    }
  }

  private async acquireMic(): Promise<void> {
    if (!this.workletNode) return;
    const rawContext = Tone.getContext().rawContext as AudioContext;

    if (!this.micStream) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    }

    if (!this.micSource) {
      this.micSource = rawContext.createMediaStreamSource(this.micStream);
    }
    if (!this.micPreamp) {
      this.micPreamp = rawContext.createGain();
      this.micPreamp.gain.value = 2.0; // built-in mics tend to be quiet
      this.micSource.connect(this.micPreamp);
    }
    try {
      this.micPreamp.connect(this.workletNode);
    } catch { /* may already be connected */ }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private paramTypeFor(key: string): string {
    switch (key) {
      case PARAM_CARRIER_TYPE: return 'setCarrierType';
      case PARAM_CARRIER_FREQ: return 'setCarrierFreq';
      case PARAM_FORMANT: return 'setFormantShift';
      case PARAM_REACTION: return 'setReactionTime';
      default: return key;
    }
  }

  private sendParam(key: string, value: number): void {
    if (this.workletNode && this.isWasmReady) {
      this.workletNode.port.postMessage({ type: this.paramTypeFor(key), value });
    } else {
      this.pendingParams = this.pendingParams.filter((p) => p.key !== key);
      this.pendingParams.push({ key, value });
    }
  }

  dispose(): this {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* ok */ }
      try { this.workletNode.disconnect(); } catch { /* ok */ }
      this.workletNode = null;
    }
    if (this.micPreamp) {
      try { this.micPreamp.disconnect(); } catch { /* ok */ }
      this.micPreamp = null;
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch { /* ok */ }
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.input.dispose();
    this.output.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    return super.dispose();
  }
}
