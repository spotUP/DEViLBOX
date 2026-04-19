/**
 * V2MEngine.ts - Singleton WASM engine wrapper for V2M (Farbrausch V2 Synthesizer Music) playback
 *
 * Manages the AudioWorklet node for V2M file playback using the jgilje v2m-player WASM module.
 * Follows the OrganyaEngine/JamCrackerEngine singleton pattern.
 *
 * NOTE: V2M assets live at the base URL root (not a subdirectory) —
 * dir = '' so WASMLoaderConfig builds `/V2MPlayer.worklet.js` etc.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class V2MEngine extends WASMSingletonBase {
  private static instance: V2MEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(V2MEngine.cache);
  }

  static getInstance(): V2MEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!V2MEngine.instance || V2MEngine.instance._disposed ||
        V2MEngine.instance.audioContext !== currentCtx) {
      if (V2MEngine.instance && !V2MEngine.instance._disposed) {
        V2MEngine.instance.dispose();
      }
      V2MEngine.instance = new V2MEngine();
    }
    return V2MEngine.instance;
  }

  static hasInstance(): boolean {
    return !!V2MEngine.instance && !V2MEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    // V2M assets live directly under the base URL (no subdir).
    return {
      dir: '.',
      workletFile: 'V2MPlayer.worklet.js',
      wasmFile: 'V2MPlayer.wasm',
      jsFile: 'V2MPlayer.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'v2m-player-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'initialized':
          console.log('[V2MEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          console.log('[V2MEngine] V2M loaded, length:', data.lengthSeconds, 's');
          break;

        case 'finished':
          console.log('[V2MEngine] Playback finished');
          break;

        case 'error':
          console.error('[V2MEngine]', data.error);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: V2MEngine.cache.wasmBinary,
      jsCode: V2MEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('V2MEngine not initialized');

    const data = new Uint8Array(buffer);
    this.workletNode.port.postMessage({ type: 'load', data });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play', timeMs: 0 });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop', fadeMs: 0 });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop', fadeMs: 0 });
  }

  /**
   * Set the gain for a single V2 synth channel (0-15).
   * @param ch   Channel index (0..15)
   * @param gain Linear gain multiplier (1.0 = passthrough, 0.0 = mute)
   */
  setChannelGain(ch: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel: ch, gain });
  }

  /**
   * Mute/unmute channels via a 16-bit bitmask.
   * A set bit means the channel is muted (gain = 0).
   * @param mask Bitmask where bit N corresponds to channel N
   */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    // Custom shutdown message (stop w/ fade) preserved from original.
    this._disposed = true;
    try { this.workletNode?.port.postMessage({ type: 'stop', fadeMs: 0 }); } catch { /* */ }
    try { this.workletNode?.disconnect(); } catch { /* */ }
    this.workletNode = null;
    if (V2MEngine.instance === this) {
      V2MEngine.instance = null;
    }
  }
}
