/**
 * SawteethEngine.ts - Singleton WASM engine wrapper for Sawteeth replayer
 *
 * Manages the AudioWorklet node for Sawteeth (.st) module playback.
 * Follows the OrganyaEngine/MaEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useOscilloscopeStore } from '@/stores/useOscilloscopeStore';
import { useFormatStore } from '@/stores/useFormatStore';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export interface SawteethEnvPoint {
  time: number;
  lev: number;
}

export interface SawteethStepData {
  note: number;
  wForm: number;
  relative: boolean;
}

export interface SawteethInstrumentData {
  ins: number;
  filterMode: number;
  clipMode: number;
  boost: number;
  vibS: number;
  vibD: number;
  pwmS: number;
  pwmD: number;
  res: number;
  sps: number;
  len: number;
  loop: number;
  ampEnv: SawteethEnvPoint[];
  filterEnv: SawteethEnvPoint[];
  steps: SawteethStepData[];
}

/** Parameter IDs matching sawteeth.h ST_PARAM_* */
export const ST_PARAM = {
  FILTER_MODE: 0,
  CLIP_MODE: 1,
  BOOST: 2,
  VIB_S: 3,
  VIB_D: 4,
  PWM_S: 5,
  PWM_D: 6,
  RES: 7,
  SPS: 8,
  LEN: 9,
  LOOP: 10,
} as const;

export class SawteethEngine extends WASMSingletonBase {
  private static instance: SawteethEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _pendingInstrumentRequests = new Map<number, (data: SawteethInstrumentData) => void>();
  private _pendingPlayerRequests = new Map<number, (handle: number) => void>();
  private _nextRequestId = 1;

  private constructor() {
    super();
    this.initialize(SawteethEngine.cache);
  }

  static getInstance(): SawteethEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!SawteethEngine.instance || SawteethEngine.instance._disposed ||
        SawteethEngine.instance.audioContext !== currentCtx) {
      if (SawteethEngine.instance && !SawteethEngine.instance._disposed) {
        SawteethEngine.instance.dispose();
      }
      SawteethEngine.instance = new SawteethEngine();
    }
    return SawteethEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SawteethEngine.instance && !SawteethEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sawteeth',
      workletFile: 'Sawteeth.worklet.js',
      wasmFile: 'Sawteeth.wasm',
      jsFile: 'Sawteeth.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sawteeth-processor', {
      outputChannelCount: [2, 2],
      numberOfOutputs: 2,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SawteethEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded': {
          console.log('[SawteethEngine] Module loaded');
          const numCh = data.meta?.channels ?? 4;
          const names = Array.from({ length: numCh }, (_, i) => `Ch ${i + 1}`);
          useOscilloscopeStore.getState().setChipInfo(numCh, 0, names);
          break;
        }

        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
          break;

        case 'instrumentData': {
          const insData = data.data as SawteethInstrumentData;
          const resolve = this._pendingInstrumentRequests.get(insData.ins);
          if (resolve) {
            resolve(insData);
            this._pendingInstrumentRequests.delete(insData.ins);
          }
          break;
        }

        case 'playerCreated': {
          const resolve = this._pendingPlayerRequests.get(data.requestId as number);
          if (resolve) {
            this._pendingPlayerRequests.delete(data.requestId as number);
            resolve(data.handle as number);
          }
          break;
        }

        case 'error':
          console.error('[SawteethEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SawteethEngine.cache.wasmBinary,
      jsCode: SawteethEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output, 0);
  }

  private _previewTarget: AudioNode | null = null;

  /**
   * The worklet's second output carries all preview voices mixed. It feeds one
   * synth output at a time (the synth that played last), so the mix is not
   * heard once per synth.
   */
  routePreviewTo(target: AudioNode): void {
    if (!this.workletNode || this._previewTarget === target) return;
    if (this._previewTarget) {
      try { this.workletNode.disconnect(this._previewTarget, 1); } catch { /* already gone */ }
    }
    this.workletNode.connect(target, 1);
    this._previewTarget = target;
  }

  /** Stop feeding target (synth disposed). */
  unroutePreview(target: AudioNode): void {
    if (this._previewTarget !== target) return;
    try { this.workletNode?.disconnect(target, 1); } catch { /* already gone */ }
    this._previewTarget = null;
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SawteethEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
  }

  play(): void {
    // Sawteeth starts playing on loadModule — no separate play command needed
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  /** Request full instrument data from WASM */
  requestInstrumentData(insIdx: number): Promise<SawteethInstrumentData> {
    return new Promise((resolve) => {
      this._pendingInstrumentRequests.set(insIdx, resolve);
      this.workletNode?.port.postMessage({ type: 'getInstrument', ins: insIdx });
    });
  }

  /**
   * Create a standalone preview voice for song instrument insIdx (the
   * replayer's own instrument code, separate from the song players).
   * Resolves to a handle, or -1 when the instrument is not available
   * (no tune loaded, or the song was stopped before the voice existed).
   */
  async createPreviewPlayer(insIdx: number): Promise<number> {
    await this._initPromise;
    if (!this.workletNode) return -1;
    const request = (): Promise<number> => new Promise<number>((resolve) => {
      const requestId = this._nextRequestId++;
      this._pendingPlayerRequests.set(requestId, resolve);
      this.workletNode?.port.postMessage({ type: 'createPlayer', ins: insIdx, requestId });
    });
    const handle = await request();
    if (handle >= 0) return handle;
    // No tune in the replayer yet (typed key before the first play): load the
    // open song's bytes without starting it, then ask again.
    const bytes = useFormatStore.getState().sawteethFileData;
    if (!bytes) return -1;
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: bytes.slice(0), previewOnly: true });
    return request();
  }

  previewNoteOn(handle: number, note: number, velocity: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', handle, note, velocity });
  }

  previewNoteOff(handle: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOff', handle });
  }

  destroyPreviewPlayer(handle: number): void {
    this.workletNode?.port.postMessage({ type: 'destroyPlayer', handle });
  }

  /** Set a single scalar parameter on an instrument */
  setParam(insIdx: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setParam', ins: insIdx, paramId, value });
  }

  /** Set the amplitude envelope for an instrument */
  setAmpEnv(insIdx: number, points: SawteethEnvPoint[]): void {
    this.workletNode?.port.postMessage({
      type: 'setAmpEnv',
      ins: insIdx,
      times: points.map(p => p.time),
      levs: points.map(p => p.lev),
    });
  }

  /** Set the filter envelope for an instrument */
  setFilterEnv(insIdx: number, points: SawteethEnvPoint[]): void {
    this.workletNode?.port.postMessage({
      type: 'setFilterEnv',
      ins: insIdx,
      times: points.map(p => p.time),
      levs: points.map(p => p.lev),
    });
  }

  /** Set a single step in the arpeggio/waveform sequence */
  setStep(insIdx: number, stepIdx: number, note: number, wForm: number, relative: boolean): void {
    this.workletNode?.port.postMessage({
      type: 'setStep',
      ins: insIdx,
      stepIdx,
      note,
      wForm,
      relative,
    });
  }

  override dispose(): void {
    super.dispose();
    if (SawteethEngine.instance === this) {
      SawteethEngine.instance = null;
    }
  }
}
