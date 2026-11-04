/**
 * JxsEngine.ts - Singleton WASM engine wrapper for the JayTrax (.jxs) replayer
 * (jxs-wasm/src/jxs_engine.cpp, clean-room). Whole-song replayer: the WASM engine
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

/** Where the replayer is: the bar and the step (0..63) it last entered. */
export interface JxsPositionUpdate {
  bar: number;
  step: number;
}

export class JxsEngine extends WASMChannelOutputsEngine {
  private static instance: JxsEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: JxsPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(JxsEngine.cache);
  }

  static getInstance(): JxsEngine {
    if (JxsEngine.instance && !JxsEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (JxsEngine.instance.audioContext !== currentCtx) {
          JxsEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!JxsEngine.instance || JxsEngine.instance._disposed) {
      JxsEngine.instance = new JxsEngine();
    }
    return JxsEngine.instance;
  }

  static hasInstance(): boolean {
    return !!JxsEngine.instance && !JxsEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'jxs',
      workletFile: 'Jxs.worklet.js',
      wasmFile: 'Jxs.wasm',
      jsFile: 'Jxs.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-voice outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'jxs-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[JxsEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[JxsEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ bar: data.bar, step: data.step });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[JxsEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: JxsEngine.cache.wasmBinary, jsCode: JxsEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('JxsEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  /** Swap in an edited song while it plays (the replayer reopens it at the same bar and step). */
  replaceModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'replaceModule', moduleData: buffer });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: JxsPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (JxsEngine.instance === this) JxsEngine.instance = null;
  }
}
