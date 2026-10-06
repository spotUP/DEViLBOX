/**
 * FredReplayerEngine.ts — Singleton WASM engine wrapper for FredReplayer replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { decodeFredModule } from '@/lib/import/formats/FredEditorModule';
import { FRED_ROWS_PER_PATTERN, walkFredSong } from '@/lib/import/formats/fredEditorGrid';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** FredReplayer Emscripten output needs extended script-replaces + chained-HEAP. */
export function fredReplayerTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export interface FredPositionUpdate {
  /** The grid pattern the replayer is in (64 lines each). */
  songPos: number;
  /** The row within it. */
  row: number;
}

/** The grid's length in lines for a module, 0 when it cannot be walked. */
function gridLinesOf(buffer: ArrayBuffer): number {
  try {
    const m = decodeFredModule(new Uint8Array(buffer));
    return m ? walkFredSong(m, 0).lines : 0;
  } catch { return 0; }
}

export class FredReplayerEngine extends WASMChannelOutputsEngine {
  private static instance: FredReplayerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: FredPositionUpdate) => void>();
  /** Lines in the grid (the walk's length): the replayer keeps looping past it. */
  private _gridLines = 0;

  private constructor() {
    super();
    this.initialize(FredReplayerEngine.cache);
  }

  static getInstance(): FredReplayerEngine {
    if (FredReplayerEngine.instance && !FredReplayerEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (FredReplayerEngine.instance.audioContext !== currentCtx) {
          FredReplayerEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!FredReplayerEngine.instance || FredReplayerEngine.instance._disposed) {
      FredReplayerEngine.instance = new FredReplayerEngine();
    }
    return FredReplayerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!FredReplayerEngine.instance && !FredReplayerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'fred-replayer',
      workletFile: 'FredReplayer.worklet.js',
      wasmFile: 'FredReplayer.wasm',
      jsFile: 'FredReplayer.js',
      transformJS: fredReplayerTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'fred-replayer-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[FredReplayerEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[FredReplayerEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'position': {
          // The replayer's own line counter as the grid's pattern and row (fredEditorGrid.ts).
          const line = this._gridLines > 0 ? data.line % this._gridLines : data.line;
          const songPos = Math.floor(line / FRED_ROWS_PER_PATTERN);
          for (const cb of this._positionCallbacks) cb({ songPos, row: line - songPos * FRED_ROWS_PER_PATTERN });
          break;
        }
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[FredReplayerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: FredReplayerEngine.cache.wasmBinary, jsCode: FredReplayerEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('FredReplayerEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
    this._gridLines = gridLinesOf(buffer);
  }

  onPositionUpdate(cb: (update: FredPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
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

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /**
   * Play an edited module (grid edits re-encoded by applyFredGridEdits) without
   * restarting: the replayer swaps the song data and every voice keeps its place.
   */
  replaceModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'replaceModule', moduleData: buffer });
    this._gridLines = gridLinesOf(buffer);
  }

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (FredReplayerEngine.instance === this) FredReplayerEngine.instance = null;
  }
}
