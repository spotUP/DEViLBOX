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
import { decodeJxsModule, jxsPlayRange } from '@lib/import/formats/jxsGrid';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { actionamicsTransform } from '@engine/actionamics/ActionamicsEngine';

/** Where the replayer is, in the engine position contract: the index into songPositions and the row (0..63). */
export interface JxsPositionUpdate {
  songPos: number;
  row: number;
}

/** Voices a JayTrax song can carry (the replayer's channel table). */
export const JXS_MAX_VOICES = 16;

export class JxsEngine extends WASMChannelOutputsEngine {
  private static instance: JxsEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  /** Bars one pass plays (jxsPlayRange): songPositions[0] = firstBar. */
  private _range = { firstBar: 0, lastBar: Number.MAX_SAFE_INTEGER };
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
    // The main mix plus one output per voice the format can carry; the worklet renders every voice into its own buffer.
    this.workletNode = new AudioWorkletNode(ctx, 'jxs-processor', channelOutputNodeOptions(JXS_MAX_VOICES));

    this.workletNode.port.onmessage = (event) => this.handleWorkletMessage(event.data);

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: JxsEngine.cache.wasmBinary, jsCode: JxsEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  /** One message from the worklet. */
  handleWorkletMessage(data: {
    type: string; bar: number; step: number; message?: string;
    channels?: number | Int16Array[]; frame?: number; sampleRate?: number;
  }): void {
    switch (data.type) {
      case 'ready':
        console.log('[JxsEngine] WASM ready');
        this.markNodeReady();
        if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
        break;
      case 'moduleLoaded': {
        // The channel VU meters and the per-channel oscilloscopes read the oscilloscope store: one entry per voice.
        const voices = typeof data.channels === 'number' ? data.channels : 0;
        useOscilloscopeStore.getState().setChipInfo(voices, 0, Array.from({ length: voices }, (_, c) => `Channel ${c + 1}`));
        console.log('[JxsEngine] Module loaded, voices:', voices);
        break;
      }
      case 'oscData':
        // Per-voice audio from the worklet's DevilboxChannelStream.
        if (Array.isArray(data.channels)) {
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame ?? 0, data.sampleRate ?? 0);
        }
        break;
      case 'position':
        // Outside the played range: the pre-roll before the first row (start step - 1) and the loop bar the
        // engine parks on when it ends. Neither is a played row, so the grid is not moved there.
        if (data.bar < this._range.firstBar || data.bar > this._range.lastBar) break;
        for (const cb of this._positionCallbacks) cb({ songPos: data.bar - this._range.firstBar, row: data.step });
        break;
      case 'songEnd':
        this._songEndCallback?.();
        break;
      case 'error':
        console.error('[JxsEngine]', data.message);
        break;
    }
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('JxsEngine not initialized');
    const m = decodeJxsModule(new Uint8Array(buffer));
    this._range = m ? jxsPlayRange(m) : { firstBar: 0, lastBar: Number.MAX_SAFE_INTEGER };
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
