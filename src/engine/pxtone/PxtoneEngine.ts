/**
 * PxtoneEngine.ts - Singleton WASM engine wrapper for PxTone replayer
 *
 * Manages the AudioWorklet node for PxTone Collage module playback.
 * Follows the JamCrackerEngine/FCEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class PxtoneEngine extends WASMSingletonBase {
  private static instance: PxtoneEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(PxtoneEngine.cache);
  }

  static getInstance(): PxtoneEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!PxtoneEngine.instance || PxtoneEngine.instance._disposed ||
        PxtoneEngine.instance.audioContext !== currentCtx) {
      if (PxtoneEngine.instance && !PxtoneEngine.instance._disposed) {
        PxtoneEngine.instance.dispose();
      }
      PxtoneEngine.instance = new PxtoneEngine();
    }
    return PxtoneEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PxtoneEngine.instance && !PxtoneEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'pxtone',
      workletFile: 'Pxtone.worklet.js',
      wasmFile: 'Pxtone.wasm',
      jsFile: 'Pxtone.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'pxtone-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PxtoneEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[PxtoneEngine] Module loaded');
          break;

        case 'error':
          console.error('[PxtoneEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: PxtoneEngine.cache.wasmBinary,
      jsCode: PxtoneEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PxtoneEngine not initialized');

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

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (PxtoneEngine.instance === this) {
      PxtoneEngine.instance = null;
    }
  }
}
