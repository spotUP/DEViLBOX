/**
 * SonixEngine.ts - Singleton WASM engine wrapper for Sonix Music Driver
 *
 * Supports SNX, SMUS, and TINY Sonix music formats.
 * Manages the AudioWorklet node for Sonix module playback.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export interface SonixMeta {
  format: string;
  numChannels: number;
  numInstruments: number;
  numSamples: number;
}

/** Per-instrument SNX1 synth parameters, mirrored from the WASM for the editor. */
export interface SonixSynthParams {
  index: number;
  baseVol: number;
  portFlag: number;
  c2: number;
  c4: number;
  filterBase: number;
  filterRange: number;
  filterEnvSens: number;
  envScanRate: number;
  envLoopMode: number;
  envDelayInit: number;
  envVolScale: number;
  envPitchScale: number;
  slideRate: number;
  wave: number[];     // 128 signed bytes
  envTable: number[]; // 128 signed bytes
  lfoWave: number[];  // third 128-sample table @0x144 (Aegis "LFO" waveform tab)
  egLevels: number[]; // 4-stage envelope generator targets
  egRates: number[];  // 4-stage envelope generator speeds (raw u16, bit-packed base/shift)
}

export class SonixEngine extends WASMSingletonBase {
  private static instance: SonixEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _meta: SonixMeta | null = null;
  private _synthParams: SonixSynthParams[] = [];
  /** Fired when the WASM reports its parsed synth params after a module loads. */
  static onSynthParams: ((params: SonixSynthParams[]) => void) | null = null;

  private constructor() {
    super();
    this.initialize(SonixEngine.cache);
  }

  static getInstance(): SonixEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !SonixEngine.instance ||
      SonixEngine.instance._disposed ||
      SonixEngine.instance.audioContext !== currentCtx
    ) {
      if (SonixEngine.instance && !SonixEngine.instance._disposed) {
        SonixEngine.instance.dispose();
      }
      SonixEngine.instance = new SonixEngine();
    }
    return SonixEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SonixEngine.instance && !SonixEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sonix',
      workletFile: 'Sonix.worklet.js',
      wasmFile: 'Sonix.wasm',
      jsFile: 'Sonix.js',
      workletCacheBust: true,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sonix-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SonixEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded': {
          this._meta = data.meta || null;
          console.log('[SonixEngine] Module loaded:', this._meta);
          const numChannels = this._meta?.numChannels ?? 0;
          if (numChannels > 0) {
            useOscilloscopeStore.getState().setChipInfo(
              numChannels,
              0,
              Array.from({ length: numChannels }, (_, i) => `CH${i + 1}`),
            );
          }
          // Apply the app's stereo separation to the freshly loaded song.
          void import('@stores/useSettingsStore').then(({ useSettingsStore }) => {
            this.setStereoSeparation(useSettingsStore.getState().stereoSeparation);
          }).catch(() => { /* settings not ready */ });
          break;
        }

        case 'channelData':
          useOscilloscopeStore.getState().updateChannelData(data.channels);
          break;

        case 'synthParams':
          this._synthParams = (data.instruments as SonixSynthParams[]) || [];
          SonixEngine.onSynthParams?.(this._synthParams);
          break;

        case 'error':
          console.error('[SonixEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SonixEngine.cache.wasmBinary,
      jsCode: SonixEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(
    buffer: ArrayBuffer,
    sidecarFiles?: Array<{ path: string; data: ArrayBuffer }>,
    songPath?: string,
  ): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SonixEngine not initialized');

    // songPath drives the worklet's sonix_song_load_instruments() sidecar-dir walk;
    // its parent dir must match the sidecarFiles' memfs paths (see SONIX_MEMFS_SONG_PATH).
    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer, sidecarFiles: sidecarFiles || [], songPath: songPath || 'sonix/song' },
    );
  }

  get meta(): SonixMeta | null {
    return this._meta;
  }

  play(): void {
    // Playback starts automatically after loadModule
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
    useOscilloscopeStore.getState().clear();
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setSoloChannel(channel: number): void {
    this.workletNode?.port.postMessage({ type: 'setSoloChannel', channel });
  }

  /**
   * Apply the app's stereo-separation setting (0–100%: 0 = mono, 100 = full stereo).
   * Sonix's internal stereo_mix is inverted (0 = hard pan, 1 = mono), so map it.
   */
  setStereoSeparation(percent: number): void {
    const sep = Math.max(0, Math.min(100, percent));
    this.setStereoMix(1 - sep / 100);
  }

  setStereoMix(mix: number): void {
    this.workletNode?.port.postMessage({ type: 'setStereoMix', mix });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  /** The synth params mirrored from the WASM after the current module loaded. */
  get synthParams(): SonixSynthParams[] {
    return this._synthParams;
  }

  /** Push an edited instrument's synth params into the live WASM (set_wave rebuilds the filter bank). */
  setSynthParams(params: SonixSynthParams): void {
    this.workletNode?.port.postMessage({ type: 'setSynthParams', params });
  }

  override dispose(): void {
    useOscilloscopeStore.getState().clear();
    super.dispose();
    if (SonixEngine.instance === this) {
      SonixEngine.instance = null;
    }
  }
}
