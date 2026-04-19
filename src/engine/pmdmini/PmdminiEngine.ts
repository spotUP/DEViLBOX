/**
 * PmdminiEngine.ts - Singleton WASM engine wrapper for pmdmini PMD replayer
 *
 * Manages the AudioWorklet node for PC-98 PMD (Professional Music Driver)
 * playback. Uses pmdmini with fmgen YM2608 (OPNA) emulation.
 * Follows the OrganyaEngine/SC68Engine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** Pmdmini additionally rewrites HEAP16 (used by its OPNA emulator). */
function pmdminiTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
    .replace(/HEAP16=new Int16Array\(b\);/, 'HEAP16=new Int16Array(b);Module["HEAP16"]=HEAP16;')
    .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
}

export class PmdminiEngine extends WASMSingletonBase {
  private static instance: PmdminiEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(PmdminiEngine.cache);
  }

  static getInstance(): PmdminiEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!PmdminiEngine.instance || PmdminiEngine.instance._disposed ||
        PmdminiEngine.instance.audioContext !== currentCtx) {
      if (PmdminiEngine.instance && !PmdminiEngine.instance._disposed) {
        PmdminiEngine.instance.dispose();
      }
      PmdminiEngine.instance = new PmdminiEngine();
    }
    return PmdminiEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PmdminiEngine.instance && !PmdminiEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'pmdmini',
      workletFile: 'Pmdmini.worklet.js',
      wasmFile: 'Pmdmini.wasm',
      jsFile: 'Pmdmini.js',
      transformJS: pmdminiTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'pmdmini-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PmdminiEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[PmdminiEngine] Module loaded', data.meta);
          break;

        case 'error':
          console.error('[PmdminiEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: PmdminiEngine.cache.wasmBinary,
      jsCode: PmdminiEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PmdminiEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
  }

  play(): void {
    // pmdmini starts playing on load, so play is a no-op
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  override dispose(): void {
    super.dispose();
    if (PmdminiEngine.instance === this) {
      PmdminiEngine.instance = null;
    }
  }
}
