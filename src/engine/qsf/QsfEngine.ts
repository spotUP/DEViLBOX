/**
 * QsfEngine.ts - Singleton WASM engine wrapper for QSF (Capcom QSound) playback
 *
 * Follows the Sc68Engine/ZxtuneEngine singleton pattern.
 * Emulates Z80 CPU + QSound DSP via the highly_quixotic library.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class QsfEngine extends WASMSingletonBase {
  private static instance: QsfEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(QsfEngine.cache);
  }

  static getInstance(): QsfEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !QsfEngine.instance ||
      QsfEngine.instance._disposed ||
      QsfEngine.instance.audioContext !== currentCtx
    ) {
      if (QsfEngine.instance && !QsfEngine.instance._disposed) {
        QsfEngine.instance.dispose();
      }
      QsfEngine.instance = new QsfEngine();
    }
    return QsfEngine.instance;
  }

  static hasInstance(): boolean {
    return !!QsfEngine.instance && !QsfEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'qsf',
      workletFile: 'Qsf.worklet.js',
      wasmFile: 'Qsf.wasm',
      jsFile: 'Qsf.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'qsf-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[QsfEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[QsfEngine] QSF module loaded');
          break;
        case 'error':
          console.error('[QsfEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: QsfEngine.cache.wasmBinary, jsCode: QsfEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('QsfEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (QsfEngine.instance === this) QsfEngine.instance = null;
  }
}
