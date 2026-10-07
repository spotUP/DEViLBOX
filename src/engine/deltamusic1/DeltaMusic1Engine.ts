/**
 * DeltaMusic1Engine.ts — Singleton WASM engine wrapper for DeltaMusic1 replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
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

function deltamusic1Transform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class DeltaMusic1Engine extends WASMChannelOutputsEngine {
  private static instance: DeltaMusic1Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private readonly _positions = new PositionCallbacks();

  private _songEndCallback: (() => void) | null = null;

  private constructor() {
    super();
    this.initialize(DeltaMusic1Engine.cache);
  }

  static getInstance(): DeltaMusic1Engine {
    if (DeltaMusic1Engine.instance && !DeltaMusic1Engine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (DeltaMusic1Engine.instance.audioContext !== currentCtx) {
          DeltaMusic1Engine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!DeltaMusic1Engine.instance || DeltaMusic1Engine.instance._disposed) {
      DeltaMusic1Engine.instance = new DeltaMusic1Engine();
    }
    return DeltaMusic1Engine.instance;
  }

  static hasInstance(): boolean {
    return !!DeltaMusic1Engine.instance && !DeltaMusic1Engine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'deltamusic1',
      workletFile: 'DeltaMusic1.worklet.js',
      wasmFile: 'DeltaMusic1.wasm',
      jsFile: 'DeltaMusic1.js',
      transformJS: deltamusic1Transform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'deltamusic1-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[DeltaMusic1Engine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[DeltaMusic1Engine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'position':
          this._positions.emit(data);
          break;
        case 'error':
          console.error('[DeltaMusic1Engine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: DeltaMusic1Engine.cache.wasmBinary, jsCode: DeltaMusic1Engine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('DeltaMusic1Engine not initialized');
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

  /** Hand the worklet the song's bytes for its keyboard copy of the module. */
  previewLoad(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'previewLoad', buffer });
  }
  /** One key: the 0-based instrument at the replayer's note (a period-table index). */
  noteOn(instrument: number, note: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrument, note });
  }
  noteOff(): void { this.workletNode?.port.postMessage({ type: 'noteOff' }); }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

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
    if (DeltaMusic1Engine.instance === this) DeltaMusic1Engine.instance = null;
  }
}
