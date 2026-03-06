/**
 * PT2Engine.ts - Singleton WASM engine wrapper for pt2-clone ProTracker replayer
 *
 * Manages the AudioWorklet node for MOD song playback with authentic Paula emulation.
 * Follows the HivelyEngine pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface PT2ModuleInfo {
  name: string;
  songLength: number;
  numPatterns: number;
  numChannels: number;
}

export interface PT2SampleInfo {
  index: number;
  name: string;
  length: number;
  loopStart: number;
  loopLength: number;
  volume: number;
  finetune: number;
}

export interface PT2PositionUpdate {
  position: number;
  row: number;
  pattern: number;
  speed: number;
  bpm: number;
  channels: Array<{
    volume: number;
    period: number;
    sample: number;
  }>;
}

type PositionCallback = (update: PT2PositionUpdate) => void;
type PatternDataCallback = (pattern: number, data: ArrayBuffer) => void;
type SampleInfoCallback = (samples: PT2SampleInfo[]) => void;
type OrderListCallback = (orders: ArrayBuffer, length: number) => void;
type SaveCallback = (data: ArrayBuffer) => void;

export class PT2Engine {
  private static instance: PT2Engine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _modulePromise: Promise<PT2ModuleInfo> | null = null;
  private _resolveModule: ((info: PT2ModuleInfo) => void) | null = null;
  private _rejectModule: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _patternDataCallbacks: Set<PatternDataCallback> = new Set();
  private _sampleInfoCallbacks: Set<SampleInfoCallback> = new Set();
  private _orderListCallbacks: Set<OrderListCallback> = new Set();
  private _saveCallbacks: Array<SaveCallback> = [];
  private _songEndCallbacks: Set<() => void> = new Set();
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): PT2Engine {
    if (!PT2Engine.instance || PT2Engine.instance._disposed) {
      PT2Engine.instance = new PT2Engine();
    }
    return PT2Engine.instance;
  }

  static hasInstance(): boolean {
    return !!PT2Engine.instance && !PT2Engine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await PT2Engine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[PT2Engine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Register worklet module
      try {
        await context.audioWorklet.addModule(`${baseUrl}pt2/PT2Player.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}pt2/PT2Player.wasm`),
          fetch(`${baseUrl}pt2/PT2Player.js`),
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          // Transform Emscripten ESM output for worklet Function() execution
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
            .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
            .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
          if (!code.includes('var createPT2Replayer =')) {
            code += '\n// Factory is already named createPT2Replayer via EXPORT_NAME';
          }
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

    this.workletNode = new AudioWorkletNode(ctx, 'pt2-player-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PT2Engine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          if (this._resolveModule) {
            this._resolveModule({
              name: data.name,
              songLength: data.songLength,
              numPatterns: data.numPatterns,
              numChannels: data.numChannels,
            });
            this._resolveModule = null;
            this._rejectModule = null;
          }
          break;

        case 'error':
          console.error('[PT2Engine]', data.error);
          if (this._rejectModule) {
            this._rejectModule(new Error(data.error));
            this._resolveModule = null;
            this._rejectModule = null;
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb(data as PT2PositionUpdate);
          }
          break;

        case 'patternData':
          for (const cb of this._patternDataCallbacks) {
            cb(data.pattern, data.data);
          }
          break;

        case 'allSampleInfo':
          for (const cb of this._sampleInfoCallbacks) {
            cb(data.samples);
          }
          break;

        case 'sampleInfo':
          // Single sample info — wrap in array for consistency
          for (const cb of this._sampleInfoCallbacks) {
            cb([data]);
          }
          break;

        case 'orderList':
          for (const cb of this._orderListCallbacks) {
            cb(data.data, data.length);
          }
          break;

        case 'savedModule':
          if (this._saveCallbacks.length > 0) {
            const cb = this._saveCallbacks.shift()!;
            cb(data.data);
          }
          break;
      }
    };

    // Send init with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: PT2Engine.wasmBinary,
      jsCode: PT2Engine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Load a MOD file from binary data */
  async loadModule(buffer: ArrayBuffer): Promise<PT2ModuleInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PT2Engine not initialized');

    this._modulePromise = new Promise<PT2ModuleInfo>((resolve, reject) => {
      this._resolveModule = resolve;
      this._rejectModule = reject;
    });

    const copy = buffer.slice(0);
    this.workletNode.port.postMessage(
      { type: 'loadModule', buffer: copy },
      [copy]
    );

    return this._modulePromise;
  }

  play(position = 0, row = 0): void {
    this.workletNode?.port.postMessage({ type: 'play', position, row });
  }

  playPattern(row = 0): void {
    this.workletNode?.port.postMessage({ type: 'playPattern', row });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setPosition(position: number, row = 0): void {
    this.workletNode?.port.postMessage({ type: 'setPosition', position, row });
  }

  setMute(channel: number, muted: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setMute', channel, muted });
  }

  setStereoSeparation(percent: number): void {
    this.workletNode?.port.postMessage({ type: 'setStereoSeparation', percent });
  }

  setAmigaModel(model: number): void {
    this.workletNode?.port.postMessage({ type: 'setAmigaModel', model });
  }

  setLedFilter(on: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setLedFilter', on });
  }

  // ─── Pattern data ─────────────────────────────────────────────

  requestPatternData(pattern: number): void {
    this.workletNode?.port.postMessage({ type: 'getPatternData', pattern });
  }

  setPatternCell(pattern: number, row: number, channel: number, period: number, sample: number, command: number, param: number): void {
    this.workletNode?.port.postMessage({
      type: 'setPatternCell', pattern, row, channel, period, sample, command, param,
    });
  }

  // ─── Order list ───────────────────────────────────────────────

  requestOrderList(): void {
    this.workletNode?.port.postMessage({ type: 'getOrderList' });
  }

  setOrderEntry(position: number, pattern: number): void {
    this.workletNode?.port.postMessage({ type: 'setOrderEntry', position, pattern });
  }

  // ─── Samples ──────────────────────────────────────────────────

  requestAllSampleInfo(): void {
    this.workletNode?.port.postMessage({ type: 'getAllSampleInfo' });
  }

  requestSampleInfo(index: number): void {
    this.workletNode?.port.postMessage({ type: 'getSampleInfo', index });
  }

  setSampleVolume(index: number, volume: number): void {
    this.workletNode?.port.postMessage({ type: 'setSampleVolume', index, volume });
  }

  setSampleFinetune(index: number, finetune: number): void {
    this.workletNode?.port.postMessage({ type: 'setSampleFinetune', index, finetune });
  }

  setSampleLoop(index: number, loopStart: number, loopLength: number): void {
    this.workletNode?.port.postMessage({ type: 'setSampleLoop', index, loopStart, loopLength });
  }

  setSampleName(index: number, name: string): void {
    this.workletNode?.port.postMessage({ type: 'setSampleName', index, name });
  }

  // ─── Save/Export ──────────────────────────────────────────────

  saveModule(): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve) => {
      this._saveCallbacks.push(resolve);
      this.workletNode?.port.postMessage({ type: 'saveModule' });
    });
  }

  // ─── Callbacks ────────────────────────────────────────────────

  onPositionUpdate(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onPatternData(cb: PatternDataCallback): () => void {
    this._patternDataCallbacks.add(cb);
    return () => this._patternDataCallbacks.delete(cb);
  }

  onSampleInfo(cb: SampleInfoCallback): () => void {
    this._sampleInfoCallbacks.add(cb);
    return () => this._sampleInfoCallbacks.delete(cb);
  }

  onOrderList(cb: OrderListCallback): () => void {
    this._orderListCallbacks.add(cb);
    return () => this._orderListCallbacks.delete(cb);
  }

  onSongEnd(cb: () => void): () => void {
    this._songEndCallbacks.add(cb);
    return () => this._songEndCallbacks.delete(cb);
  }

  /** Send a generic message to the worklet */
  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) {
      this.workletNode.port.postMessage(msg, transfers);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._patternDataCallbacks.clear();
    this._sampleInfoCallbacks.clear();
    this._orderListCallbacks.clear();
    this._songEndCallbacks.clear();
    if (PT2Engine.instance === this) {
      PT2Engine.instance = null;
    }
  }
}
