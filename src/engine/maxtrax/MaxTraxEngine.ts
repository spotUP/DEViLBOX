/**
 * MaxTraxEngine.ts — Singleton WASM engine for MaxTrax (MXTX) playback.
 *
 * The WASM renders at PAULA_RATE_PAL (28150 Hz); the worklet resamples to the
 * AudioContext rate.  Playback starts automatically after loadTune().
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class MaxTraxEngine extends WASMSingletonBase {
  private static instance: MaxTraxEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(MaxTraxEngine.cache);
  }

  static getInstance(): MaxTraxEngine {
    const ctx = getDevilboxAudioContext();
    if (
      !MaxTraxEngine.instance ||
      MaxTraxEngine.instance._disposed ||
      MaxTraxEngine.instance.audioContext !== ctx
    ) {
      if (MaxTraxEngine.instance && !MaxTraxEngine.instance._disposed) {
        MaxTraxEngine.instance.dispose();
      }
      MaxTraxEngine.instance = new MaxTraxEngine();
    }
    return MaxTraxEngine.instance;
  }

  static hasInstance(): boolean {
    return !!MaxTraxEngine.instance && !MaxTraxEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'maxtrax',
      workletFile: 'Maxtrax.worklet.js',
      wasmFile: 'Maxtrax.wasm',
      jsFile: 'Maxtrax.js',
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'maxtrax-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data as { type: string; result?: number; message?: string };
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case 'moduleLoaded':
          if (data.result !== 0) {
            console.error('[MaxTraxEngine] maxtrax_load returned', data.result);
          }
          break;
        case 'error':
          console.error('[MaxTraxEngine]', data.message);
          break;
        case 'log':
          // WASM stderr/stdout — surface only in dev, not as an error.
          if (import.meta.env?.DEV) console.debug('[MaxtraxWASM]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: MaxTraxEngine.cache.wasmBinary,
      jsCode: MaxTraxEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /**
   * Load a MaxTrax file and start playback.
   * @param buffer  Raw .mxtx file bytes
   * @param score   Sub-song index (0 = first, default)
   */
  async loadTune(buffer: ArrayBuffer, score = 0): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('[MaxTraxEngine] not initialized');
    this.workletNode.port.postMessage({ type: 'load', buffer, score });
  }

  /**
   * Write one event into the live WASM cooked buffer and mirror into the store.
   * Store is the authority and always updates unconditionally; the worklet post
   * is the live-audio projection and only fires when a worklet exists.
   *
   * Use `projectEventToWorklet` when the caller already owns the store write
   * (e.g. useMaxTraxGrid); use `setEvent` when the caller needs both.
   */
  setEvent(
    score: number,
    index: number,
    ev: { command: number; data: number; startTime: number; stopTime: number },
  ): void {
    // Store is the authority — update unconditionally first.
    useFormatStore.getState().mutateMaxTraxScore(score, (s) => {
      s.events[index] = { ...ev };
    });
    // Live-audio projection — only fires when the worklet is running.
    this.workletNode?.port.postMessage({ type: 'setEvent', score, index, ev });
  }

  /**
   * Project one event to the worklet ONLY — does NOT write the store.
   * Use this when the caller already owns the store write (e.g. useMaxTraxGrid)
   * to avoid N+1 store writes and spurious maxTraxRev bumps per edit.
   */
  projectEventToWorklet(
    score: number,
    index: number,
    ev: { command: number; data: number; startTime: number; stopTime: number },
  ): void {
    this.workletNode?.port.postMessage({ type: 'setEvent', score, index, ev });
  }

  /** Re-cook the score in the WASM player (rewinds read cursor for re-render). */
  recook(score: number): void {
    this.workletNode?.port.postMessage({ type: 'recook', score });
  }

  /**
   * Tier-1 live scalar edit: write Tune/Volume directly into the in-memory
   * `_patch` struct. Tune is re-read every tick (audibly live on sustaining
   * notes); Volume applies on the next sustain segment. `patchNumber` is the
   * sample's MaxTrax patch Number (the WASM indexes patches by Number).
   */
  setSampleParam(patchNumber: number, field: 'tune' | 'volume', value: number): void {
    this.workletNode?.port.postMessage({
      type: 'setPatchScalar',
      patchNumber,
      field: field === 'tune' ? 0 : 1,
      value: value | 0,
    });
  }

  /**
   * Tier-2 structural live edit: rebuild one patch's in-memory buffers from a
   * `tailRaw` sample byte slice (header+env+PCM, big-endian — from
   * `extractSampleDsampleSlice`). Takes effect on the next note-on for that
   * patch. Transfers the buffer to the worklet.
   */
  reloadSample(patchNumber: number, dsampleBytes: Uint8Array): void {
    // Copy into a fresh transferable buffer (worklet owns it after transfer).
    const buf = dsampleBytes.slice();
    this.workletNode?.port.postMessage(
      { type: 'reloadPatch', patchNumber, bytes: buf.buffer, len: buf.length },
      [buf.buffer],
    );
  }

  /** Playback starts automatically after loadTune() — this is a no-op. */
  play(): void {}

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  override dispose(): void {
    super.dispose();
    if (MaxTraxEngine.instance === this) {
      MaxTraxEngine.instance = null;
    }
  }
}
