/**
 * StoneTrackerEngine.ts - Singleton WASM engine wrapper for StoneTracker (.spm + .sps)
 *
 * stonetracker-wasm/ runs the authors' no-OS player (StonePlayer_Hard.bin,
 * StonePlayer V1.98) on Musashi's 68020 core with a register-level Paula and
 * CIA-B. It takes the SPM song and the SPS sample bank (DeltaHuffman packed or
 * not) and plays song 1; the grid is a view (StoneTrackerParser).
 * Decision record: thoughts/shared/research/2026-10-05_stonetracker-replayer.md
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from "@/utils/audio-context";
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export class StoneTrackerEngine extends WASMSingletonBase {
  private static instance: StoneTrackerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private constructor() {
    super();
    this.initialize(StoneTrackerEngine.cache);
  }

  static getInstance(): StoneTrackerEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    const currentCtx = getDevilboxAudioContext();
    if (
      !StoneTrackerEngine.instance ||
      StoneTrackerEngine.instance._disposed ||
      StoneTrackerEngine.instance.audioContext !== currentCtx
    ) {
      if (StoneTrackerEngine.instance && !StoneTrackerEngine.instance._disposed) {
        StoneTrackerEngine.instance.dispose();
      }
      StoneTrackerEngine.instance = new StoneTrackerEngine();
    }
    return StoneTrackerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!StoneTrackerEngine.instance && !StoneTrackerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'stonetracker',
      workletFile: 'StoneTracker.worklet.js',
      wasmFile: 'StoneTracker.wasm',
      jsFile: 'StoneTracker.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'stonetracker-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[StoneTrackerEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(8, 0, Array.from({ length: 8 }, (_, i) => `Track ${i + 1}`));
          console.log('[StoneTrackerEngine] StoneTracker song loaded');
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;
        case 'error':
          console.error('[StoneTrackerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: StoneTrackerEngine.cache.wasmBinary, jsCode: StoneTrackerEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Load an SPM song with its SPS sample bank; song 1 starts at position 0. */
  async loadTune(song: ArrayBuffer, sampleBank?: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('StoneTrackerEngine not initialized');
    if (!sampleBank) throw new Error('StoneTracker needs the SPS sample bank beside the SPM song');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: song, sampleData: sampleBank });
  }

  play(): void { /* the song starts on load */ }

  /** Bit N set = track N+1 (0-7) audible - the mixer's solo/mute. */
  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  override dispose(): void {
    super.dispose();
    if (StoneTrackerEngine.instance === this) StoneTrackerEngine.instance = null;
  }
}
