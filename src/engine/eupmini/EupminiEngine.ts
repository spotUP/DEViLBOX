/**
 * EupminiEngine.ts - Singleton WASM engine wrapper for EUP (FM Towns) replayer
 *
 * Manages the AudioWorklet node for EUP module playback.
 * Follows the JamCrackerEngine/FCEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import type { FmChannelData, FmSlotData } from '@/engine/fmplayer/FmplayerEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export type { FmChannelData, FmSlotData };

export class EupminiEngine extends WASMSingletonBase {
  private static instance: EupminiEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _pendingFmRequests = new Map<number, (data: FmChannelData) => void>();
  private _pendingCountResolve: ((count: number) => void) | null = null;

  private constructor() {
    super();
    this.initialize(EupminiEngine.cache);
  }

  static getInstance(): EupminiEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !EupminiEngine.instance ||
      EupminiEngine.instance._disposed ||
      EupminiEngine.instance.audioContext !== currentCtx
    ) {
      if (EupminiEngine.instance && !EupminiEngine.instance._disposed) {
        EupminiEngine.instance.dispose();
      }
      EupminiEngine.instance = new EupminiEngine();
    }
    return EupminiEngine.instance;
  }

  static hasInstance(): boolean {
    return !!EupminiEngine.instance && !EupminiEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'eupmini',
      workletFile: 'Eupmini.worklet.js',
      wasmFile: 'Eupmini.wasm',
      jsFile: 'Eupmini.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'eupmini-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[EupminiEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[EupminiEngine] Module loaded');
          break;

        case 'fmInstrumentData': {
          const d = data.data as FmChannelData;
          const resolve = this._pendingFmRequests.get(d.ch ?? (d as unknown as { inst: number }).inst);
          if (resolve) {
            this._pendingFmRequests.delete(d.ch ?? (d as unknown as { inst: number }).inst);
            resolve(d);
          }
          break;
        }
        case 'numFmInstruments':
          if (this._pendingCountResolve) {
            this._pendingCountResolve(data.count);
            this._pendingCountResolve = null;
          }
          break;
        case 'error':
          console.error('[EupminiEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: EupminiEngine.cache.wasmBinary,
      jsCode: EupminiEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('EupminiEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setChannelGain(channel: number, gain: number): void {
    // EUPMini uses binary enable/disable per channel
    this.workletNode?.port.postMessage({ type: 'setChannelMute', channel, muted: gain <= 0 ? 1 : 0 });
  }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  /** Get the number of FM instruments in the loaded EUP file */
  requestNumFmInstruments(): Promise<number> {
    return new Promise((resolve) => {
      this._pendingCountResolve = resolve;
      this.workletNode?.port.postMessage({ type: 'getNumFmInstruments' });
    });
  }

  /** Request full FM instrument data */
  requestFmInstrument(inst: number): Promise<FmChannelData> {
    return new Promise((resolve) => {
      this._pendingFmRequests.set(inst, resolve);
      this.workletNode?.port.postMessage({ type: 'getFmInstrument', inst });
    });
  }

  /** Set a single FM operator parameter on an instrument */
  setFmSlotParam(inst: number, op: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setFmSlotParam', inst, op, paramId, value });
  }

  /** Set an FM channel parameter (alg, fb, pan) on an instrument */
  setFmChParam(inst: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setFmChParam', inst, paramId, value });
  }

  override dispose(): void {
    super.dispose();
    if (EupminiEngine.instance === this) {
      EupminiEngine.instance = null;
    }
  }
}
