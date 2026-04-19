/**
 * MdxminiEngine.ts - Singleton WASM engine wrapper for mdxmini MDX player
 *
 * Follows the Sc68Engine/ZxtuneEngine singleton pattern.
 * Plays Sharp X68000 MDX files with built-in YM2151 emulation.
 */

import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class MdxminiEngine extends WASMSingletonBase {
  private static instance: MdxminiEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(MdxminiEngine.cache);
  }

  static getInstance(): MdxminiEngine {
    if (!MdxminiEngine.instance || MdxminiEngine.instance._disposed) {
      MdxminiEngine.instance = new MdxminiEngine();
    }
    return MdxminiEngine.instance;
  }

  static hasInstance(): boolean {
    return !!MdxminiEngine.instance && !MdxminiEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'mdxmini',
      workletFile: 'Mdxmini.worklet.js',
      wasmFile: 'Mdxmini.wasm',
      jsFile: 'Mdxmini.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'mdxmini-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[MdxminiEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[MdxminiEngine] MDX module loaded');
          break;
        case 'pdxLoaded':
          console.log('[MdxminiEngine] PDX samples loaded');
          break;
        case 'error':
          console.error('[MdxminiEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: MdxminiEngine.cache.wasmBinary, jsCode: MdxminiEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MdxminiEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  async loadPdx(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MdxminiEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadPdx', pdxData: buffer });
  }

  play(): void { /* MDX starts playing immediately on load */ }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (MdxminiEngine.instance === this) MdxminiEngine.instance = null;
  }
}
