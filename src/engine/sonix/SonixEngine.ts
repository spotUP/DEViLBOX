/**
 * SonixEngine.ts - Singleton WASM engine wrapper for Sonix Music Driver
 *
 * Supports SNX, SMUS, and TINY Sonix music formats.
 * Manages the AudioWorklet node for Sonix module playback.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export interface SonixMeta {
  format: string;
  numChannels: number;
  numInstruments: number;
  numSamples: number;
}

export class SonixEngine extends WASMSingletonBase {
  private static instance: SonixEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _meta: SonixMeta | null = null;

  private constructor() {
    super();
    this.initialize(SonixEngine.cache);
  }

  static getInstance(): SonixEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !SonixEngine.instance ||
      SonixEngine.instance._disposed ||
      SonixEngine.instance.audioContext !== currentCtx
    ) {
      if (SonixEngine.instance && !SonixEngine.instance._disposed) {
        SonixEngine.instance.dispose();
      }
      SonixEngine.instance = new SonixEngine();
    }
    return SonixEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SonixEngine.instance && !SonixEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sonix',
      workletFile: 'Sonix.worklet.js',
      wasmFile: 'Sonix.wasm',
      jsFile: 'Sonix.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sonix-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SonixEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          this._meta = data.meta || null;
          console.log('[SonixEngine] Module loaded:', this._meta);
          break;

        case 'error':
          console.error('[SonixEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SonixEngine.cache.wasmBinary,
      jsCode: SonixEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer, sidecarFiles?: Array<{ path: string; data: ArrayBuffer }>): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SonixEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer, sidecarFiles: sidecarFiles || [] },
    );
  }

  get meta(): SonixMeta | null {
    return this._meta;
  }

  play(): void {
    // Playback starts automatically after loadModule
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setSoloChannel(channel: number): void {
    this.workletNode?.port.postMessage({ type: 'setSoloChannel', channel });
  }

  setStereoMix(mix: number): void {
    this.workletNode?.port.postMessage({ type: 'setStereoMix', mix });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (SonixEngine.instance === this) {
      SonixEngine.instance = null;
    }
  }
}
