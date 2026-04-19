/**
 * MusicLineEngine.ts - Singleton WASM engine wrapper for MusicLine Editor replayer
 *
 * Manages the AudioWorklet node for MusicLine (.ml) song playback and
 * per-instrument preview. Follows the HivelyEngine pattern: static WASM/JS
 * caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

export interface MusicLineSongInfo {
  title: string;
  author: string;
  subsongs: number;
}

export interface MusicLinePositionUpdate {
  position: number;
  row: number;
  speed: number;
  channelRows?: number[];
  channelPositions?: number[];
}

export interface MusicLineArpEntry {
  note: number;
  smpl: number;
  fx1: number;
  param1: number;
  fx2: number;
  param2: number;
}

type PositionCallback = (update: MusicLinePositionUpdate) => void;

export class MusicLineEngine extends WASMSingletonBase {
  private static instance: MusicLineEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _rejectInit: ((err: Error) => void) | null = null;
  private _loadPromise: Promise<MusicLineSongInfo> | null = null;
  private _resolveLoad: ((info: MusicLineSongInfo) => void) | null = null;
  private _rejectLoad: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _endedCallbacks: Set<() => void> = new Set();
  private _playing = false;

  private _patternCallbacks: Map<string, (data: any) => void> = new Map();
  private _requestId = 0;

  private constructor() {
    super();
    // Replace the base init promise with one that carries a reject handle,
    // so upstream errors surface on ready().
    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });
    this.initialize(MusicLineEngine.cache).catch((err) => {
      this._rejectInit?.(err instanceof Error ? err : new Error(String(err)));
      this._rejectInit = null;
      this._resolveInit = null;
    });
  }

  static getInstance(): MusicLineEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!MusicLineEngine.instance || MusicLineEngine.instance._disposed ||
        MusicLineEngine.instance.audioContext !== currentCtx) {
      // Dispose stale instance if context changed (HMR or rapid reload)
      if (MusicLineEngine.instance && !MusicLineEngine.instance._disposed) {
        MusicLineEngine.instance.dispose();
      }
      MusicLineEngine.instance = new MusicLineEngine();
    }
    return MusicLineEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!MusicLineEngine.instance && !MusicLineEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'musicline',
      workletFile: 'MusicLine.worklet.js',
      wasmFile: 'MusicLine.wasm',
      jsFile: 'MusicLine.js',
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'musicline-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[MusicLineEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          if (this._resolveLoad) {
            this._resolveLoad({
              title: data.title ?? '',
              author: data.author ?? '',
              subsongs: data.subsongs ?? 1,
            });
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'ended':
          this._playing = false;
          for (const cb of this._endedCallbacks) {
            cb();
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb({ position: data.position, row: data.row, speed: data.speed, channelRows: data.channelRows, channelPositions: data.channelPositions });
          }
          break;

        case 'error':
          console.error('[MusicLineEngine]', data.message);
          if (this._rejectLoad) {
            this._rejectLoad(new Error(data.message));
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'pattern-data':
          if (data.requestId && this._patternCallbacks.has(data.requestId)) {
            this._patternCallbacks.get(data.requestId)!(data);
          }
          break;

        case 'arp-data':
          if (data.requestId && this._patternCallbacks.has(data.requestId)) {
            this._patternCallbacks.get(data.requestId)!(data);
          }
          break;
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: MusicLineEngine.cache.wasmBinary,
      jsCode: MusicLineEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Load a .ml song from binary data */
  async loadSong(data: Uint8Array): Promise<MusicLineSongInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MusicLineEngine not initialized');

    this._loadPromise = new Promise<MusicLineSongInfo>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.workletNode.port.postMessage(
      { type: 'load', buffer },
      [buffer]
    );

    return this._loadPromise;
  }

  /** Load a .mli instrument file for preview */
  async loadPreview(data: Uint8Array): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) return;

    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.workletNode.port.postMessage(
      { type: 'preview-load', buffer },
      [buffer]
    );
  }

  play(): void {
    this._playing = true;
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this._playing = false;
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setSubsong(subsong: number): void {
    this.workletNode?.port.postMessage({ type: 'set-subsong', subsong });
  }

  previewNoteOn(instIdx: number, midiNote: number, velocity: number): void {
    this.workletNode?.port.postMessage({
      type: 'preview-note-on',
      instIdx,
      midiNote,
      velocity,
    });
  }

  previewNoteOff(instIdx: number): void {
    this.workletNode?.port.postMessage({ type: 'preview-note-off', instIdx });
  }

  previewStop(): void {
    this.workletNode?.port.postMessage({ type: 'preview-stop' });
  }

  isPlaying(): boolean {
    return this._playing;
  }

  /** Subscribe to position updates (~250ms). Returns unsubscribe function. */
  onPosition(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  /**
   * Wire this engine's position-update stream into a PlaybackCoordinator.
   */
  subscribeToCoordinator(coordinator: import('@engine/PlaybackCoordinator').PlaybackCoordinator): () => void {
    let lastRow = -1;
    let lastPosition = -1;
    return this.onPosition((update) => {
      if (update.row === lastRow && update.position === lastPosition) return;
      lastRow = update.row;
      lastPosition = update.position;
      coordinator.dispatchEnginePosition(update.row, update.position);
    });
  }

  /**
   * Generic position update interface used by NativeEngineRouting.
   * Maps MusicLine's {position, row, speed} to the {songPos, row} format.
   */
  onPositionUpdate(cb: (update: { songPos?: number; row: number }) => void): () => void {
    const wrapper: PositionCallback = (update) => {
      cb({ songPos: update.position, row: update.row });
    };
    this._positionCallbacks.add(wrapper);
    return () => this._positionCallbacks.delete(wrapper);
  }

  /** Subscribe to song end events. Returns unsubscribe function. */
  onEnded(cb: () => void): () => void {
    this._endedCallbacks.add(cb);
    return () => this._endedCallbacks.delete(cb);
  }

  // --------------------------------------------------------------------------
  // Pattern data access (read/write via WASM bridge)
  // --------------------------------------------------------------------------

  /** Get pattern data for a specific part index. Returns array of 128 rows. */
  getPatternData(partIdx: number): Promise<Array<{ note: number; inst: number; fx: number[] }>> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve([]); return; }
      const requestId = `pat-${this._requestId++}`;
      this._patternCallbacks.set(requestId, (data) => {
        this._patternCallbacks.delete(requestId);
        resolve(data.rows);
      });
      this.workletNode.port.postMessage({ type: 'get-pattern-data', partIdx, requestId });
    });
  }

  /** Set a single cell in a pattern. Only provided fields are updated. */
  setPatternCell(partIdx: number, row: number, cell: { note?: number; inst?: number; fx?: number[] }): void {
    this.workletNode?.port.postMessage({
      type: 'set-pattern-cell',
      partIdx,
      row,
      note: cell.note,
      inst: cell.inst,
      fx: cell.fx,
    });
  }

  /** Request song info (numParts, numChannels, numInstruments). */
  getSongInfo(): Promise<{ numParts: number; numChannels: number; numInstruments: number }> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({ numParts: 0, numChannels: 0, numInstruments: 0 }); return; }
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'song-info') {
          this.workletNode!.port.removeEventListener('message', handler);
          resolve(event.data);
        }
      };
      this.workletNode.port.addEventListener('message', handler);
      this.workletNode.port.postMessage({ type: 'get-song-info' });
    });
  }

  // --------------------------------------------------------------------------
  // Instrument parameter access (read/write via WASM bridge)
  // --------------------------------------------------------------------------

  readInstAll(instIdx: number, offsets: Record<string, number>, sizes?: Record<string, number>): Promise<Record<string, number>> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({}); return; }
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'inst-all' && event.data.instIdx === instIdx) {
          this.workletNode!.port.removeEventListener('message', handler);
          resolve(event.data.data);
        }
      };
      this.workletNode.port.addEventListener('message', handler);
      this.workletNode.port.postMessage({ type: 'read-inst-all', instIdx, offsets, sizes });
    });
  }

  getInstOffsets(): Promise<{ offsets: number[]; instSizeof: number }> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({ offsets: [], instSizeof: 0 }); return; }
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'inst-offsets') {
          this.workletNode!.port.removeEventListener('message', handler);
          resolve({ offsets: event.data.offsets, instSizeof: event.data.instSizeof });
        }
      };
      this.workletNode.port.addEventListener('message', handler);
      this.workletNode.port.postMessage({ type: 'get-inst-offsets' });
    });
  }

  writeInstField(instIdx: number, offset: number, size: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'write-inst-field', instIdx, offset, size, value });
  }

  setEffectFlag(instIdx: number, fxIndex: number, value: boolean): void {
    this.workletNode?.port.postMessage({ type: 'set-effect-flag', instIdx, fxIndex, value: value ? 1 : 0 });
  }

  // --------------------------------------------------------------------------
  // Arpeggio table access (read/write via WASM bridge)
  // --------------------------------------------------------------------------

  /** Read the instrument's arpeggio config (table index, speed, groove). */
  readInstArpConfig(instIdx: number): Promise<{ table: number; speed: number; groove: number; numArps: number }> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({ table: -1, speed: 0, groove: 0, numArps: 0 }); return; }
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'inst-arp-config' && event.data.instIdx === instIdx) {
          this.workletNode!.port.removeEventListener('message', handler);
          resolve({ table: event.data.table, speed: event.data.speed, groove: event.data.groove, numArps: event.data.numArps });
        }
      };
      this.workletNode.port.addEventListener('message', handler);
      this.workletNode.port.postMessage({ type: 'get-inst-arp-config', instIdx });
    });
  }

  /** Read a full arpeggio table. Returns Promise with rows array. */
  readArpTable(arpIdx: number): Promise<{ length: number; rows: MusicLineArpEntry[] }> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve({ length: 0, rows: [] }); return; }
      const requestId = `arp-${this._requestId++}`;
      this._patternCallbacks.set(requestId, (data) => {
        this._patternCallbacks.delete(requestId);
        resolve({ length: data.length, rows: data.rows });
      });
      this.workletNode.port.postMessage({ type: 'get-arp-data', arpIdx, requestId });
    });
  }

  /** Write a single field in an arpeggio entry (fire-and-forget). */
  writeArpEntry(arpIdx: number, row: number, fieldIdx: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'set-arp-entry', arpIdx, row, fieldIdx, value });
  }

  // --------------------------------------------------------------------------
  // Channel mute control (maps to m_ChannelsOn bitfield in WASM)
  // --------------------------------------------------------------------------

  /** Set a single channel on (unmuted) or off (muted). ch is 0-based. */
  setChannelOn(ch: number, on: boolean): void {
    this.workletNode?.port.postMessage({ type: 'set-channel-on', channel: ch, on });
  }

  /** Get the current channel-on bitmask (8 bits). Returns via callback. */
  getChannelsOn(): Promise<number> {
    return new Promise((resolve) => {
      if (!this.workletNode) { resolve(0xFF); return; }
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'channels-on') {
          this.workletNode!.port.removeEventListener('message', handler);
          resolve(event.data.mask);
        }
      };
      this.workletNode.port.addEventListener('message', handler);
      this.workletNode.port.postMessage({ type: 'get-channels-on' });
    });
  }

  override dispose(): void {
    // Original used stop() + disconnect() (no 'dispose' message). Preserve.
    this._disposed = true;
    this.stop();
    try { this.workletNode?.disconnect(); } catch { /* */ }
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._endedCallbacks.clear();
    if (MusicLineEngine.instance === this) {
      MusicLineEngine.instance = null;
    }
  }
}
