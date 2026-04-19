/**
 * ActivisionProEngine.ts — Singleton WASM engine wrapper for ActivisionPro replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { useFormatStore } from '@stores/useFormatStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

function activisionProTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class ActivisionProEngine extends WASMSingletonBase {
  private static instance: ActivisionProEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;

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
    this.workletNode = new AudioWorkletNode(ctx, 'activisionpro-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[ActivisionProEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[ActivisionProEngine] Module loaded, subsongs:', data.subsongCount);
          useFormatStore.getState().setActivisionProSubsongs(data.subsongCount ?? 1);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels);
          break;
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
    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('ActivisionProEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
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
    super.dispose();
    if (ActivisionProEngine.instance === this) ActivisionProEngine.instance = null;
  }
}
