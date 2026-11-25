/**
 * SmxEngine.ts - Singleton WASM engine wrapper for the SCC-Musixx (.sng, MSX + Konami SCC)
 * replayer (smx-wasm/src/smx_engine.cpp, clean-room, driving emu2212). Whole-song replayer:
 * the WASM engine sequences the notes and renders the audio. Follows the BuzEngine pattern.
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

/** Where the replayer is: the order position (songPos) and the pattern row (0..63) read last. */
export interface SmxPositionUpdate {
  songPos: number;
  row: number;
}

export class SmxEngine extends WASMChannelOutputsEngine {
  private static instance: SmxEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: SmxPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(SmxEngine.cache);
  }

  static getInstance(): SmxEngine {
    if (SmxEngine.instance && !SmxEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (SmxEngine.instance.audioContext !== currentCtx) {
          SmxEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!SmxEngine.instance || SmxEngine.instance._disposed) {
      SmxEngine.instance = new SmxEngine();
    }
    return SmxEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SmxEngine.instance && !SmxEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'smx',
      workletFile: 'Smx.worklet.js',
      wasmFile: 'Smx.wasm',
      jsFile: 'Smx.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-voice outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'smx-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SmxEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[SmxEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ songPos: data.songPos, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[SmxEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: SmxEngine.cache.wasmBinary, jsCode: SmxEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SmxEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Live edit: write song bytes at a file offset into the replayer's image (heard at the next row read). */
  poke(offset: number, bytes: Uint8Array): void {
    this.workletNode?.port.postMessage({ type: 'poke', offset, bytes: bytes.slice() });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: SmxPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (SmxEngine.instance === this) SmxEngine.instance = null;
  }
}
