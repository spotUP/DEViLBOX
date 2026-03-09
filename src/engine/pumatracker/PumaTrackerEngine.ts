/**
 * PumaTrackerEngine.ts - Singleton WASM engine wrapper for PumaTracker replayer
 *
 * Manages the AudioWorklet node for PumaTracker module playback.
 * Follows the PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';

/** Decoded cell data from a PumaTracker pattern */
export interface PumaCellData {
  noteX2: number;       // note * 2 (0 = no note, must be even when non-zero)
  instrEffect: number;  // bits 4-0 = instrument, bits 7-5 = effect
  param: number;        // effect parameter
}

export class PumaTrackerEngine {
  private static instance: PumaTrackerEngine | null = null;
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
  private _pendingRequests: Map<number, { resolve: (data: unknown) => void }> = new Map();
  private _nextRequestId = 1;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): PumaTrackerEngine {
    if (!PumaTrackerEngine.instance || PumaTrackerEngine.instance._disposed) {
      PumaTrackerEngine.instance = new PumaTrackerEngine();
    }
    return PumaTrackerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PumaTrackerEngine.instance && !PumaTrackerEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await PumaTrackerEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[PumaTrackerEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}pumatracker/PumaTracker.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}pumatracker/Pumatracker.wasm`),
          fetch(`${baseUrl}pumatracker/Pumatracker.js`),
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

    this.workletNode = new AudioWorkletNode(ctx, 'pumatracker-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PumaTrackerEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[PumaTrackerEngine] Module loaded');
          break;

        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            for (let i = 0; i < levels.length; i++) {
              engine.triggerChannelMeter(i, levels[i]);
            }
          } catch { /* ToneEngine not ready */ }
          break;

        case 'numPatterns':
        case 'cellData':
        case 'patternData': {
          const pending = this._pendingRequests.get(data.requestId);
          if (pending) {
            this._pendingRequests.delete(data.requestId);
            pending.resolve(data);
          }
          break;
        }

        case 'error':
          console.error('[PumaTrackerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: PumaTrackerEngine.wasmBinary,
      jsCode: PumaTrackerEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PumaTrackerEngine not initialized');

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

  private _sendRequest(msg: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      const requestId = this._nextRequestId++;
      this._pendingRequests.set(requestId, { resolve });
      this.workletNode?.port.postMessage({ ...msg, requestId });
    });
  }

  /** Get the number of patterns in the loaded module */
  async getNumPatterns(): Promise<number> {
    await this._initPromise;
    const data = await this._sendRequest({ type: 'getNumPatterns' }) as { count: number };
    return data.count;
  }

  /** Get all 32 rows of a pattern (single-channel) */
  async getPatternData(patternIdx: number): Promise<PumaCellData[]> {
    await this._initPromise;
    const data = await this._sendRequest({
      type: 'getPatternData',
      patternIdx,
    }) as { cells: PumaCellData[] };
    return data.cells;
  }

  /** Preview a note: trigger instrument on Paula channel 0 */
  noteOn(instrument: number, note: number, velocity = 127): void {
    this.workletNode?.port.postMessage({
      type: 'noteOn',
      instrument,
      note,
      velocity,
    });
  }

  /** Stop the preview note */
  noteOff(): void {
    this.workletNode?.port.postMessage({ type: 'noteOff' });
  }

  /** Set a single cell in a pattern */
  setPatternCell(
    patternIdx: number,
    row: number,
    channel: number,
    cell: PumaCellData,
  ): void {
    this.workletNode?.port.postMessage({
      type: 'setCell',
      patternIdx,
      row,
      channel,
      noteX2: cell.noteX2,
      instrEffect: cell.instrEffect,
      param: cell.param,
    });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (PumaTrackerEngine.instance === this) {
      PumaTrackerEngine.instance = null;
    }
  }
}
