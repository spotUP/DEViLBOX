/**
 * AyletEngine.ts - Singleton WASM engine wrapper for aylet (ZX Spectrum .ay)
 *
 * aylet 0.5 (Russell Marks, Ian Collier; GPL-2) compiled to wasm from
 * third-party/aylet-0.5 via aylet-wasm/. It takes the whole ZXAYEMUL file:
 * its Z80 runs the tune's own Spectrum code and its sound.c renders the AY
 * and beeper. Follows the MdxminiEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class AyletEngine extends WASMSingletonBase {
  private static instance: AyletEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(AyletEngine.cache);
  }

  static getInstance(): AyletEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (
      !AyletEngine.instance ||
      AyletEngine.instance._disposed ||
      AyletEngine.instance.audioContext !== currentCtx
    ) {
      if (AyletEngine.instance && !AyletEngine.instance._disposed) {
        AyletEngine.instance.dispose();
      }
      AyletEngine.instance = new AyletEngine();
    }
    return AyletEngine.instance;
  }

  static hasInstance(): boolean {
    return !!AyletEngine.instance && !AyletEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'aylet',
      workletFile: 'Aylet.worklet.js',
      wasmFile: 'Aylet.wasm',
      jsFile: 'Aylet.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'aylet-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[AyletEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log(`[AyletEngine] AY file loaded: ${data.numTracks} song(s), playing ${data.track}`);
          break;
        case 'error':
          console.error('[AyletEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: AyletEngine.cache.wasmBinary, jsCode: AyletEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Load a whole ZXAY file; `track` -1 plays the file's FirstSong. */
  async loadTune(buffer: ArrayBuffer, track = -1): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('AyletEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer, track });
  }

  play(): void { /* the tune starts on load */ }

  /** Bit N set = AY channel N (A, B, C) audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (AyletEngine.instance === this) AyletEngine.instance = null;
  }
}
