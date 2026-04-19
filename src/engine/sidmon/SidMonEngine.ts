/**
 * SidMonEngine.ts — Singleton AudioWorklet wrapper for SidMon II WASM synth
 *
 * Manages loading SidMon.wasm + SidMon.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the SoundMonEngine singleton pattern exactly.
 *
 * Usage: call SidMonEngine.getInstance() to get (or create) the singleton.
 * Multiple SidMonSynth instances share this single engine.
 */

import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

function sidMonTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class SidMonEngine extends WASMSingletonBase {
  private static instance: SidMonEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _playerHandleResolvers: Array<(handle: number) => void> = [];

  private constructor() {
    super();
    this.initialize(SidMonEngine.cache);
  }

  static getInstance(): SidMonEngine {
    if (!SidMonEngine.instance || SidMonEngine.instance._disposed) {
      SidMonEngine.instance = new SidMonEngine();
    }
    return SidMonEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SidMonEngine.instance && !SidMonEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sidmon',
      workletFile: 'SidMon.worklet.js',
      wasmFile: 'SidMon.wasm',
      jsFile: 'SidMon.js',
      transformJS: sidMonTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sidmon-processor', {
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
          console.error('[SidMonEngine]', data.message);
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
      wasmBinary: SidMonEngine.cache.wasmBinary,
      jsCode: SidMonEngine.cache.jsCode,
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

  override dispose(): void {
    super.dispose();
    if (SidMonEngine.instance === this) {
      SidMonEngine.instance = null;
    }
  }
}
