/**
 * SonicArrangerEngine.ts — Singleton WASM engine wrapper for Sonic Arranger replayer
 *
 * Whole-song replayer: loads the entire .sa file, WASM handles sequencing + audio.
 * Follows the BdEngine singleton pattern.
 */

import { PositionCallbacks, type EnginePositionUpdate } from '@engine/wasm/PositionCallbacks';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** SonicArranger Emscripten output needs extended script-replaces + chained-HEAP. */
export function sonicArrangerTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class SonicArrangerEngine extends WASMChannelOutputsEngine {
  private static instance: SonicArrangerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private readonly _positions = new PositionCallbacks();

  private _songEndCallback: (() => void) | null = null;

  private constructor() {
    super();
    this.initialize(SonicArrangerEngine.cache);
  }

  static getInstance(): SonicArrangerEngine {
    if (SonicArrangerEngine.instance && !SonicArrangerEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (SonicArrangerEngine.instance.audioContext !== currentCtx) {
          SonicArrangerEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!SonicArrangerEngine.instance || SonicArrangerEngine.instance._disposed) {
      SonicArrangerEngine.instance = new SonicArrangerEngine();
    }
    return SonicArrangerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SonicArrangerEngine.instance && !SonicArrangerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sonic-arranger',
      workletFile: 'SonicArranger.worklet.js',
      wasmFile: 'SonicArranger.wasm',
      jsFile: 'SonicArranger.js',
      transformJS: sonicArrangerTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'sonic-arranger-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SonicArrangerEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[SonicArrangerEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'position':
          this._positions.emit(data);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[SonicArrangerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: SonicArrangerEngine.cache.wasmBinary, jsCode: SonicArrangerEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SonicArrangerEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
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

  onSongEnd(callback: () => void): void {
    this._songEndCallback = callback;
  }

  /** Edit a cell of the replayer's own track pool (its index and row, not the grid's pattern). */
  setTrackCell(index: number, row: number, note: number, instrument: number, arpeggio: number, effect: number, effectArg: number): void {
    this.workletNode?.port.postMessage({ type: 'setTrackCell', index, row, note, instrument, arpeggio, effect, effectArg });
  }

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  /** The row and song-order index the replayer is on, as the grid shows them. */
  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
  }

  override dispose(): void {
    this._positions.clear();
    super.dispose();
    if (SonicArrangerEngine.instance === this) SonicArrangerEngine.instance = null;
  }
}
