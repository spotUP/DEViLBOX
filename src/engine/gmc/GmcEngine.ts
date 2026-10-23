/**
 * GmcEngine.ts — Singleton WASM engine wrapper for Gmc replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { ChannelMeterFeed } from '../tone/channelMeterFeed';
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

export function gmcTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

const meterFeed = new ChannelMeterFeed();

export class GmcEngine extends WASMChannelOutputsEngine {
  private static instance: GmcEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songEndCallback: (() => void) | null = null;
  private readonly _positions = new PositionCallbacks();

  private constructor() {
    super();
    this.initialize(GmcEngine.cache);
  }

  static getInstance(): GmcEngine {
    if (GmcEngine.instance && !GmcEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (GmcEngine.instance.audioContext !== currentCtx) {
          GmcEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!GmcEngine.instance || GmcEngine.instance._disposed) {
      GmcEngine.instance = new GmcEngine();
    }
    return GmcEngine.instance;
  }

  static hasInstance(): boolean {
    return !!GmcEngine.instance && !GmcEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'gmc',
      workletFile: 'Gmc.worklet.js',
      wasmFile: 'Gmc.wasm',
      jsFile: 'Gmc.js',
      transformJS: gmcTransform,
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'gmc-processor', channelOutputNodeOptions(4));

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[GmcEngine] WASM ready');
          this.markNodeReady();
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[GmcEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'position':
          this._positions.emit(data);
          break;
        case 'chLevels':
          meterFeed.reportFromWorklet(data, this.audioContext);
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[GmcEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: GmcEngine.cache.wasmBinary, jsCode: GmcEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output, 0);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('GmcEngine not initialized');
    meterFeed.clearHeld();
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
    this.afterPlay();
  }
  stop(): void { meterFeed.clearHeld(); this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelMask', mask });
  }

  /** The replayer's own playhead: song position (order index) and row. NativeEngineRouting wires it to the position store. */
  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
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
    this._positions.clear();
    super.dispose();
    if (GmcEngine.instance === this) GmcEngine.instance = null;
  }
}
