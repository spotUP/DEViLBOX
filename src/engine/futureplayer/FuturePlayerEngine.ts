/**
 * FuturePlayerEngine.ts - Singleton WASM engine wrapper for Future Player replayer
 *
 * Manages the AudioWorklet node for .fp song playback.
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

export interface FuturePlayerTuneInfo {
  numSubsongs: number;
  sampleRate: number;
}

export interface FPCellData {
  note: number;
  instrument: number;
  effect: number;
  param: number;
}

export interface FPPatternData {
  patIdx: number;
  numRows: number;
  totalRows: number;
  rows: FPCellData[][];  // rows[row][channel]
}

export class FuturePlayerEngine extends WASMSingletonBase {
  private static instance: FuturePlayerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _tunePromise: Promise<FuturePlayerTuneInfo> | null = null;
  private _resolveTune: ((info: FuturePlayerTuneInfo) => void) | null = null;
  private _rejectTune: ((err: Error) => void) | null = null;
  private _requestId = 0;

  private _patternResolves = new Map<number, (data: FPPatternData) => void>();
  private _voiceLengthsResolves = new Map<number, (lengths: number[]) => void>();
  private _shadowDataResolves = new Map<number, (voices: FPCellData[][]) => void>();

  private constructor() {
    super();
    this.initialize(FuturePlayerEngine.cache);
  }

  static getInstance(): FuturePlayerEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!FuturePlayerEngine.instance || FuturePlayerEngine.instance._disposed ||
        FuturePlayerEngine.instance.audioContext !== currentCtx) {
      if (FuturePlayerEngine.instance && !FuturePlayerEngine.instance._disposed) {
        FuturePlayerEngine.instance.dispose();
      }
      FuturePlayerEngine.instance = new FuturePlayerEngine();
    }
    return FuturePlayerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!FuturePlayerEngine.instance && !FuturePlayerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'futureplayer',
      workletFile: 'FuturePlayer.worklet.js',
      wasmFile: 'FuturePlayer.wasm',
      jsFile: 'FuturePlayer.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'futureplayer-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[FuturePlayerEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          if (this._resolveTune) {
            this._resolveTune({
              numSubsongs: data.numSubsongs,
              sampleRate: data.sampleRate,
            });
            this._resolveTune = null;
            this._rejectTune = null;
          }
          break;

        case 'error':
          console.error('[FuturePlayerEngine]', data.message);
          if (this._rejectTune) {
            this._rejectTune(new Error(data.message));
            this._resolveTune = null;
            this._rejectTune = null;
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

        case 'pattern-data': {
          const resolve = this._patternResolves.get(data.requestId);
          if (resolve) {
            this._patternResolves.delete(data.requestId);
            resolve({
              patIdx: data.patIdx,
              numRows: data.numRows,
              totalRows: data.totalRows,
              rows: data.rows,
            });
          }
          break;
        }

        case 'voice-lengths': {
          const resolve = this._voiceLengthsResolves.get(data.requestId);
          if (resolve) {
            this._voiceLengthsResolves.delete(data.requestId);
            resolve(data.lengths);
          }
          break;
        }

        case 'all-shadow-data': {
          const resolve = this._shadowDataResolves.get(data.requestId);
          if (resolve) {
            this._shadowDataResolves.delete(data.requestId);
            resolve(data.voices);
          }
          break;
        }
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      wasmBinary: FuturePlayerEngine.cache.wasmBinary,
      jsCode: FuturePlayerEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async loadTune(buffer: ArrayBuffer): Promise<FuturePlayerTuneInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('FuturePlayerEngine not initialized');

    this._tunePromise = new Promise<FuturePlayerTuneInfo>((resolve, reject) => {
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

  setSubsong(subsong: number): void {
    this.workletNode?.port.postMessage({ type: 'setSubsong', subsong });
  }

  /** Trigger a single instrument for preview (instrPtr = raw binary offset, note 1-96, velocity 0-127) */
  noteOn(instrPtr: number, note: number, velocity: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrPtr, note, velocity });
  }

  /** Stop preview note */
  noteOff(): void {
    this.workletNode?.port.postMessage({ type: 'noteOff' });
  }

  /**
   * Live-edit a single byte in the loaded module buffer. The C side
   * (`fp_wasm_write_byte`) writes to the same `module_copy` buffer that
   * `fp_init` ran against, so the FuturePlayer engine reads the new value
   * on the next instrument re-trigger / envelope tick.
   *
   * Used by FuturePlayerControls to push instrument parameter changes to
   * the running WASM. addr must be < module size or the call is a no-op.
   */
  writeByte(addr: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'write-byte', addr, value });
  }

  /** Bulk variant — copies an entire byte range into the module buffer. */
  writeBytes(addr: number, bytes: Uint8Array): void {
    if (!this.workletNode) return;
    // Transfer the underlying buffer for zero-copy when possible
    const copy = new Uint8Array(bytes); // ensure detached transfer doesn't bite caller
    this.workletNode.port.postMessage({ type: 'write-bytes', addr, bytes: copy }, [copy.buffer]);
  }

  // ── Pattern editing (shadow array) ──────────────────────────────────

  /** Get pattern data from the WASM shadow array.
   *  patIdx = 0-based pattern index, rowsPerPattern = rows per pattern (default 64). */
  getPatternData(patIdx: number, rowsPerPattern = 64): Promise<FPPatternData> {
    if (!this.workletNode) return Promise.reject(new Error('not initialized'));

    const requestId = ++this._requestId;
    return new Promise<FPPatternData>((resolve) => {
      this._patternResolves.set(requestId, resolve);
      this.workletNode!.port.postMessage({
        type: 'get-pattern-data', patIdx, rowsPerPattern, requestId,
      });
    });
  }

  /** Set a single cell in the shadow array.
   *  voice = 0-3, row = absolute row index. */
  setPatternCell(voice: number, row: number, note: number, instrument: number, effect: number, param: number): void {
    this.workletNode?.port.postMessage({
      type: 'set-pattern-cell', voice, row, note, instrument, effect, param,
    });
  }

  /** Get the linearized row count for each voice. */
  getVoiceLengths(): Promise<number[]> {
    if (!this.workletNode) return Promise.reject(new Error('not initialized'));

    const requestId = ++this._requestId;
    return new Promise<number[]>((resolve) => {
      this._voiceLengthsResolves.set(requestId, resolve);
      this.workletNode!.port.postMessage({
        type: 'get-voice-lengths', requestId,
      });
    });
  }

  /** Get the full shadow array data for all 4 voices (for export). */
  getShadowData(): Promise<FPCellData[][]> {
    if (!this.workletNode) return Promise.reject(new Error('not initialized'));

    const requestId = ++this._requestId;
    return new Promise<FPCellData[][]>((resolve) => {
      this._shadowDataResolves.set(requestId, resolve);
      this.workletNode!.port.postMessage({
        type: 'get-all-shadow-data', requestId,
      });
    });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  setInstrumentParam(instrument: number, param: string, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });
  }

  override dispose(): void {
    super.dispose();
    this._patternResolves.clear();
    this._voiceLengthsResolves.clear();
    this._shadowDataResolves.clear();
    if (FuturePlayerEngine.instance === this) {
      FuturePlayerEngine.instance = null;
    }
  }
}
