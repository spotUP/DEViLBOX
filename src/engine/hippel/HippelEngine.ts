/**
 * HippelEngine.ts - Singleton WASM engine wrapper for Jochen Hippel replayer
 *
 * Follows the JamCrackerEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class HippelEngine extends WASMSingletonBase {
  private static instance: HippelEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(HippelEngine.cache);
  }

  static getInstance(): HippelEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!HippelEngine.instance || HippelEngine.instance._disposed ||
        HippelEngine.instance.audioContext !== currentCtx) {
      if (HippelEngine.instance && !HippelEngine.instance._disposed) {
        HippelEngine.instance.dispose();
      }
      HippelEngine.instance = new HippelEngine();
    }
    return HippelEngine.instance;
  }

  static hasInstance(): boolean {
    return !!HippelEngine.instance && !HippelEngine.instance._disposed;
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'hippel',
      workletFile: 'Hippel.worklet.js',
      wasmFile: 'Hippel.wasm',
      jsFile: 'Hippel.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'hippel-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[HippelEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[HippelEngine] Module loaded');
          break;
        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            for (let i = 0; i < levels.length; i++) {
              engine.triggerChannelMeter(i, levels[i]);
            }
          } catch { /* ToneEngine not ready */ }
          break;
        case 'error':
          console.error('[HippelEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: HippelEngine.cache.wasmBinary, jsCode: HippelEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('HippelEngine not initialized');
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
    if (HippelEngine.instance === this) HippelEngine.instance = null;
  }
}
