/**
 * BeRoTrackerEngine.ts - Singleton WASM engine wrapper for the BeRoTracker (.brt) replayer
 * (berotracker-wasm/src/bbmp-berotracker.cpp, clean-room): BeRo's Impulse-Tracker-like tracker
 * with a floating-point mixer, engine at 44100 Hz. Follows the T0astEngine pattern.
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
export interface BeRoTrackerPositionUpdate {
  songPos: number;
  row: number;
}

export class BeRoTrackerEngine extends WASMChannelOutputsEngine {
  private static instance: BeRoTrackerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: BeRoTrackerPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(BeRoTrackerEngine.cache);
  }

  static getInstance(): BeRoTrackerEngine {
    if (BeRoTrackerEngine.instance && !BeRoTrackerEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (BeRoTrackerEngine.instance.audioContext !== currentCtx) {
          BeRoTrackerEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!BeRoTrackerEngine.instance || BeRoTrackerEngine.instance._disposed) {
      BeRoTrackerEngine.instance = new BeRoTrackerEngine();
    }
    return BeRoTrackerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!BeRoTrackerEngine.instance && !BeRoTrackerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'berotracker',
      workletFile: 'BeRoTracker.worklet.js',
      wasmFile: 'BeRoTracker.wasm',
      jsFile: 'BeRoTracker.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-channel outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'berotracker-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[BeRoTrackerEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[BeRoTrackerEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ songPos: data.songPos, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[BeRoTrackerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: BeRoTrackerEngine.cache.wasmBinary, jsCode: BeRoTrackerEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('BeRoTrackerEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Live edit: write bytes into one pattern's decoded cells, byte offset (channel * rows + row) * cellSize + field (note, ins, volcmd, vol, pan, filter, fx u16, param u16; cellSize from brt_cell_size, 10); heard when that row is next played. */
  poke(pattern: number, offset: number, bytes: Uint8Array): void {
    this.workletNode?.port.postMessage({ type: 'poke', pattern, offset, bytes: bytes.slice() });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: BeRoTrackerPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (BeRoTrackerEngine.instance === this) BeRoTrackerEngine.instance = null;
  }
}
