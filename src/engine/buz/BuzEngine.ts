/**
 * BuzEngine.ts - Singleton WASM engine wrapper for the Buzzic 1 / Buzzic 2 (.buz / .buz2) replayer
 * (buz-wasm/src/buz_engine.cpp, clean-room). Whole-song replayer: the WASM engine
 * sequences the notes and renders the audio. Follows the KdmEngine pattern.
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

/** Where the replayer is: the block (songPos) and the row inside it (0..15) last handed out. */
export interface BuzPositionUpdate {
  songPos: number;
  row: number;
}

export class BuzEngine extends WASMChannelOutputsEngine {
  private static instance: BuzEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: BuzPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(BuzEngine.cache);
  }

  static getInstance(): BuzEngine {
    if (BuzEngine.instance && !BuzEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (BuzEngine.instance.audioContext !== currentCtx) {
          BuzEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!BuzEngine.instance || BuzEngine.instance._disposed) {
      BuzEngine.instance = new BuzEngine();
    }
    return BuzEngine.instance;
  }

  static hasInstance(): boolean {
    return !!BuzEngine.instance && !BuzEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'buz',
      workletFile: 'Buz.worklet.js',
      wasmFile: 'Buz.wasm',
      jsFile: 'Buz.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-voice outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'buz-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[BuzEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[BuzEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ songPos: data.songPos, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[BuzEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: BuzEngine.cache.wasmBinary, jsCode: BuzEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('BuzEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Swap in an edited song while it plays (the replayer reopens it at the same song row). */
  replaceModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'replaceModule', moduleData: buffer });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: BuzPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (BuzEngine.instance === this) BuzEngine.instance = null;
  }
}
