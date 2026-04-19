/**
 * CpsycleEngine.ts - Singleton WASM engine wrapper for Cpsycle (Psycle tracker) replayer
 *
 * Manages the AudioWorklet node for Psycle module playback.
 * Follows the JamCrackerEngine/FCEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class CpsycleEngine extends WASMSingletonBase {
  private static instance: CpsycleEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(CpsycleEngine.cache);
  }

  static getInstance(): CpsycleEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !CpsycleEngine.instance ||
      CpsycleEngine.instance._disposed ||
      CpsycleEngine.instance.audioContext !== currentCtx
    ) {
      if (CpsycleEngine.instance && !CpsycleEngine.instance._disposed) {
        CpsycleEngine.instance.dispose();
      }
      CpsycleEngine.instance = new CpsycleEngine();
    }
    return CpsycleEngine.instance;
  }

  static hasInstance(): boolean {
    return !!CpsycleEngine.instance && !CpsycleEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'cpsycle',
      workletFile: 'Cpsycle.worklet.js',
      wasmFile: 'Cpsycle.wasm',
      jsFile: 'Cpsycle.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'cpsycle-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[CpsycleEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[CpsycleEngine] Module loaded');
          break;

        case 'error':
          console.error('[CpsycleEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: CpsycleEngine.cache.wasmBinary,
      jsCode: CpsycleEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('CpsycleEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  override dispose(): void {
    super.dispose();
    if (CpsycleEngine.instance === this) {
      CpsycleEngine.instance = null;
    }
  }
}
