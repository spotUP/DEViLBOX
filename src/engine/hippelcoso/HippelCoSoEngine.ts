/**
 * HippelCoSoEngine.ts — Singleton AudioWorklet wrapper for Jochen Hippel CoSo WASM synth
 *
 * Manages loading HippelCoSo.wasm + HippelCoSo.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the SoundMonEngine singleton pattern exactly.
 *
 * Usage: call HippelCoSoEngine.getInstance() to get (or create) the singleton.
 * Multiple HippelCoSoSynth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

function hippelCoSoTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class HippelCoSoEngine extends WASMSingletonBase {
  private static instance: HippelCoSoEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _playerHandleResolvers: Array<(handle: number) => void> = [];

  private constructor() {
    super();
    this.initialize(HippelCoSoEngine.cache);
  }

  static getInstance(): HippelCoSoEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!HippelCoSoEngine.instance || HippelCoSoEngine.instance._disposed ||
        HippelCoSoEngine.instance.audioContext !== currentCtx) {
      if (HippelCoSoEngine.instance && !HippelCoSoEngine.instance._disposed) {
        HippelCoSoEngine.instance.dispose();
      }
      HippelCoSoEngine.instance = new HippelCoSoEngine();
    }
    return HippelCoSoEngine.instance;
  }

  static hasInstance(): boolean {
    return !!HippelCoSoEngine.instance && !HippelCoSoEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'hippel-coso',
      workletFile: 'HippelCoSo.worklet.js',
      wasmFile: 'HippelCoSo.wasm',
      jsFile: 'HippelCoSo.js',
      transformJS: hippelCoSoTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'hippel-coso-processor', {
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
          console.error('[HippelCoSoEngine]', data.message);
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
      wasmBinary: HippelCoSoEngine.cache.wasmBinary,
      jsCode: HippelCoSoEngine.cache.jsCode,
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

  setMuteMask(mask: number): void {
    this.sendMessage({ type: 'setMuteMask', mask });
  }

  setChannelGain(handle: number, gain: number): void {
    this.sendMessage({ type: 'setChannelGain', handle, gain });
  }

  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    super.dispose();
    if (HippelCoSoEngine.instance === this) {
      HippelCoSoEngine.instance = null;
    }
  }
}
