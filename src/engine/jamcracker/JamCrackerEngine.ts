/**
 * JamCrackerEngine.ts - Singleton WASM engine wrapper for JamCracker Pro replayer
 *
 * Manages the AudioWorklet node for .jam song playback.
 * Renders at 28150 Hz (PAL Paula) and resamples to AudioContext rate in the worklet.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

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

export class JamCrackerEngine extends WASMSingletonBase {
  private static instance: JamCrackerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _tunePromise: Promise<JamCrackerTuneInfo> | null = null;
  private _resolveTune: ((info: JamCrackerTuneInfo) => void) | null = null;
  private _rejectTune: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _songEndCallbacks: Set<() => void> = new Set();

  private _patternCallbacks: Map<string, (data: any) => void> = new Map();
  private _songStructureResolve: ((data: any) => void) | null = null;
  private _saveResolve: ((data: Uint8Array) => void) | null = null;
  private _requestId = 0;

  private constructor() {
    super();
    this.initialize(JamCrackerEngine.cache);
  }

  static getInstance(): JamCrackerEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!JamCrackerEngine.instance || JamCrackerEngine.instance._disposed ||
        JamCrackerEngine.instance.audioContext !== currentCtx) {
      if (JamCrackerEngine.instance && !JamCrackerEngine.instance._disposed) {
        JamCrackerEngine.instance.dispose();
      }
      JamCrackerEngine.instance = new JamCrackerEngine();
    }
    return JamCrackerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!JamCrackerEngine.instance && !JamCrackerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'jamcracker',
      workletFile: 'JamCracker.worklet.js',
      wasmFile: 'JamCracker.wasm',
      jsFile: 'JamCracker.js',
    };
  }

  protected createNode(): void {
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

        case 'save-data':
          if (this._saveResolve) {
            this._saveResolve(new Uint8Array(data.data));
            this._saveResolve = null;
          }
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
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: JamCrackerEngine.cache.wasmBinary,
      jsCode: JamCrackerEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
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

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
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

  /** Get pattern data with retry on timeout */
  getPatternData(patIdx: number): Promise<{
    numRows: number;
    rows: Array<Array<{
      period: number; instr: number; speed: number; arpeggio: number;
      vibrato: number; phase: number; volume: number; porta: number;
    }>>;
  }> {
    const maxRetries = 3;
    const attempt = (retriesLeft: number): Promise<any> =>
      new Promise((resolve) => {
        if (!this.workletNode) { resolve({ numRows: 0, rows: [] }); return; }
        const requestId = `jc-pat-${this._requestId++}`;
        const timeout = setTimeout(() => {
          this._patternCallbacks.delete(requestId);
          if (retriesLeft > 0) {
            console.warn(`[JamCrackerEngine] Pattern data timeout, retrying (${retriesLeft} left)`);
            resolve(attempt(retriesLeft - 1));
          } else {
            resolve({ numRows: 0, rows: [] });
          }
        }, 3000);
        this._patternCallbacks.set(requestId, (data) => {
          clearTimeout(timeout);
          resolve(data);
        });
        this.workletNode.port.postMessage({ type: 'get-pattern-data', patIdx, requestId });
      });
    return attempt(maxRetries);
  }

  /** Set a single field in a pattern cell */
  setPatternCell(patIdx: number, row: number, channel: number, field: number, value: number): void {
    this.workletNode?.port.postMessage({
      type: 'set-pattern-cell', patIdx, row, channel, field, value,
    });
  }

  /** Get song structure with retry on timeout */
  getSongStructure(): Promise<{
    songLen: number; numPats: number; numInst: number; entries: number[];
  }> {
    const maxRetries = 3;
    const attempt = (retriesLeft: number): Promise<any> =>
      new Promise((resolve) => {
        if (!this.workletNode) { resolve({ songLen: 0, numPats: 0, numInst: 0, entries: [] }); return; }
        const timeout = setTimeout(() => {
          this._songStructureResolve = null;
          if (retriesLeft > 0) {
            console.warn(`[JamCrackerEngine] Song structure timeout, retrying (${retriesLeft} left)`);
            resolve(attempt(retriesLeft - 1));
          } else {
            resolve({ songLen: 0, numPats: 0, numInst: 0, entries: [] });
          }
        }, 3000);
        this._songStructureResolve = (data) => {
          clearTimeout(timeout);
          resolve(data);
        };
        this.workletNode.port.postMessage({ type: 'get-song-structure' });
      });
    return attempt(maxRetries);
  }

  /** Save the current module state as a .jam binary */
  save(): Promise<Uint8Array> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve(new Uint8Array(0)); return; }
      this._saveResolve = resolve;
      this.workletNode.port.postMessage({ type: 'save' });
    });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    this._positionCallbacks.clear();
    this._songEndCallbacks.clear();
    if (JamCrackerEngine.instance === this) {
      JamCrackerEngine.instance = null;
    }
  }
}
