/**
 * IxalanceEngine.ts - Singleton WASM engine wrapper for Ixalance (IXS) replayer
 *
 * Manages the AudioWorklet node for Ixalance module playback.
 * Follows the JamCrackerEngine/FCEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class IxalanceEngine extends WASMSingletonBase {
  private static instance: IxalanceEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(IxalanceEngine.cache);
  }

  static getInstance(): IxalanceEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !IxalanceEngine.instance ||
      IxalanceEngine.instance._disposed ||
      IxalanceEngine.instance.audioContext !== currentCtx
    ) {
      if (IxalanceEngine.instance && !IxalanceEngine.instance._disposed) {
        IxalanceEngine.instance.dispose();
      }
      IxalanceEngine.instance = new IxalanceEngine();
    }
    return IxalanceEngine.instance;
  }

  static hasInstance(): boolean {
    return !!IxalanceEngine.instance && !IxalanceEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'ixalance',
      workletFile: 'Ixalance.worklet.js',
      wasmFile: 'Ixalance.wasm',
      jsFile: 'Ixalance.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'ixalance-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[IxalanceEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[IxalanceEngine] Module loaded');
          break;

        case 'error':
          console.error('[IxalanceEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: IxalanceEngine.cache.wasmBinary,
      jsCode: IxalanceEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('IxalanceEngine not initialized');

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

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (IxalanceEngine.instance === this) {
      IxalanceEngine.instance = null;
    }
  }
}
