/**
 * AxsEngine.ts - Singleton WASM engine wrapper for the AXS (AXSF) song replayer
 * (axs-wasm/src/axs.cpp, clean-room): up to 16 tracks of 7 synth instruments plus a drum
 * sampler, stereo at 44.1 kHz. Follows the AxsEngine pattern.
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

/** Where the sequencer is: song position and row. */
export interface AxsPositionUpdate {
  position: number;
  row: number;
}

export class AxsEngine extends WASMChannelOutputsEngine {
  private static instance: AxsEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: AxsPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(AxsEngine.cache);
  }

  static getInstance(): AxsEngine {
    if (AxsEngine.instance && !AxsEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (AxsEngine.instance.audioContext !== currentCtx) {
          AxsEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!AxsEngine.instance || AxsEngine.instance._disposed) {
      AxsEngine.instance = new AxsEngine();
    }
    return AxsEngine.instance;
  }

  static hasInstance(): boolean {
    return !!AxsEngine.instance && !AxsEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'axs',
      workletFile: 'Axs.worklet.js',
      wasmFile: 'Axs.wasm',
      jsFile: 'Axs.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-track outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'axs-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[AxsEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[AxsEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ position: data.position, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[AxsEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: AxsEngine.cache.wasmBinary, jsCode: AxsEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('AxsEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Live edit: set one cell (block, track, row, raw note/vel/cmd/par); heard when the row next plays. */
  setCell(block: number, track: number, row: number, note: number, vel: number, cmd: number, par: number): void {
    this.workletNode?.port.postMessage({ type: 'setCell', block, track, row, note, vel, cmd, par });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: AxsPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (AxsEngine.instance === this) AxsEngine.instance = null;
  }
}
