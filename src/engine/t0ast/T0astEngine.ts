/**
 * T0astEngine.ts - Singleton WASM engine wrapper for the T0AST (.t0ast) replayer
 * (t0ast-wasm/src/bbmp-t0ast.cpp, clean-room): BeRo's 16-channel softsynth tracker, engine at
 * 44100 Hz. Follows the SynderEngine pattern.
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

/** Where the sequencer is: songPos = order position, row = pattern row. */
export interface T0astPositionUpdate {
  songPos: number;
  row: number;
}

export class T0astEngine extends WASMChannelOutputsEngine {
  private static instance: T0astEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: T0astPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(T0astEngine.cache);
  }

  static getInstance(): T0astEngine {
    if (T0astEngine.instance && !T0astEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (T0astEngine.instance.audioContext !== currentCtx) {
          T0astEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!T0astEngine.instance || T0astEngine.instance._disposed) {
      T0astEngine.instance = new T0astEngine();
    }
    return T0astEngine.instance;
  }

  static hasInstance(): boolean {
    return !!T0astEngine.instance && !T0astEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 't0ast',
      workletFile: 'T0ast.worklet.js',
      wasmFile: 'T0ast.wasm',
      jsFile: 'T0ast.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-channel outputs.
    this.workletNode = new AudioWorkletNode(ctx, 't0ast-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[T0astEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[T0astEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ songPos: data.songPos, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[T0astEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: T0astEngine.cache.wasmBinary, jsCode: T0astEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('T0astEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Live edit: write bytes into the decoded cells, offset ((pattern * 64 + row) * 16 + channel) * 6 + field (note, vol, fxA, fxB, parA, parB); heard when that row is next played. */
  poke(offset: number, bytes: Uint8Array): void {
    this.workletNode?.port.postMessage({ type: 'poke', offset, bytes: bytes.slice() });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: T0astPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (T0astEngine.instance === this) T0astEngine.instance = null;
  }
}
