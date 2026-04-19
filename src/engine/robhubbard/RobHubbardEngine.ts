/**
 * RobHubbardEngine.ts — Singleton AudioWorklet wrapper for Rob Hubbard WASM synth
 *
 * Manages loading RobHubbard.wasm + RobHubbard.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the HippelCoSoEngine singleton pattern exactly.
 *
 * Usage: call RobHubbardEngine.getInstance() to get (or create) the singleton.
 * Multiple RobHubbardSynth instances share this single engine.
 */

import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** Chained-HEAP variant of the transform. */
function robHubbardTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class RobHubbardEngine extends WASMSingletonBase {
  private static instance: RobHubbardEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _playerHandleResolvers: Array<(handle: number) => void> = [];

  private constructor() {
    super();
    this.initialize(RobHubbardEngine.cache);
  }

  static getInstance(): RobHubbardEngine {
    if (!RobHubbardEngine.instance || RobHubbardEngine.instance._disposed) {
      RobHubbardEngine.instance = new RobHubbardEngine();
    }
    return RobHubbardEngine.instance;
  }

  static hasInstance(): boolean {
    return !!RobHubbardEngine.instance && !RobHubbardEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'robhubbard',
      workletFile: 'RobHubbard.worklet.js',
      wasmFile: 'RobHubbard.wasm',
      jsFile: 'RobHubbard.js',
      transformJS: robHubbardTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'rob-hubbard-processor', {
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
          console.error('[RobHubbardEngine]', data.message);
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
      wasmBinary: RobHubbardEngine.cache.wasmBinary,
      jsCode: RobHubbardEngine.cache.jsCode,
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
    if (RobHubbardEngine.instance === this) {
      RobHubbardEngine.instance = null;
    }
  }
}
