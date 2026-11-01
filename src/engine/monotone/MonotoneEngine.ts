/**
 * MonotoneEngine.ts — Singleton WASM engine wrapper for the MONOTONE replayer
 * (Trixter's PC speaker tracker; monotone-wasm/src/monotone.c).
 * Whole-song replayer: loads the entire .MON file, WASM handles sequencing + audio.
 * Follows the ActionamicsEngine pattern.
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

/** Where the replayer is: the order position and the row within its pattern. */
export interface MonotonePositionUpdate {
  songPos: number;
  row: number;
}

export class MonotoneEngine extends WASMChannelOutputsEngine {
  private static instance: MonotoneEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: MonotonePositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(MonotoneEngine.cache);
  }

  static getInstance(): MonotoneEngine {
    if (MonotoneEngine.instance && !MonotoneEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (MonotoneEngine.instance.audioContext !== currentCtx) {
          MonotoneEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!MonotoneEngine.instance || MonotoneEngine.instance._disposed) {
      MonotoneEngine.instance = new MonotoneEngine();
    }
    return MonotoneEngine.instance;
  }

  static hasInstance(): boolean {
    return !!MonotoneEngine.instance && !MonotoneEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'monotone',
      workletFile: 'Monotone.worklet.js',
      wasmFile: 'Monotone.wasm',
      jsFile: 'Monotone.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One speaker voice (the worklet renders the PC speaker mix as a single channel).
    this.workletNode = new AudioWorkletNode(ctx, 'monotone-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[MonotoneEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[MonotoneEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ songPos: data.position, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[MonotoneEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: MonotoneEngine.cache.wasmBinary, jsCode: MonotoneEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MonotoneEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Swap in an edited module's cells and order while it plays (the replayer keeps its place). */
  replaceModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'replaceModule', moduleData: buffer });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelMask', mask });
  }

  onPositionUpdate(cb: (update: MonotonePositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /** Edit one pattern cell (the 16-bit MONOTONE word) in the WASM replayer. */
  setCell(pattern: number, row: number, channel: number, cell: number): void {
    this.workletNode?.port.postMessage({ type: 'setCell', pattern, row, channel, cell });
  }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (MonotoneEngine.instance === this) MonotoneEngine.instance = null;
  }
}
