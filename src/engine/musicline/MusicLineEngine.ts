/**
 * MusicLineEngine.ts - Singleton WASM engine wrapper for MusicLine Editor replayer
 *
 * Manages the AudioWorklet node for MusicLine (.ml) song playback and
 * per-instrument preview. Follows the HivelyEngine pattern: static WASM/JS
 * caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface MusicLineSongInfo {
  title: string;
  author: string;
  subsongs: number;
}

export interface MusicLinePositionUpdate {
  position: number;
  row: number;
  speed: number;
}

export interface MusicLinePatternData {
  partNum: number;
  rows: number;
  data: Uint8Array;  // rows × 4 bytes: [note, inst, fx_hi, fx_lo]
}

export interface MusicLineChannelState {
  channel: number;
  tunePos: number;
  partPos: number;
  partNum: number;
  transpose: number;
  speed: number;
  groove: number;
}

export interface MusicLineSongDetails {
  channelCount: number;
  partLength: number;
  numParts: number;
}

type PositionCallback = (update: MusicLinePositionUpdate) => void;

export class MusicLineEngine {
  private static instance: MusicLineEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _loadPromise: Promise<MusicLineSongInfo> | null = null;
  private _resolveLoad: ((info: MusicLineSongInfo) => void) | null = null;
  private _rejectLoad: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _endedCallbacks: Set<() => void> = new Set();
  private _patternDataCallbacks: Map<number, (data: MusicLinePatternData) => void> = new Map();
  private _channelStateCallbacks: Map<number, (state: MusicLineChannelState) => void> = new Map();
  private _songDetailsCallbacks: Set<(details: MusicLineSongDetails) => void> = new Set();
  private _playing = false;
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): MusicLineEngine {
    if (!MusicLineEngine.instance || MusicLineEngine.instance._disposed) {
      MusicLineEngine.instance = new MusicLineEngine();
    }
    return MusicLineEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!MusicLineEngine.instance && !MusicLineEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await MusicLineEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[MusicLineEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Register worklet module with this context
      try {
        await context.audioWorklet.addModule(`${baseUrl}musicline/MusicLine.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}musicline/MusicLine.wasm`),
          fetch(`${baseUrl}musicline/MusicLine.js`),
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
            cb({ position: data.position, row: data.row, speed: data.speed });
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

        case 'pattern-data': {
          const cb = this._patternDataCallbacks.get(data.partNum);
          if (cb) {
            this._patternDataCallbacks.delete(data.partNum);
            cb({
              partNum: data.partNum,
              rows: data.rows,
              data: new Uint8Array(data.data),
            });
          }
          break;
        }

        case 'channel-state': {
          const cb2 = this._channelStateCallbacks.get(data.channel);
          if (cb2) {
            this._channelStateCallbacks.delete(data.channel);
            const buf = new Uint8Array(data.data);
            cb2({
              channel: data.channel,
              tunePos: buf[0],
              partPos: buf[1],
              partNum: buf[2] | (buf[3] << 8),
              transpose: (buf[4] << 24) >> 24,  // sign-extend s8
              speed: buf[5],
              groove: buf[6],
            });
          }
          break;
        }

        case 'song-info': {
          for (const cb3 of this._songDetailsCallbacks) {
            cb3({
              channelCount: data.channelCount,
              partLength: data.partLength,
              numParts: data.numParts,
            });
          }
          this._songDetailsCallbacks.clear();
          break;
        }
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: MusicLineEngine.wasmBinary,
      jsCode: MusicLineEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
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

  /** Subscribe to song end events. Returns unsubscribe function. */
  onEnded(cb: () => void): () => void {
    this._endedCallbacks.add(cb);
    return () => this._endedCallbacks.delete(cb);
  }

  /** Request pattern data for a specific pattern number. Returns a promise. */
  requestPatternData(partNum: number): Promise<MusicLinePatternData> {
    return new Promise((resolve) => {
      this._patternDataCallbacks.set(partNum, resolve);
      this.workletNode?.port.postMessage({ type: 'get-pattern-data', partNum, maxRows: 128 });
    });
  }

  /** Request channel state for a specific channel. Returns a promise. */
  requestChannelState(channel: number): Promise<MusicLineChannelState> {
    return new Promise((resolve) => {
      this._channelStateCallbacks.set(channel, resolve);
      this.workletNode?.port.postMessage({ type: 'get-channel-state', channel });
    });
  }

  /** Request song details (channel count, pattern count, etc.). */
  requestSongDetails(): Promise<MusicLineSongDetails> {
    return new Promise((resolve) => {
      this._songDetailsCallbacks.add(resolve);
      this.workletNode?.port.postMessage({ type: 'get-song-info' });
    });
  }

  dispose(): void {
    this._disposed = true;
    this.stop();
    this.workletNode?.disconnect();
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._endedCallbacks.clear();
    this._patternDataCallbacks.clear();
    this._channelStateCallbacks.clear();
    this._songDetailsCallbacks.clear();
    if (MusicLineEngine.instance === this) {
      MusicLineEngine.instance = null;
    }
  }
}
