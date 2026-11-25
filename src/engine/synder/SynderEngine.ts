/**
 * SynderEngine.ts - Singleton WASM engine wrapper for the Synder SNG-Player (.sng, SYN magic)
 * replayer (synder-wasm/src/bbmp-synder.cpp, clean-room): per-frame synthesizer parameters
 * recorded from C64 tunes, played on DSynth's wavetable synthesizer at 48000 Hz. Follows the BuzEngine pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';
import { actionamicsTransform } from '@engine/actionamics/ActionamicsEngine';

/** Where the replayer is: the frame taken up last, as songPos = frame / 64 and row = frame % 64. */
export interface SynderPositionUpdate {
  songPos: number;
  row: number;
}

export class SynderEngine extends WASMChannelOutputsEngine {
  private static instance: SynderEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: SynderPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(SynderEngine.cache);
  }

  static getInstance(): SynderEngine {
    if (SynderEngine.instance && !SynderEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (SynderEngine.instance.audioContext !== currentCtx) {
          SynderEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!SynderEngine.instance || SynderEngine.instance._disposed) {
      SynderEngine.instance = new SynderEngine();
    }
    return SynderEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SynderEngine.instance && !SynderEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'synder',
      workletFile: 'Synder.worklet.js',
      wasmFile: 'Synder.wasm',
      jsFile: 'Synder.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-voice outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'synder-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SynderEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[SynderEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ songPos: data.songPos, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[SynderEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: SynderEngine.cache.wasmBinary, jsCode: SynderEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SynderEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Live edit: write bytes at an offset into the unpacked planar frame data (heard when that frame is next taken up). */
  poke(offset: number, bytes: Uint8Array): void {
    this.workletNode?.port.postMessage({ type: 'poke', offset, bytes: bytes.slice() });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: SynderPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (SynderEngine.instance === this) SynderEngine.instance = null;
  }
}
