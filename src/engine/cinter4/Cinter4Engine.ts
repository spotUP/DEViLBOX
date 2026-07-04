/**
 * Cinter4Engine.ts - Singleton WASM engine wrapper for Cinter4 replayer
 *
 * Manages the AudioWorklet node for Cinter4 module playback.
 * Follows the PumaTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { useWasmPositionStore } from '@stores/useWasmPositionStore';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** Position config for mapping the WASM tick → decompiled (song position, row). */
interface Cinter4PosConfig { spd: number; ticksPerTrack: number; restartTick: number }

export class Cinter4Engine extends WASMSingletonBase {
  private static instance: Cinter4Engine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();
  private posConfig: Cinter4PosConfig | null = null;

  private constructor() {
    super();
    this.initialize(Cinter4Engine.cache);
  }

  static getInstance(): Cinter4Engine {
    const currentCtx = getDevilboxAudioContext();
    if (
      !Cinter4Engine.instance ||
      Cinter4Engine.instance._disposed ||
      Cinter4Engine.instance.audioContext !== currentCtx
    ) {
      if (Cinter4Engine.instance && !Cinter4Engine.instance._disposed) {
        Cinter4Engine.instance.dispose();
      }
      Cinter4Engine.instance = new Cinter4Engine();
    }
    return Cinter4Engine.instance;
  }

  static hasInstance(): boolean {
    return !!Cinter4Engine.instance && !Cinter4Engine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'cinter4',
      workletFile: 'Cinter4.worklet.js',
      wasmFile: 'Cinter4.wasm',
      jsFile: 'Cinter4.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'cinter4-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          break;

        case 'scope':
          // Per-channel waveforms (4 Paula channels) for the oscilloscope.
          useOscilloscopeStore.getState().updateChannelData(data.channels);
          break;

        case 'position':
          // The WASM's real 50 Hz tick → decompiled (song position, row) so the
          // pattern scroll follows the audio, not the drifting tracker scheduler.
          this.feedPosition(data.tick | 0);
          break;

        case 'error':
          console.error('[Cinter4Engine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: Cinter4Engine.cache.wasmBinary,
      jsCode: Cinter4Engine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer, rawData?: ArrayBuffer, posConfig?: Cinter4PosConfig): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('Cinter4Engine not initialized');
    this.posConfig = posConfig ?? null;

    // Songs with raw (non-Cinter) instruments need their PCM in instrument space
    // BEFORE the module loads — CinterMakeInstruments reads it at synth time.
    if (rawData && rawData.byteLength > 0) {
      this.workletNode.port.postMessage({ type: 'loadRaw', rawData, offset: 0 });
    }
    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );

    // Set up the 4 Paula channels for the per-channel oscilloscope.
    useOscilloscopeStore.getState().setChipInfo(4, 0, ['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4']);

    // Register as the active gain engine so the mixer's per-channel mute/solo
    // forwards here (see useMixerStore.getActiveGainEngine). Global bypasses the
    // Vite module-duplication issue where hasInstance() can read false.
    (globalThis as { __devilboxActiveCinter4Engine?: Cinter4Engine }).__devilboxActiveCinter4Engine = this;

    // Apply the DEViLBOX stereo separation (Cinter uses direct routing, so it
    // bypasses the replayer's separation node — narrow the hard Amiga L/R here).
    try {
      const { useSettingsStore } = await import('@stores/useSettingsStore');
      this.setStereoSeparation(useSettingsStore.getState().stereoSeparation);
    } catch { /* settings not ready — worklet default (25%) applies */ }
  }

  /** Per-channel mute/solo (isolation UI): gain 0 = mute, 1 = play. Paula ch 0-3. */
  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  /** DEViLBOX stereo separation 0-100 (%): 100 = full Amiga L/R, 0 = mono. */
  setStereoSeparation(percent: number): void {
    this.workletNode?.port.postMessage({ type: 'setStereoSeparation', value: percent });
  }

  /** Map the WASM 50 Hz tick → decompiled (song position, row) and feed the store.
   *  Decompiled Cinter is speed-recovered 64-row patterns; the song loops from
   *  restartTick once it passes ticksPerTrack. */
  private feedPosition(tick: number): void {
    const cfg = this.posConfig;
    if (!cfg) return;
    const spd = cfg.spd || 6;
    let playTick = tick;
    const loopLen = cfg.ticksPerTrack - cfg.restartTick;
    if (cfg.ticksPerTrack > 0 && tick >= cfg.ticksPerTrack && loopLen > 0) {
      playTick = cfg.restartTick + ((tick - cfg.ticksPerTrack) % loopLen);
    }
    const rowInSong = Math.floor(playTick / spd);
    useWasmPositionStore.getState().setPosition(rowInSong % 64, Math.floor(rowInSong / 64));
  }

  play(): void {
    // Playback starts automatically on load for sequencer-based formats
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
    useOscilloscopeStore.getState().clear();
    useWasmPositionStore.getState().clear();
  }

  /** Seek to a 50 Hz tick (Play Pattern / mid-song start). The player is linear, so
   *  this replays the sequencer to the tick in the worklet, then resumes rendering. */
  seekTo(tick: number): void {
    this.workletNode?.port.postMessage({ type: 'seek', tick: Math.max(0, Math.floor(tick)) });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  override dispose(): void {
    super.dispose();
    const g = globalThis as { __devilboxActiveCinter4Engine?: Cinter4Engine | null };
    if (g.__devilboxActiveCinter4Engine === this) g.__devilboxActiveCinter4Engine = null;
    if (Cinter4Engine.instance === this) {
      Cinter4Engine.instance = null;
    }
  }
}
