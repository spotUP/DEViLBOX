/**
 * PsgplayEngine.ts - Singleton WASM engine wrapper for Atari ST SNDH
 *
 * psgplay-wasm/ compiles PSG play (Fredrik Noring, GPL-2.0): the SNDH file's
 * own 68000 code runs on an emulated Atari ST/STE - Musashi 68000, YM2149,
 * MFP 68901 timers, STE DMA sound. It takes the whole file (raw or ICE!-
 * packed) and plays one subtune; the grid is a view (SNDHParser, drawn from
 * the same wasm's YM registers). Follows the TFMEngine singleton pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class PsgplayEngine extends WASMSingletonBase {
  private static instance: PsgplayEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(PsgplayEngine.cache);
  }

  static getInstance(): PsgplayEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (
      !PsgplayEngine.instance ||
      PsgplayEngine.instance._disposed ||
      PsgplayEngine.instance.audioContext !== currentCtx
    ) {
      if (PsgplayEngine.instance && !PsgplayEngine.instance._disposed) {
        PsgplayEngine.instance.dispose();
      }
      PsgplayEngine.instance = new PsgplayEngine();
    }
    return PsgplayEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PsgplayEngine.instance && !PsgplayEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'psgplay',
      workletFile: 'Psgplay.worklet.js',
      wasmFile: 'Psgplay.wasm',
      jsFile: 'Psgplay.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'psgplay-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PsgplayEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(3, 0, ['YM2149 A', 'YM2149 B', 'YM2149 C']);
          console.log(`[PsgplayEngine] SNDH loaded, subtune ${data.track} of ${data.subtunes}`);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'error':
          console.error('[PsgplayEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: PsgplayEngine.cache.wasmBinary, jsCode: PsgplayEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Load a whole SNDH file and start `track` (1-based; 0 = the file's default subtune). */
  async loadTune(buffer: ArrayBuffer, track = 0): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PsgplayEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer, track });
  }

  play(): void { /* the tune starts on load */ }

  /** Bit N set = YM channel N (A, B, C) audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (PsgplayEngine.instance === this) PsgplayEngine.instance = null;
  }
}
