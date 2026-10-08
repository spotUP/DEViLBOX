/**
 * BdEngine.ts - Singleton WASM engine wrapper for Ben Daglish replayer
 *
 * Follows the MaEngine singleton pattern.
 */

import { PositionCallbacks, type EnginePositionUpdate } from '@engine/wasm/PositionCallbacks';
import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class BdEngine extends WASMSingletonBase {
  private static instance: BdEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private readonly _positions = new PositionCallbacks();

  private constructor() {
    super();
    this.initialize(BdEngine.cache);
  }

  static getInstance(): BdEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !BdEngine.instance ||
      BdEngine.instance._disposed ||
      BdEngine.instance.audioContext !== currentCtx
    ) {
      if (BdEngine.instance && !BdEngine.instance._disposed) {
        BdEngine.instance.dispose();
      }
      BdEngine.instance = new BdEngine();
    }
    return BdEngine.instance;
  }

  static hasInstance(): boolean {
    return !!BdEngine.instance && !BdEngine.instance._disposed;
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'bd',
      workletFile: 'Bd.worklet.js',
      wasmFile: 'Bd.wasm',
      jsFile: 'Bd.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'bd-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[BdEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[BdEngine] Module loaded');
          break;
        case 'position':
          this._positions.emit(data);
          break;
        case 'error':
          console.error('[BdEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: BdEngine.cache.wasmBinary, jsCode: BdEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Load the module and start on `subsong` (0-based) - the tune the song's grid shows. */
  async loadTune(buffer: ArrayBuffer, subsong = 0): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('BdEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer, subsong });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  /** The row and song-order index the replayer is on, as the grid shows them. */
  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (BdEngine.instance === this) BdEngine.instance = null;
  }
}
