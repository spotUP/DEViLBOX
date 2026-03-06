/**
 * JamCrackerEngine.ts - Singleton WASM engine wrapper for JamCracker Pro replayer
 *
 * Manages the AudioWorklet node for .jam song playback.
 * Renders at 28150 Hz (PAL Paula) and resamples to AudioContext rate in the worklet.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface JamCrackerTuneInfo {
  songLength: number;
  numPatterns: number;
  numInstruments: number;
  sampleRate: number;
}

export interface JamCrackerPositionUpdate {
  songPos: number;
  row: number;
  speed: number;
  tick: number;
}

type PositionCallback = (update: JamCrackerPositionUpdate) => void;

export class JamCrackerEngine {
  private static instance: JamCrackerEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _tunePromise: Promise<JamCrackerTuneInfo> | null = null;
  private _resolveTune: ((info: JamCrackerTuneInfo) => void) | null = null;
  private _rejectTune: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
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

  static getInstance(): JamCrackerEngine {
    if (!JamCrackerEngine.instance || JamCrackerEngine.instance._disposed) {
      JamCrackerEngine.instance = new JamCrackerEngine();
    }
    return JamCrackerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!JamCrackerEngine.instance && !JamCrackerEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await JamCrackerEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[JamCrackerEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}jamcracker/JamCracker.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}jamcracker/JamCracker.wasm`),
          fetch(`${baseUrl}jamcracker/JamCracker.js`),
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          // Transform Emscripten output for worklet Function() execution
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

    this.workletNode = new AudioWorkletNode(ctx, 'jamcracker-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[JamCrackerEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          if (this._resolveTune) {
            this._resolveTune({
              songLength: data.songLength,
              numPatterns: data.numPatterns,
              numInstruments: data.numInstruments,
              sampleRate: data.sampleRate,
            });
            this._resolveTune = null;
            this._rejectTune = null;
          }
          break;

        case 'error':
          console.error('[JamCrackerEngine]', data.message);
          if (this._rejectTune) {
            this._rejectTune(new Error(data.message));
            this._resolveTune = null;
            this._rejectTune = null;
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb({
              songPos: data.songPos,
              row: data.row,
              speed: data.speed,
              tick: data.tick,
            });
          }
          break;

        case 'songEnd':
          for (const cb of this._songEndCallbacks) {
            cb();
          }
          break;

        case 'pattern-data':
          if (data.requestId && this._patternCallbacks.has(data.requestId)) {
            this._patternCallbacks.get(data.requestId)!(data);
            this._patternCallbacks.delete(data.requestId);
          }
          break;

        case 'song-structure':
          if (this._songStructureResolve) {
            this._songStructureResolve(data);
            this._songStructureResolve = null;
          }
          break;
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: JamCrackerEngine.wasmBinary,
      jsCode: JamCrackerEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer): Promise<JamCrackerTuneInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('JamCrackerEngine not initialized');

    this._tunePromise = new Promise<JamCrackerTuneInfo>((resolve, reject) => {
      this._resolveTune = resolve;
      this._rejectTune = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadTune', buffer },
      [buffer]
    );

    return this._tunePromise;
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  /** Trigger a single instrument for preview (0-based instrument index, 1-based note 1-36, velocity 0-64) */
  noteOn(instrument: number, note: number, velocity: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrument, note, velocity });
  }

  /** Stop preview note */
  noteOff(): void {
    this.workletNode?.port.postMessage({ type: 'noteOff' });
  }

  onPositionUpdate(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(cb: () => void): () => void {
    this._songEndCallbacks.add(cb);
    return () => this._songEndCallbacks.delete(cb);
  }

  // --------------------------------------------------------------------------
  // Pattern data access
  // --------------------------------------------------------------------------

  private _patternCallbacks: Map<string, (data: any) => void> = new Map();
  private _songStructureResolve: ((data: any) => void) | null = null;
  private _requestId = 0;

  /** Get pattern data: array of rows, each row has 4 channels with 8 fields */
  getPatternData(patIdx: number): Promise<{
    numRows: number;
    rows: Array<Array<{
      period: number; instr: number; speed: number; arpeggio: number;
      vibrato: number; phase: number; volume: number; porta: number;
    }>>;
  }> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({ numRows: 0, rows: [] }); return; }
      const requestId = `jc-pat-${this._requestId++}`;
      this._patternCallbacks.set(requestId, (data) => resolve(data));
      this.workletNode.port.postMessage({ type: 'get-pattern-data', patIdx, requestId });
    });
  }

  /** Set a single field in a pattern cell */
  setPatternCell(patIdx: number, row: number, channel: number, field: number, value: number): void {
    this.workletNode?.port.postMessage({
      type: 'set-pattern-cell', patIdx, row, channel, field, value,
    });
  }

  /** Get song structure: song length, num patterns, num instruments, order list */
  getSongStructure(): Promise<{
    songLen: number; numPats: number; numInst: number; entries: number[];
  }> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({ songLen: 0, numPats: 0, numInst: 0, entries: [] }); return; }
      this._songStructureResolve = resolve;
      this.workletNode.port.postMessage({ type: 'get-song-structure' });
    });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._songEndCallbacks.clear();
    if (JamCrackerEngine.instance === this) {
      JamCrackerEngine.instance = null;
    }
  }
}
