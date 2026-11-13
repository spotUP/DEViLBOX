/**
 * KdmEngine.ts - Singleton WASM engine wrapper for Ken Silverman's Digital Music
 * replayer (kdm-wasm/src/kdm_engine.c). Whole-song replayer: the WASM engine sequences
 * the notes and renders the audio; the instrument bank waves.kwv is fetched once and
 * handed to the worklet at init. Follows the MonotoneEngine pattern.
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

/** Where the replayer is: the tick (1/120 s) it last rendered. */
export interface KdmPositionUpdate {
  tick: number;
}

export class KdmEngine extends WASMChannelOutputsEngine {
  private static instance: KdmEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();
  /** waves.kwv, Ken's instrument bank, fetched once. */
  private static bank: Promise<ArrayBuffer> | null = null;

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: KdmPositionUpdate) => void>();

  private constructor() {
    super();
    this.initialize(KdmEngine.cache);
  }

  static getInstance(): KdmEngine {
    if (KdmEngine.instance && !KdmEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (KdmEngine.instance.audioContext !== currentCtx) {
          KdmEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!KdmEngine.instance || KdmEngine.instance._disposed) {
      KdmEngine.instance = new KdmEngine();
    }
    return KdmEngine.instance;
  }

  static hasInstance(): boolean {
    return !!KdmEngine.instance && !KdmEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'kdm',
      workletFile: 'Kdm.worklet.js',
      wasmFile: 'Kdm.wasm',
      jsFile: 'Kdm.js',
      // Same emscripten ES-module glue rewrite as every other whole-song engine.
      transformJS: actionamicsTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    // One stereo mix; the replayer has no per-voice outputs.
    this.workletNode = new AudioWorkletNode(ctx, 'kdm-processor', channelOutputNodeOptions(1));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[KdmEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          this.settleModuleLoad();
          console.log('[KdmEngine] Module loaded');
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ tick: data.tick });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[KdmEngine]', data.message);
          this.failModuleLoad(String(data.message ?? 'module load failed'));
          break;
      }
    };

    const baseUrl = import.meta.env.BASE_URL || '/';
    KdmEngine.bank ??= fetch(`${baseUrl}kdm/waves.kwv`).then((r) => {
      if (!r.ok) throw new Error(`waves.kwv: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    void KdmEngine.bank.then((bankData) => {
      this.workletNode?.port.postMessage({
        type: 'init', sampleRate: ctx.sampleRate,
        wasmBinary: KdmEngine.cache.wasmBinary, jsCode: KdmEngine.cache.jsCode, bankData,
      });
    }, (err) => { KdmEngine.bank = null; console.error('[KdmEngine]', err); });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('KdmEngine not initialized');
    const answered = this.beginModuleLoad();
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
    await answered;
  }

  /** Swap in an edited song while it plays (the replayer reopens it at the same tick). */
  replaceModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'replaceModule', moduleData: buffer });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  onPositionUpdate(cb: (update: KdmPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (KdmEngine.instance === this) KdmEngine.instance = null;
  }
}
