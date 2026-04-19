/**
 * OctaMEDEngine.ts - Singleton WASM engine wrapper for OctaMED synth replayer
 *
 * Manages the AudioWorklet node for OctaMED synth instrument playback.
 * Standalone instrument mode only (no song playback).
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

function octaMEDTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class OctaMEDEngine extends WASMSingletonBase {
  private static instance: OctaMEDEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _playerHandleResolvers: Array<(handle: number) => void> = [];

  private constructor() {
    super();
    this.initialize(OctaMEDEngine.cache);
  }

  static getInstance(): OctaMEDEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!OctaMEDEngine.instance || OctaMEDEngine.instance._disposed ||
        OctaMEDEngine.instance.audioContext !== currentCtx) {
      if (OctaMEDEngine.instance && !OctaMEDEngine.instance._disposed) {
        OctaMEDEngine.instance.dispose();
      }
      OctaMEDEngine.instance = new OctaMEDEngine();
    }
    return OctaMEDEngine.instance;
  }

  static hasInstance(): boolean {
    return !!OctaMEDEngine.instance && !OctaMEDEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'octamed',
      workletFile: 'OctaMED.worklet.js',
      wasmFile: 'OctaMED.wasm',
      jsFile: 'OctaMED.js',
      transformJS: octaMEDTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'octamed-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[OctaMEDEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'error':
          console.error('[OctaMEDEngine]', data.message);
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(-1);
          }
          break;

        case 'playerCreated':
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(data.handle);
          }
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: OctaMEDEngine.cache.wasmBinary,
      jsCode: OctaMEDEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) {
      this.workletNode.port.postMessage(msg, transfers);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  waitForPlayerHandle(): Promise<number> {
    return new Promise<number>((resolve) => {
      this._playerHandleResolvers.push(resolve);
    });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    super.dispose();
    if (OctaMEDEngine.instance === this) {
      OctaMEDEngine.instance = null;
    }
  }
}
