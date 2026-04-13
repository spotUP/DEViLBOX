/**
 * SawteethEngine.ts - Singleton WASM engine wrapper for Sawteeth replayer
 *
 * Manages the AudioWorklet node for Sawteeth (.st) module playback.
 * Follows the OrganyaEngine/MaEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useOscilloscopeStore } from '@/stores/useOscilloscopeStore';

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

export class SawteethEngine {
  private static instance: SawteethEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _disposed = false;
  private _pendingInstrumentRequests = new Map<number, (data: SawteethInstrumentData) => void>();

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
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

  private async initialize(): Promise<void> {
    try {
      await SawteethEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[SawteethEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}sawteeth/Sawteeth.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}sawteeth/Sawteeth.wasm`),
          fetch(`${baseUrl}sawteeth/Sawteeth.js`),
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
            .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
            .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
          this.jsCode = code;
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sawteeth-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
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

        case 'instrumentData': {
          const insData = data.data as SawteethInstrumentData;
          const resolve = this._pendingInstrumentRequests.get(insData.ins);
          if (resolve) {
            resolve(insData);
            this._pendingInstrumentRequests.delete(insData.ins);
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
      wasmBinary: SawteethEngine.wasmBinary,
      jsCode: SawteethEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
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

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (SawteethEngine.instance === this) {
      SawteethEngine.instance = null;
    }
  }
}
