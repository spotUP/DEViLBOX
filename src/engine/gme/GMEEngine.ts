/**
 * GMEEngine.ts - Singleton WASM engine wrapper for Game_Music_Emu playback
 *
 * Manages the AudioWorklet node for chiptune file playback (NSF, SPC, VGM, GBS, etc.).
 * Follows the HivelyEngine pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface GMELoadResult {
  trackCount: number;
}

export interface GMETrackInfo {
  title: string;
  author: string;
  game: string;
  system: string;
  length: number; // ms, -1 if unknown
  voiceCount: number;
  track: number;
}

export interface RegisterLogEntry {
  chip: number;
  addr: number;
  data: number;
  timestamp: number;
}

type PositionCallback = (msec: number) => void;

export class GMEEngine {
  private static instance: GMEEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _loadPromise: Promise<GMELoadResult> | null = null;
  private _resolveLoad: ((result: GMELoadResult) => void) | null = null;
  private _rejectLoad: ((err: Error) => void) | null = null;
  private _trackPromise: Promise<GMETrackInfo> | null = null;
  private _resolveTrack: ((info: GMETrackInfo) => void) | null = null;
  private _rejectTrack: ((err: Error) => void) | null = null;
  private _regLogPromise: Promise<RegisterLogEntry[]> | null = null;
  private _resolveRegLog: ((entries: RegisterLogEntry[]) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _trackEndCallbacks: Set<() => void> = new Set();
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): GMEEngine {
    if (!GMEEngine.instance || GMEEngine.instance._disposed) {
      GMEEngine.instance = new GMEEngine();
    }
    return GMEEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!GMEEngine.instance && !GMEEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await GMEEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[GMEEngine] Initialization failed:', err);
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
        await context.audioWorklet.addModule(`${baseUrl}gme/GME.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}gme/GME.wasm`),
          fetch(`${baseUrl}gme/GME.js`),
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          this.jsCode = await jsResponse.text();
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'gme-worklet', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[GMEEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          if (this._resolveLoad) {
            this._resolveLoad({ trackCount: data.trackCount });
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'trackInfo':
          if (this._resolveTrack) {
            this._resolveTrack({
              title: data.title,
              author: data.author,
              game: data.game,
              system: data.system,
              length: data.length,
              voiceCount: data.voiceCount,
              track: data.track,
            });
            this._resolveTrack = null;
            this._rejectTrack = null;
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb(data.msec);
          }
          break;

        case 'trackEnded':
          for (const cb of this._trackEndCallbacks) {
            cb();
          }
          break;

        case 'registerLog':
          if (this._resolveRegLog) {
            this._resolveRegLog(data.entries);
            this._resolveRegLog = null;
          }
          break;

        case 'error':
          console.error('[GMEEngine]', data.message);
          if (this._rejectLoad) {
            this._rejectLoad(new Error(data.message));
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          if (this._rejectTrack) {
            this._rejectTrack(new Error(data.message));
            this._resolveTrack = null;
            this._rejectTrack = null;
          }
          break;
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: GMEEngine.wasmBinary,
      jsCode: GMEEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Load a chiptune file from binary data */
  async loadFile(buffer: ArrayBuffer): Promise<GMELoadResult> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('GMEEngine not initialized');

    this._loadPromise = new Promise<GMELoadResult>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadFile', buffer },
      [buffer],
    );

    return this._loadPromise;
  }

  /** Start playback of a specific track */
  async startTrack(track: number): Promise<GMETrackInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('GMEEngine not initialized');

    this._trackPromise = new Promise<GMETrackInfo>((resolve, reject) => {
      this._resolveTrack = resolve;
      this._rejectTrack = reject;
    });

    this.workletNode.port.postMessage({ type: 'startTrack', track });

    return this._trackPromise;
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

  seek(msec: number): void {
    this.workletNode?.port.postMessage({ type: 'seek', msec });
  }

  setTempo(tempo: number): void {
    this.workletNode?.port.postMessage({ type: 'setTempo', tempo });
  }

  muteVoice(index: number, mute: boolean): void {
    this.workletNode?.port.postMessage({ type: 'muteVoice', index, mute });
  }

  enableRegisterLog(enable: boolean): void {
    this.workletNode?.port.postMessage({ type: 'enableRegisterLog', enable });
  }

  async getRegisterLog(): Promise<RegisterLogEntry[]> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('GMEEngine not initialized');

    this._regLogPromise = new Promise<RegisterLogEntry[]>((resolve) => {
      this._resolveRegLog = resolve;
    });

    this.workletNode.port.postMessage({ type: 'getRegisterLog' });

    return this._regLogPromise;
  }

  /** Subscribe to position updates (msec). Returns unsubscribe function. */
  onPosition(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  /** Subscribe to track end events. Returns unsubscribe function. */
  onTrackEnd(cb: () => void): () => void {
    this._trackEndCallbacks.add(cb);
    return () => this._trackEndCallbacks.delete(cb);
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._trackEndCallbacks.clear();
    if (GMEEngine.instance === this) {
      GMEEngine.instance = null;
    }
  }
}
