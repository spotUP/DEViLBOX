/**
 * MaEngine.ts - Singleton WASM engine wrapper for Music-Assembler replayer
 *
 * Follows the JamCrackerEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import { getToneEngine } from '@engine/ToneEngine';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';
import { PositionCallbacks, type EnginePositionUpdate } from '@engine/wasm/PositionCallbacks';
import { loadMaModule } from '@/lib/import/formats/maModule';
import { walkMusicAssembler } from '@/lib/import/formats/maWalk';
import { walkLayout, walkTickPosition, type WalkLayout } from '@/lib/import/formats/walkLayout';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

const meterFeed = new ChannelMeterFeed();

export class MaEngine extends WASMSingletonBase {
  private static instance: MaEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private readonly _positions = new PositionCallbacks();
  /** The grid's layout of the song's tune (the importer's, from the same walk); null for another sub-song (no grid to follow). */
  private _layout: WalkLayout | null = null;
  private _layoutOfTune: WalkLayout | null = null;

  private _requestId = 0;
  private _pendingRequests = new Map<number, (data: any) => void>();

  private constructor() {
    super();
    this.initialize(MaEngine.cache);
  }

  static getInstance(): MaEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !MaEngine.instance ||
      MaEngine.instance._disposed ||
      MaEngine.instance.audioContext !== currentCtx
    ) {
      if (MaEngine.instance && !MaEngine.instance._disposed) {
        MaEngine.instance.dispose();
      }
      MaEngine.instance = new MaEngine();
    }
    return MaEngine.instance;
  }

  static hasInstance(): boolean {
    return !!MaEngine.instance && !MaEngine.instance._disposed;
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'ma',
      workletFile: 'Ma.worklet.js',
      wasmFile: 'Ma.wasm',
      jsFile: 'Ma.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, 'ma-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[MaEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[MaEngine] Module loaded');
          break;
        case 'position': {
          // the worklet posts the player's tick count when it reaches a new row; the grid's (song position, row) of it is the importer's layout of the same walk
          const pos = this._layout && typeof data.ticks === 'number' ? walkTickPosition(this._layout, data.ticks) : null;
          if (pos) this._positions.emit(pos);
          break;
        }
        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            const noteStarts: number[] | null = data.noteStarts;
            if (noteStarts) meterFeed.feedCounted(engine, levels, noteStarts);
            else meterFeed.feed(engine, levels);
          } catch { /* ToneEngine not ready */ }
          break;
        case 'trackLength':
        case 'cellData':
        case 'patternData':
        case 'cellSet':
        case 'numTracks':
        case 'save-data': {
          const resolve = this._pendingRequests.get(data.requestId);
          if (resolve) {
            this._pendingRequests.delete(data.requestId);
            resolve(data);
          }
          break;
        }
        case 'error':
          console.error('[MaEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: MaEngine.cache.wasmBinary, jsCode: MaEngine.cache.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  /** Swap the playing module for an edited one without restarting: the worklet runs it silently up to the position played. */
  swapModule(buffer: ArrayBuffer, subsong = 0): void {
    this.workletNode?.port.postMessage({ type: 'swapModule', moduleData: buffer, subsong });
  }

  /** Load the module and start on `subsong` (0-based) - the tune the song's grid shows. */
  async loadTune(buffer: ArrayBuffer, subsong = 0): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MaEngine not initialized');
    // the importer's grid layout of the tune, from the same walk
    const m = loadMaModule(new Uint8Array(buffer));
    const walk = m ? walkMusicAssembler(m, subsong) : null;
    this._layoutOfTune = walk && walk.stop !== 'ended' ? walkLayout(walk) : null;
    this._layout = this._layoutOfTune;
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer, subsong });
  }

  /** The row and song-order index the replayer is on, as the grid shows them. */
  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  /**
   * Trigger instrument preview (0-based instrument index, 0-47 note index, 0-64 velocity).
   * Note index: 12 = C-3 (period 856). Uses MA period table directly.
   */
  noteOn(instrument: number, note: number, velocity: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrument, note, velocity });
  }

  /** Stop instrument preview */
  noteOff(): void {
    this.workletNode?.port.postMessage({ type: 'noteOff' });
  }

  /** Save/export the module binary */
  async save(): Promise<Uint8Array> {
    await this._initPromise;
    const data = await this._sendRequest<{ data: ArrayBuffer | null }>({ type: 'save' });
    if (!data.data) return new Uint8Array(0);
    return new Uint8Array(data.data);
  }

  private _sendRequest<T>(msg: Record<string, unknown>): Promise<T> {
    const requestId = ++this._requestId;
    return new Promise<T>((resolve) => {
      this._pendingRequests.set(requestId, resolve as (data: any) => void);
      this.workletNode?.port.postMessage({ ...msg, requestId });
    });
  }

  /** Get number of tracks in the loaded module */
  async getNumTracks(): Promise<number> {
    await this._initPromise;
    const data = await this._sendRequest<{ count: number }>({ type: 'getNumTracks' });
    return data.count;
  }

  /** Get number of events in a track */
  async getTrackLength(trackIdx: number): Promise<number> {
    await this._initPromise;
    const data = await this._sendRequest<{ length: number }>({ type: 'getTrackLength', trackIdx });
    return data.length;
  }

  /** Get full pattern data for a track: array of decoded events */
  async getPatternData(trackIdx: number): Promise<{
    trackIdx: number;
    events: Array<{ note: number; instrument: number; release: number; delay: number }>;
  }> {
    await this._initPromise;
    return this._sendRequest({ type: 'getPatternData', trackIdx });
  }

  /** Set a single cell in a track */
  async setPatternCell(
    trackIdx: number, eventIdx: number,
    note: number, instrument: number, release: number, delay: number,
  ): Promise<void> {
    await this._initPromise;
    await this._sendRequest({ type: 'setCell', trackIdx, eventIdx, note, instrument, release, delay });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  override dispose(): void {
    this._positions.clear();
    super.dispose();
    this._pendingRequests.clear();
    if (MaEngine.instance === this) MaEngine.instance = null;
  }
}
