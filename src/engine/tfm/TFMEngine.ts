/**
 * TFMEngine.ts - Singleton WASM engine wrapper for TFM Music Maker (.tfe)
 *
 * tfm-wasm/ compiles ZXTune's TFM Music Maker parser + player (GPL-3) with
 * two ymfm YM2203 (BSD-3) at the TurboFM clock. It takes the whole .tfe file
 * and plays it; the grid is a view (TFMMusicMakerParser). Follows the
 * TFMEngine singleton pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class TFMEngine extends WASMSingletonBase {
  private static instance: TFMEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(TFMEngine.cache);
  }

  static getInstance(): TFMEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (
      !TFMEngine.instance ||
      TFMEngine.instance._disposed ||
      TFMEngine.instance.audioContext !== currentCtx
    ) {
      if (TFMEngine.instance && !TFMEngine.instance._disposed) {
        TFMEngine.instance.dispose();
      }
      TFMEngine.instance = new TFMEngine();
    }
    return TFMEngine.instance;
  }

  static hasInstance(): boolean {
    return !!TFMEngine.instance && !TFMEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'tfm',
      workletFile: 'TFM.worklet.js',
      wasmFile: 'TFM.wasm',
      jsFile: 'TFM.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'tfm-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[TFMEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(6, 0, ['YM2203 A FM 1', 'YM2203 A FM 2', 'YM2203 A FM 3', 'YM2203 B FM 1', 'YM2203 B FM 2', 'YM2203 B FM 3']);
          console.log('[TFMEngine] TFM Music Maker file loaded');
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'error':
          console.error('[TFMEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: TFMEngine.cache.wasmBinary, jsCode: TFMEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Load a whole .tfe file; it starts playing from order position 0. */
  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('TFMEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { /* the tune starts on load */ }

  /** Bit N set = TFM channel N (0-5; 0-2 chip 1, 3-5 chip 2) audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (TFMEngine.instance === this) TFMEngine.instance = null;
  }
}
