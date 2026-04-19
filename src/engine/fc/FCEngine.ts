/**
 * FCEngine.ts — Singleton AudioWorklet wrapper for Future Composer WASM synth
 *
 * Manages loading FC.wasm + FC.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the SoundMonEngine singleton pattern exactly.
 *
 * Usage: call FCEngine.getInstance() to get (or create) the singleton.
 * Multiple FCSynth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** FC Emscripten output uses a chained-HEAP assignment variant of the transform. */
function fcTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class FCEngine extends WASMSingletonBase {
  private static instance: FCEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _playerHandleResolvers: Array<(handle: number) => void> = [];

  private constructor() {
    super();
    this.initialize(FCEngine.cache);
  }

  static getInstance(): FCEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!FCEngine.instance || FCEngine.instance._disposed ||
        FCEngine.instance.audioContext !== currentCtx) {
      if (FCEngine.instance && !FCEngine.instance._disposed) {
        FCEngine.instance.dispose();
      }
      FCEngine.instance = new FCEngine();
    }
    return FCEngine.instance;
  }

  static hasInstance(): boolean {
    return !!FCEngine.instance && !FCEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'fc',
      workletFile: 'FC.worklet.js',
      wasmFile: 'FC.wasm',
      jsFile: 'FC.js',
      transformJS: fcTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'fc-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'error':
          console.error('[FCEngine]', data.message);
          // Unblock any pending waitForPlayerHandle() callers (e.g. pool-full) with sentinel -1
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
      wasmBinary: FCEngine.cache.wasmBinary,
      jsCode: FCEngine.cache.jsCode,
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

  /** Set an instrument parameter by name */
  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (FCEngine.instance === this) {
      FCEngine.instance = null;
    }
  }
}
