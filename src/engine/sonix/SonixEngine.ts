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
import { WasmSynthParamBridge } from '@engine/replayer/WasmSynthParamBridge';
import { SONIX_BRIDGE_SPEC, type SonixSynthParams } from './sonixSynthSpec';
import { sonixGlobalRowToPosition, SNX_TICKS_PER_ROW } from './sonixPosition';

// Re-export the extracted schema so existing consumers keep importing from SonixEngine.
export { SONIX_BRIDGE_SPEC } from './sonixSynthSpec';
export type { SonixSynthParams } from './sonixSynthSpec';

/** Playback-position update consumed by NativeEngineRouting's generic sync path. */
export interface SonixPositionUpdate {
  row: number;
  songPos: number;
}
type SonixPositionCallback = (update: SonixPositionUpdate) => void;

export interface SonixMeta {
  format: string;
  numChannels: number;
  numInstruments: number;
  numSamples: number;
}

export class SonixEngine extends WASMSingletonBase {
  private static instance: SonixEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _meta: SonixMeta | null = null;
  /** Shared WASM↔store param bridge (mirror + setter), created with the worklet node. */
  private _paramBridge: WasmSynthParamBridge<SonixSynthParams> | null = null;
  /** Playback-position listeners (wired by NativeEngineRouting to the cursor store). */
  private _positionCallbacks: Set<SonixPositionCallback> = new Set();
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

    // Param bridge: normalizes reported params + posts edits back to this worklet. Its
    // onParams delegates to the static callback the store bridge registers.
    const node = this.workletNode;
    this._paramBridge = new WasmSynthParamBridge<SonixSynthParams>(
      SONIX_BRIDGE_SPEC,
      (message) => node.port.postMessage(message),
    );
    this._paramBridge.onParams = (params) => SonixEngine.onSynthParams?.(params);

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

        case 'position': {
          // The worklet reports the driver's native playback counter. Its unit is per-tick
          // for SNX (a display row spans SNX_TICKS_PER_ROW ticks) but per-row for SMUS/TINY,
          // so divide by the sub-format's ticks-per-row before mapping to (row, songPos).
          const ticksPerRow = this._meta?.format === 'SNX' ? SNX_TICKS_PER_ROW : 1;
          const pos = sonixGlobalRowToPosition(data.row, ticksPerRow);
          for (const cb of this._positionCallbacks) cb(pos);
          break;
        }

        case SONIX_BRIDGE_SPEC.reportMessage:
          this._paramBridge?.handleReport(data as { instruments?: SonixSynthParams[] });
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
    return this._paramBridge?.params ?? [];
  }

  /** Push an edited instrument's synth params into the live WASM (set_wave rebuilds the filter bank). */
  setSynthParams(params: SonixSynthParams): void {
    this._paramBridge?.setParams(params);
  }

  /**
   * Register a playback-position listener. NativeEngineRouting's generic sync path
   * detects this method and feeds updates into useWasmPositionStore, which makes the
   * editor cursor follow the native audio (see PatternEditorCanvas wasmPos branch).
   * Returns an unsubscribe function.
   */
  onPositionUpdate(cb: SonixPositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  override dispose(): void {
    useOscilloscopeStore.getState().clear();
    this._positionCallbacks.clear();
    super.dispose();
    if (SonixEngine.instance === this) {
      SonixEngine.instance = null;
    }
  }
}
