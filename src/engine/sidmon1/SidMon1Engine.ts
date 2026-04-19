/**
 * SidMon1Engine.ts — Singleton AudioWorklet wrapper for SidMon 1.0 WASM synth
 *
 * Manages loading SidMon1.wasm + SidMon1.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the HippelCoSoEngine singleton pattern exactly.
 *
 * Usage: call SidMon1Engine.getInstance() to get (or create) the singleton.
 * Multiple SidMon1Synth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

function sidMon1Transform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

export class SidMon1Engine extends WASMSingletonBase {
  private static instance: SidMon1Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _playerHandleResolvers: Array<(handle: number) => void> = [];

  private constructor() {
    super();
    this.initialize(SidMon1Engine.cache);
  }

  static getInstance(): SidMon1Engine {
    // Guard against stale AudioContext — dev HMR, page reload, iOS suspend/
    // resume, or a manual context restart can replace the context without
    // disposing the engine. Staying attached to a dead context is silent at
    // runtime: the worklet stops producing audio with no error. This was the
    // root cause of the twice-reverted SidMon1 migration. See
    // JamCrackerEngine.getInstance (lines 48-63) for the reference pattern.
    const currentCtx = getDevilboxAudioContext();
    if (
      !SidMon1Engine.instance ||
      SidMon1Engine.instance._disposed ||
      SidMon1Engine.instance.audioContext !== currentCtx
    ) {
      if (SidMon1Engine.instance && !SidMon1Engine.instance._disposed) {
        SidMon1Engine.instance.dispose();
      }
      SidMon1Engine.instance = new SidMon1Engine();
    }
    return SidMon1Engine.instance;
  }

  static hasInstance(): boolean {
    return !!SidMon1Engine.instance && !SidMon1Engine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sidmon1',
      workletFile: 'SidMon1.worklet.js',
      wasmFile: 'SidMon1.wasm',
      jsFile: 'SidMon1.js',
      transformJS: sidMon1Transform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sidmon1-processor', {
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
          console.error('[SidMon1Engine]', data.message);
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
      wasmBinary: SidMon1Engine.cache.wasmBinary,
      jsCode: SidMon1Engine.cache.jsCode,
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
    if (SidMon1Engine.instance === this) {
      SidMon1Engine.instance = null;
    }
  }
}
