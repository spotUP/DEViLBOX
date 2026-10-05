/**
 * FaceTheMusicEngine.ts — Singleton WASM engine wrapper for FaceTheMusic replayer
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
import { ftmCellFields } from '@engine/uade/encoders/FaceTheMusicEncoder';

function faceTheMusicTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class FaceTheMusicEngine extends WASMChannelOutputsEngine {
  private static instance: FaceTheMusicEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;

  private constructor() {
    super();
    this.initialize(FaceTheMusicEngine.cache);
  }

  static getInstance(): FaceTheMusicEngine {
    if (FaceTheMusicEngine.instance && !FaceTheMusicEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (FaceTheMusicEngine.instance.audioContext !== currentCtx) {
          FaceTheMusicEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!FaceTheMusicEngine.instance || FaceTheMusicEngine.instance._disposed) {
      FaceTheMusicEngine.instance = new FaceTheMusicEngine();
    }
    return FaceTheMusicEngine.instance;
  }

  static hasInstance(): boolean {
    return !!FaceTheMusicEngine.instance && !FaceTheMusicEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'facethemusic',
      workletFile: 'FaceTheMusic.worklet.js',
      wasmFile: 'FaceTheMusic.wasm',
      jsFile: 'FaceTheMusic.js',
      transformJS: faceTheMusicTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'facethemusic-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[FaceTheMusicEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[FaceTheMusicEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[FaceTheMusicEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: FaceTheMusicEngine.cache.wasmBinary, jsCode: FaceTheMusicEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('FaceTheMusicEngine not initialized');
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

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /**
   * Edit a grid cell in the WASM replayer. Takes the grid's terms and hands
   * ftm_set_cell the track event (note, effect, argument) through
   * ftmCellFields, the mapping the file encoder uses. `pattern` is the
   * measure; the worklet turns measure + row into the song row.
   */
  setCell(pattern: number, row: number, channel: number, note: number, instrument: number, effTyp: number, eff: number, volume = 0): void {
    const fields = ftmCellFields({ note, instrument, effTyp, eff, volume });
    this.workletNode?.port.postMessage({ type: 'setCell', pattern, row, channel, ...fields });
  }

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    super.dispose();
    if (FaceTheMusicEngine.instance === this) FaceTheMusicEngine.instance = null;
  }
}
