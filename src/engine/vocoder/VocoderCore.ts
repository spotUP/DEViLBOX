/**
 * VocoderCore — Shared core for the voclib WASM channel vocoder.
 *
 * Owns:
 * - The static WASM binary cache + AudioWorklet module registration
 *   (one fetch + one addModule per AudioContext, shared across instances)
 * - One AudioWorkletNode wired to the WASM vocoder
 * - All parameter routing (carrier type / freq / formant / reaction /
 *   bands / filtersPerBand / wet) including reinit when bands or
 *   filtersPerBand change
 * - The 8 named voice presets (re-exported from useVocoderStore so the
 *   preset list stays a single source of truth)
 *
 * Does NOT own:
 * - Audio source acquisition (mic, chain audio, etc.)
 * - Output routing (effects chain, mixer, dry/wet, recording)
 *
 * Both VocoderEngine (DJ view) and VocoderEffect (effect chain) wrap this
 * core class. Connect their input audio to `core.node` (the worklet's
 * input) and tap `core.node` for the processed output.
 */

import { VOCODER_PRESETS, type CarrierType as StoreCarrierType } from '@/stores/useVocoderStore';
import {
  createWASMAssetsCache,
  loadWASMAssets,
  type WASMAssetsCache,
} from '@/engine/wasm/WASMSingletonBase';

export type VocoderCarrierType = 0 | 1 | 2 | 3; // 0 saw, 1 square, 2 noise, 3 chord

export const CARRIER_NAME_TO_INT: Record<StoreCarrierType, VocoderCarrierType> = {
  saw: 0,
  square: 1,
  noise: 2,
  chord: 3,
};

/** Re-exported for any consumer that wants to render a preset picker. */
export const VOCODER_CORE_PRESETS = VOCODER_PRESETS;

export interface VocoderCoreOptions {
  bands?: number;            // 12-64 (requires worklet reinit when changed)
  filtersPerBand?: number;   // 1-8 (requires worklet reinit when changed)
  carrierType?: VocoderCarrierType;
  carrierFreq?: number;      // 20-2000 Hz
  formantShift?: number;     // 0.25-4.0
  reactionTime?: number;     // 0-2.0 seconds
}

export class VocoderCore {
  // Shared WASM-only cache (no Emscripten JS glue — the worklet instantiates the
  // WASM binary directly). One fetch + one addModule per AudioContext.
  private static cache: WASMAssetsCache = createWASMAssetsCache();
  private static preloadStarted = false;

  /**
   * Eagerly fetch the WASM binary + register the worklet module so the
   * first user of VocoderCore doesn't pay the cold-start cost. Safe to
   * call multiple times.
   */
  static preload(audioContext?: AudioContext): void {
    if (VocoderCore.preloadStarted) return;
    VocoderCore.preloadStarted = true;
    if (!audioContext) return;
    VocoderCore.ensureLoaded(audioContext).catch((err) => {
      console.warn('[VocoderCore] preload failed (non-fatal):', err);
    });
  }

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private _isReady = false;
  private pendingMessages: Array<Record<string, unknown>> = [];

  // State
  private opts: Required<VocoderCoreOptions>;

  /**
   * Called whenever the worklet posts an RMS report (~20Hz).
   * Receives both the vocoder output RMS and the input peak level.
   */
  onAmplitude: ((rms: number, inputPeak: number) => void) | null = null;

  constructor(audioContext: AudioContext, options: VocoderCoreOptions = {}) {
    this.audioContext = audioContext;
    this.opts = {
      bands: options.bands ?? 32,
      filtersPerBand: options.filtersPerBand ?? 6,
      carrierType: options.carrierType ?? 3, // chord
      carrierFreq: options.carrierFreq ?? 130.81, // C3
      formantShift: options.formantShift ?? 1.0,
      reactionTime: options.reactionTime ?? 0.03,
    };
  }

  // ── Init ───────────────────────────────────────────────────────────────

  /**
   * Load the WASM, create the AudioWorkletNode, send the init message,
   * and resolve once the worklet posts back its 'ready' signal.
   */
  async init(): Promise<void> {
    await VocoderCore.ensureLoaded(this.audioContext);
    if (!VocoderCore.cache.wasmBinary) {
      throw new Error('VocoderCore: WASM binary unavailable');
    }

    this.workletNode = new AudioWorkletNode(this.audioContext, 'vocoder-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    // Wait for the worklet to instantiate the WASM and post 'ready'
    await new Promise<void>((resolve, reject) => {
      const node = this.workletNode!;
      const timeout = setTimeout(() => {
        reject(new Error('VocoderCore: worklet init timeout (5s)'));
      }, 5000);

      node.port.onmessage = (e) => {
        const data = e.data;
        if (data.type === 'ready') {
          clearTimeout(timeout);
          this._isReady = true;
          // Re-attach normal message handler
          node.port.onmessage = (ev) => this.handleWorkletMessage(ev.data);
          // Push initial parameter values now that WASM is alive
          this.flushInitialParams();
          // Drain anything that was queued before ready
          for (const msg of this.pendingMessages) node.port.postMessage(msg);
          this.pendingMessages = [];
          resolve();
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(`VocoderCore: worklet error — ${data.message}`));
        }
      };

      node.port.postMessage({
        type: 'init',
        wasmBinary: VocoderCore.cache.wasmBinary,
        sampleRate: this.audioContext.sampleRate,
        bands: this.opts.bands,
        filtersPerBand: this.opts.filtersPerBand,
      });
    });
  }

  private flushInitialParams(): void {
    if (!this.workletNode || !this._isReady) return;
    const port = this.workletNode.port;
    port.postMessage({ type: 'setCarrierType', value: this.opts.carrierType });
    port.postMessage({ type: 'setCarrierFreq', value: this.opts.carrierFreq });
    port.postMessage({ type: 'setFormantShift', value: this.opts.formantShift });
    port.postMessage({ type: 'setReactionTime', value: this.opts.reactionTime });
    port.postMessage({ type: 'setWet', value: 1.0 }); // core always 100% wet; consumers handle mix
  }

  private handleWorkletMessage(data: { type: string; value?: number; micPeak?: number; message?: string }): void {
    if (data.type === 'rms') {
      this.onAmplitude?.(data.value ?? 0, data.micPeak ?? 0);
    } else if (data.type === 'error') {
      console.error('[VocoderCore] worklet error:', data.message);
    }
  }

  private send(msg: Record<string, unknown>): void {
    if (this.workletNode && this._isReady) {
      this.workletNode.port.postMessage(msg);
    } else {
      // Last write wins per message type while we wait for ready
      this.pendingMessages = this.pendingMessages.filter((m) => m.type !== msg.type);
      this.pendingMessages.push(msg);
    }
  }

  // ── Static loader ──────────────────────────────────────────────────────

  private static ensureLoaded(context: AudioContext): Promise<void> {
    return loadWASMAssets(context, VocoderCore.cache, {
      dir: 'vocoder',
      workletFile: 'Vocoder.worklet.js',
      wasmFile: 'Vocoder.wasm',
      // No jsFile — the worklet instantiates the WASM directly.
      workletCacheBust: true,
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** The underlying AudioWorkletNode. Connect inputs/outputs to this. */
  get node(): AudioWorkletNode | null {
    return this.workletNode;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  setCarrierType(type: VocoderCarrierType): void {
    this.opts.carrierType = type;
    this.send({ type: 'setCarrierType', value: type });
  }

  setCarrierFreq(hz: number): void {
    this.opts.carrierFreq = Math.max(20, Math.min(2000, hz));
    this.send({ type: 'setCarrierFreq', value: this.opts.carrierFreq });
  }

  setFormantShift(shift: number): void {
    this.opts.formantShift = Math.max(0.25, Math.min(4.0, shift));
    this.send({ type: 'setFormantShift', value: this.opts.formantShift });
  }

  setReactionTime(secs: number): void {
    this.opts.reactionTime = Math.max(0, Math.min(2.0, secs));
    this.send({ type: 'setReactionTime', value: this.opts.reactionTime });
  }

  setWet(wet: number): void {
    // The worklet has its own internal wet gain. Most consumers should
    // leave this at 1.0 and handle dry/wet via external GainNodes.
    this.send({ type: 'setWet', value: Math.max(0, Math.min(1, wet)) });
  }

  setBands(bands: number): void {
    const clamped = Math.max(12, Math.min(64, Math.round(bands)));
    if (clamped === this.opts.bands) return;
    this.opts.bands = clamped;
    this.reinitWasm();
  }

  setFiltersPerBand(f: number): void {
    const clamped = Math.max(1, Math.min(8, Math.round(f)));
    if (clamped === this.opts.filtersPerBand) return;
    this.opts.filtersPerBand = clamped;
    this.reinitWasm();
  }

  /** Load one of the named voice presets (Kraftwerk, Daft Punk, etc.). */
  loadPreset(name: string): void {
    const preset = VOCODER_CORE_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const p = preset.params;
    const reinitNeeded =
      p.bands !== this.opts.bands || p.filtersPerBand !== this.opts.filtersPerBand;

    this.opts.bands = p.bands;
    this.opts.filtersPerBand = p.filtersPerBand;
    this.opts.carrierType = CARRIER_NAME_TO_INT[p.carrierType];
    this.opts.carrierFreq = p.carrierFreq;
    this.opts.formantShift = p.formantShift;
    this.opts.reactionTime = p.reactionTime;

    if (reinitNeeded) {
      this.reinitWasm();
    } else {
      this.send({ type: 'setCarrierType', value: this.opts.carrierType });
      this.send({ type: 'setCarrierFreq', value: this.opts.carrierFreq });
      this.send({ type: 'setFormantShift', value: this.opts.formantShift });
      this.send({ type: 'setReactionTime', value: this.opts.reactionTime });
    }
  }

  /** Re-create the WASM vocoder with the current bands/filtersPerBand. */
  private reinitWasm(): void {
    if (!this.workletNode || !this._isReady) return;
    const port = this.workletNode.port;
    port.postMessage({
      type: 'reinit',
      sampleRate: this.audioContext.sampleRate,
      bands: this.opts.bands,
      filtersPerBand: this.opts.filtersPerBand,
    });
    // Re-send all runtime params after reinit
    port.postMessage({ type: 'setCarrierType', value: this.opts.carrierType });
    port.postMessage({ type: 'setCarrierFreq', value: this.opts.carrierFreq });
    port.postMessage({ type: 'setFormantShift', value: this.opts.formantShift });
    port.postMessage({ type: 'setReactionTime', value: this.opts.reactionTime });
    port.postMessage({ type: 'setWet', value: 1.0 });
  }

  /** Reset the vocoder DSP state (clear filterbank history). */
  reset(): void {
    this.send({ type: 'reset' });
  }

  /** Tear down the worklet + WASM. The instance is unusable after this. */
  dispose(): void {
    if (this.workletNode) {
      try { this.workletNode.port.postMessage({ type: 'dispose' }); } catch { /* ok */ }
      try { this.workletNode.disconnect(); } catch { /* ok */ }
      this.workletNode = null;
    }
    this._isReady = false;
    this.pendingMessages = [];
    this.onAmplitude = null;
  }
}
