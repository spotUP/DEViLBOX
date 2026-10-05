/**
 * S98Engine.ts - Singleton WASM engine wrapper for S98 register logs
 *
 * s98-wasm/ replays an S98 file (PC-88 / PC-98 / X1 / FM Towns / MSX FM
 * music) on one ymfm chip per logged device. It takes the whole file; the
 * song opens in the scope view (S98Parser). Follows the S98Engine singleton
 * pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { s98DeviceName } from '@lib/import/formats/S98Parser';
import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class S98Engine extends WASMSingletonBase {
  private static instance: S98Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(S98Engine.cache);
  }

  static getInstance(): S98Engine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (
      !S98Engine.instance ||
      S98Engine.instance._disposed ||
      S98Engine.instance.audioContext !== currentCtx
    ) {
      if (S98Engine.instance && !S98Engine.instance._disposed) {
        S98Engine.instance.dispose();
      }
      S98Engine.instance = new S98Engine();
    }
    return S98Engine.instance;
  }

  static hasInstance(): boolean {
    return !!S98Engine.instance && !S98Engine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 's98',
      workletFile: 'S98.worklet.js',
      wasmFile: 'S98.wasm',
      jsFile: 'S98.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 's98-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[S98Engine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded': {
          // One scope per logged device, named by its chip.
          const names = (data.types as number[]).slice(0, 8).map(s98DeviceName);
          useOscilloscopeStore.getState().setChipInfo(names.length, 0, names);
          const silent = names.filter((_, i) => !(data.plays as boolean[])[i]);
          console.log(`[S98Engine] loaded: ${names.join(', ')}`);
          if (silent.length) console.warn(`[S98Engine] no emulator for ${silent.join(', ')}: silent`);
          break;
        }
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'error':
          console.error('[S98Engine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: S98Engine.cache.wasmBinary, jsCode: S98Engine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Load a whole S98 file and start it. */
  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('S98Engine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { /* the log starts on load */ }

  /** Bit N set = device N audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (S98Engine.instance === this) S98Engine.instance = null;
  }
}
