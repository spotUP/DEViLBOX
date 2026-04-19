/**
 * AsapEngine.ts - Singleton WASM engine wrapper for ASAP (Another Slight Atari Player)
 *
 * Manages the AudioWorklet node for Atari 8-bit POKEY music playback.
 * Supports SAP, CMC, RMT, TMC, DLT, MPT and more.
 * Follows the OrganyaEngine/Sc68Engine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class AsapEngine extends WASMSingletonBase {
  private static instance: AsapEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(AsapEngine.cache);
  }

  static getInstance(): AsapEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!AsapEngine.instance || AsapEngine.instance._disposed ||
        AsapEngine.instance.audioContext !== currentCtx) {
      if (AsapEngine.instance && !AsapEngine.instance._disposed) {
        AsapEngine.instance.dispose();
      }
      AsapEngine.instance = new AsapEngine();
    }
    return AsapEngine.instance;
  }

  static hasInstance(): boolean {
    return !!AsapEngine.instance && !AsapEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'asap',
      workletFile: 'Asap.worklet.js',
      wasmFile: 'Asap.wasm',
      jsFile: 'Asap.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'asap-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[AsapEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[AsapEngine] Module loaded', data.meta);
          break;

        case 'error':
          console.error('[AsapEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: AsapEngine.cache.wasmBinary,
      jsCode: AsapEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer, filename?: string): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('AsapEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer, filename: filename || 'tune.sap' },
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

  playSong(song: number): void {
    this.workletNode?.port.postMessage({ type: 'playSong', song });
  }

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (AsapEngine.instance === this) {
      AsapEngine.instance = null;
    }
  }
}
