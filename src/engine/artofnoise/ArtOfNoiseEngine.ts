/**
 * ArtOfNoiseEngine.ts - Singleton WASM engine for Art of Noise (AON4/AON8) replayer
 *
 * Uses a clean C11 port (from RetrovertApp/NostalgicPlayer) that supports
 * 4-channel (AON4) and 8-channel (AON8) formats with stereo float output.
 * Follows the PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class ArtOfNoiseEngine extends WASMSingletonBase {
  private static instance: ArtOfNoiseEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(ArtOfNoiseEngine.cache);
  }

  static getInstance(): ArtOfNoiseEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!ArtOfNoiseEngine.instance || ArtOfNoiseEngine.instance._disposed ||
        ArtOfNoiseEngine.instance.audioContext !== currentCtx) {
      if (ArtOfNoiseEngine.instance && !ArtOfNoiseEngine.instance._disposed) {
        ArtOfNoiseEngine.instance.dispose();
      }
      ArtOfNoiseEngine.instance = new ArtOfNoiseEngine();
    }
    return ArtOfNoiseEngine.instance;
  }

  static hasInstance(): boolean {
    return !!ArtOfNoiseEngine.instance && !ArtOfNoiseEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'artofnoise',
      workletFile: 'ArtOfNoise.worklet.js',
      wasmFile: 'ArtOfNoise.wasm',
      jsFile: 'ArtOfNoise.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'artofnoise-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[ArtOfNoiseEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[ArtOfNoiseEngine] Module loaded');
          break;

        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            // levels is [ch0_L, ch0_R, ch1_L, ch1_R, ...] up to 8 channels
            for (let ch = 0; ch < levels.length / 2; ch++) {
              const peak = Math.max(levels[ch * 2], levels[ch * 2 + 1]);
              engine.triggerChannelMeter(ch, peak);
            }
          } catch { /* ToneEngine not ready */ }
          break;

        case 'error':
          console.error('[ArtOfNoiseEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: ArtOfNoiseEngine.cache.wasmBinary,
      jsCode: ArtOfNoiseEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('ArtOfNoiseEngine not initialized');

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
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  setSubsong(index: number): void {
    this.workletNode?.port.postMessage({ type: 'setSubsong', subsong: index });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (ArtOfNoiseEngine.instance === this) {
      ArtOfNoiseEngine.instance = null;
    }
  }
}
