/**
 * PieceEngine.ts - Singleton WASM engine wrapper for the Aquaplus P/ECE music driver (.pmd)
 * replayer (piece-wasm/src/piece.cpp, clean-room): six parts of compiled MML command bytes,
 * mixed mono at 16 kHz. Follows the BeRoTrackerEngine pattern.
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

/** Where the sequencer is: driver ticks since the start (24 a quarter note). */
export interface PiecePositionUpdate {
  tick: number;
}

export class PieceEngine extends WASMChannelOutputsEngine {
  private static instance: PieceEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: PiecePositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(PieceEngine.cache);
  }

  static getInstance(): PieceEngine {
    if (PieceEngine.instance && !PieceEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (PieceEngine.instance.audioContext !== currentCtx) {
          PieceEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!PieceEngine.instance || PieceEngine.instance._disposed) {
      PieceEngine.instance = new PieceEngine();
    }
    return PieceEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PieceEngine.instance && !PieceEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'piece',
      workletFile: 'Piece.worklet.js',
      wasmFile: 'Piece.wasm',
      jsFile: 'Piece.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One mix (mono on both sides); the replayer has no per-part outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'piece-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PieceEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[PieceEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ tick: data.tick });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[PieceEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: PieceEngine.cache.wasmBinary, jsCode: PieceEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PieceEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Live edit: overwrite bytes of the song file at a file offset (same length, e.g. a note byte 0x80+n or a length byte); heard when a part next reads them. */
  poke(offset: number, bytes: Uint8Array): void {
    this.workletNode?.port.postMessage({ type: 'poke', offset, bytes: bytes.slice() });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: PiecePositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (PieceEngine.instance === this) PieceEngine.instance = null;
  }
}
