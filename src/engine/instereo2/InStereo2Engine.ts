/**
 * InStereo2Engine.ts — Singleton WASM engine wrapper for InStereo2 replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export function instereo2Transform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export interface InStereo2PositionUpdate {
  songPos: number;
  row: number;
}

export class InStereo2Engine extends WASMChannelOutputsEngine {
  private static instance: InStereo2Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks: Set<(update: InStereo2PositionUpdate) => void> = new Set();

  private constructor() {
    super();
    this.initialize(InStereo2Engine.cache);
  }

  static getInstance(): InStereo2Engine {
    if (InStereo2Engine.instance && !InStereo2Engine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (InStereo2Engine.instance.audioContext !== currentCtx) {
          InStereo2Engine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!InStereo2Engine.instance || InStereo2Engine.instance._disposed) {
      InStereo2Engine.instance = new InStereo2Engine();
    }
    return InStereo2Engine.instance;
  }

  static hasInstance(): boolean {
    return !!InStereo2Engine.instance && !InStereo2Engine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'instereo2',
      workletFile: 'InStereo2.worklet.js',
      wasmFile: 'InStereo2.wasm',
      jsFile: 'InStereo2.js',
      transformJS: instereo2Transform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'instereo2-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[InStereo2Engine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[InStereo2Engine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'position':
          for (const cb of this._positionCallbacks) cb({ songPos: data.songPos, row: data.row });
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[InStereo2Engine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: InStereo2Engine.cache.wasmBinary, jsCode: InStereo2Engine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('InStereo2Engine not initialized');
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
  /** One key: the replayer's instrument number (1-63 synth, 64-127 sample) at its note (index into its period table, 1-108). */
  noteOn(instrument: number, note: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrument, note });
  }
  noteOff(): void { this.workletNode?.port.postMessage({ type: 'noteOff' }); }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /** The replayer's song position (the grid's pattern index) and row, as it moves. */
  onPositionUpdate(cb: (update: InStereo2PositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => { this._positionCallbacks.delete(cb); };
  }

  /** Edit a cell of the replayer's own track pool (its index and row, not the grid's pattern). */
  setTrackCell(index: number, row: number, note: number, instrument: number, arpeggio: number, effect: number, effectArg: number): void {
    this.workletNode?.port.postMessage({ type: 'setTrackCell', index, row, note, instrument, arpeggio, effect, effectArg });
  }

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    super.dispose();
    this._positionCallbacks.clear();
    if (InStereo2Engine.instance === this) InStereo2Engine.instance = null;
  }
}
