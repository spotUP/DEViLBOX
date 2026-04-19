/**
 * BdEngine.ts - Singleton WASM engine wrapper for Ben Daglish replayer
 *
 * Follows the MaEngine singleton pattern.
 */

import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class BdEngine extends WASMSingletonBase {
  private static instance: BdEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(BdEngine.cache);
  }

  static getInstance(): BdEngine {
    if (!BdEngine.instance || BdEngine.instance._disposed) {
      BdEngine.instance = new BdEngine();
    }
    return BdEngine.instance;
  }

  static hasInstance(): boolean {
    return !!BdEngine.instance && !BdEngine.instance._disposed;
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'bd',
      workletFile: 'Bd.worklet.js',
      wasmFile: 'Bd.wasm',
      jsFile: 'Bd.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'bd-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[BdEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[BdEngine] Module loaded');
          break;
        case 'error':
          console.error('[BdEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: BdEngine.cache.wasmBinary, jsCode: BdEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('BdEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (BdEngine.instance === this) BdEngine.instance = null;
  }
}
