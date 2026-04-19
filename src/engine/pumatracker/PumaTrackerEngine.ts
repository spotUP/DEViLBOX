/**
 * PumaTrackerEngine.ts - Singleton WASM engine wrapper for PumaTracker replayer
 *
 * Manages the AudioWorklet node for PumaTracker module playback.
 * Follows the PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import { getToneEngine } from '@engine/ToneEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** Decoded cell data from a PumaTracker pattern */
export interface PumaCellData {
  noteX2: number;       // note * 2 (0 = no note, must be even when non-zero)
  instrEffect: number;  // bits 4-0 = instrument, bits 7-5 = effect
  param: number;        // effect parameter
}

export class PumaTrackerEngine extends WASMSingletonBase {
  private static instance: PumaTrackerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _pendingRequests: Map<number, { resolve: (data: unknown) => void }> = new Map();
  private _nextRequestId = 1;

  private constructor() {
    super();
    this.initialize(PumaTrackerEngine.cache);
  }

  static getInstance(): PumaTrackerEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !PumaTrackerEngine.instance ||
      PumaTrackerEngine.instance._disposed ||
      PumaTrackerEngine.instance.audioContext !== currentCtx
    ) {
      if (PumaTrackerEngine.instance && !PumaTrackerEngine.instance._disposed) {
        PumaTrackerEngine.instance.dispose();
      }
      PumaTrackerEngine.instance = new PumaTrackerEngine();
    }
    return PumaTrackerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PumaTrackerEngine.instance && !PumaTrackerEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    // NOTE: worklet uses CamelCase "PumaTracker.worklet.js" but wasm/js are
    // lowercase "Pumatracker.wasm/Pumatracker.js" — preserve that exactly.
    return {
      dir: 'pumatracker',
      workletFile: 'PumaTracker.worklet.js',
      wasmFile: 'Pumatracker.wasm',
      jsFile: 'Pumatracker.js',
    };
  }

  protected createNode(): void {
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
      wasmBinary: PumaTrackerEngine.cache.wasmBinary,
      jsCode: PumaTrackerEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
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

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    super.dispose();
    if (PumaTrackerEngine.instance === this) {
      PumaTrackerEngine.instance = null;
    }
  }
}
