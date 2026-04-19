/**
 * Sc68Engine.ts - Singleton WASM engine wrapper for SC68/SNDH replayer
 *
 * Follows the JamCrackerEngine/PreTrackerEngine/HippelEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class Sc68Engine extends WASMSingletonBase {
  private static instance: Sc68Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(Sc68Engine.cache);
  }

  static getInstance(): Sc68Engine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !Sc68Engine.instance ||
      Sc68Engine.instance._disposed ||
      Sc68Engine.instance.audioContext !== currentCtx
    ) {
      if (Sc68Engine.instance && !Sc68Engine.instance._disposed) {
        Sc68Engine.instance.dispose();
      }
      Sc68Engine.instance = new Sc68Engine();
    }
    return Sc68Engine.instance;
  }

  static hasInstance(): boolean {
    return !!Sc68Engine.instance && !Sc68Engine.instance._disposed;
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sc68',
      workletFile: 'Sc68.worklet.js',
      wasmFile: 'Sc68.wasm',
      jsFile: 'Sc68.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'sc68-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[Sc68Engine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[Sc68Engine] Module loaded');
          break;
        case 'error':
          console.error('[Sc68Engine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: Sc68Engine.cache.wasmBinary, jsCode: Sc68Engine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('Sc68Engine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (Sc68Engine.instance === this) Sc68Engine.instance = null;
  }
}
