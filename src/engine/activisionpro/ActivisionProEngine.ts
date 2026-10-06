/**
 * ActivisionProEngine.ts — Singleton WASM engine wrapper for ActivisionPro replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { useFormatStore } from '@stores/useFormatStore';
import { decodeActivisionProModule } from '@/lib/import/formats/ActivisionProModule';
import { AVP_ROWS_PER_PATTERN, walkActivisionPro } from '@/lib/import/formats/activisionProGrid';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMChannelOutputsEngine,
  channelOutputNodeOptions,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** The grid's length in steps for a module, 0 when it cannot be walked. */
function gridRowsOf(buffer: ArrayBuffer): number {
  const m = decodeActivisionProModule(new Uint8Array(buffer));
  return m ? walkActivisionPro(m, 0).rows : 0;
}

export function activisionProTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export interface ActivisionProPositionUpdate {
  /** The grid pattern the replayer is in (64 steps each). */
  songPos: number;
  /** The row within it. */
  row: number;
}

export class ActivisionProEngine extends WASMChannelOutputsEngine {
  private static instance: ActivisionProEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private _positionCallbacks = new Set<(update: ActivisionProPositionUpdate) => void>();
  /** Steps in the grid (the walk's length): the replayer keeps looping past it. */
  private _gridRows = 0;

  private constructor() {
    super();
    this.initialize(ActivisionProEngine.cache);
  }

  static getInstance(): ActivisionProEngine {
    if (ActivisionProEngine.instance && !ActivisionProEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (ActivisionProEngine.instance.audioContext !== currentCtx) {
          ActivisionProEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!ActivisionProEngine.instance || ActivisionProEngine.instance._disposed) {
      ActivisionProEngine.instance = new ActivisionProEngine();
    }
    return ActivisionProEngine.instance;
  }

  static hasInstance(): boolean {
    return !!ActivisionProEngine.instance && !ActivisionProEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'activisionpro',
      workletFile: 'ActivisionPro.worklet.js',
      wasmFile: 'ActivisionPro.wasm',
      jsFile: 'ActivisionPro.js',
      transformJS: activisionProTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'activisionpro-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[ActivisionProEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[ActivisionProEngine] Module loaded, subsongs:', data.subsongCount);
          useFormatStore.getState().setActivisionProSubsongs(data.subsongCount ?? 1);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'position': {
          // The replayer's step counter as the grid's pattern and row (activisionProGrid.ts).
          const step = this._gridRows > 0 ? data.step % this._gridRows : data.step;
          const songPos = Math.floor(step / AVP_ROWS_PER_PATTERN);
          for (const cb of this._positionCallbacks) cb({ songPos, row: step - songPos * AVP_ROWS_PER_PATTERN });
          break;
        }
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[ActivisionProEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: ActivisionProEngine.cache.wasmBinary, jsCode: ActivisionProEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('ActivisionProEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
    this._gridRows = gridRowsOf(buffer);
  }

  /** Swap in an edited module's tracks while it plays (every voice keeps its place). */
  replaceModule(buffer: ArrayBuffer): void {
    this.workletNode?.port.postMessage({ type: 'replaceModule', moduleData: buffer });
    this._gridRows = gridRowsOf(buffer);
  }

  onPositionUpdate(cb: (update: ActivisionProPositionUpdate) => void): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  setSubsong(index: number): void {
    this.workletNode?.port.postMessage({ type: 'setSubsong', subsong: index });
  }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelMask', mask });
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /** Edit a pattern cell in the WASM replayer */
  setCell(index: number, row: number, channel: number, note: number, instrument: number, effect: number, effectArg: number): void {
    this.workletNode?.port.postMessage({ type: 'setCell', index, row, channel, note, instrument, effect, effectArg });
  }

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    this._positionCallbacks.clear();
    super.dispose();
    if (ActivisionProEngine.instance === this) ActivisionProEngine.instance = null;
  }
}
