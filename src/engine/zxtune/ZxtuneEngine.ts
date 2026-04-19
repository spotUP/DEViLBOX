/**
 * ZxtuneEngine.ts - Singleton WASM engine wrapper for ZXTune replayer
 *
 * Plays ~35 ZX Spectrum chiptune formats (PT3, PT2, STC, VTX, PSG, AY, etc.)
 * Follows the HippelEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class ZxtuneEngine extends WASMSingletonBase {
  private static instance: ZxtuneEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(ZxtuneEngine.cache);
  }

  static getInstance(): ZxtuneEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !ZxtuneEngine.instance ||
      ZxtuneEngine.instance._disposed ||
      ZxtuneEngine.instance.audioContext !== currentCtx
    ) {
      if (ZxtuneEngine.instance && !ZxtuneEngine.instance._disposed) {
        ZxtuneEngine.instance.dispose();
      }
      ZxtuneEngine.instance = new ZxtuneEngine();
    }
    return ZxtuneEngine.instance;
  }

  static hasInstance(): boolean {
    return !!ZxtuneEngine.instance && !ZxtuneEngine.instance._disposed;
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'zxtune',
      workletFile: 'Zxtune.worklet.js',
      wasmFile: 'Zxtune.wasm',
      jsFile: 'Zxtune.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'zxtune-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[ZxtuneEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[ZxtuneEngine] Module loaded');
          break;
        case 'error':
          console.error('[ZxtuneEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: ZxtuneEngine.cache.wasmBinary, jsCode: ZxtuneEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('ZxtuneEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (ZxtuneEngine.instance === this) ZxtuneEngine.instance = null;
  }
}
