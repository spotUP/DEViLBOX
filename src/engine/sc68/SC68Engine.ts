/**
 * SC68Engine.ts - Singleton WASM engine wrapper for SC68/SNDH replayer
 *
 * Manages the AudioWorklet node for Atari ST (SC68/SNDH) music playback.
 * Follows the HivelyEngine pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface SC68LoadResult {
  title: string;
  author: string;
  trackCount: number;
  duration: number;
}

type PositionCallback = (msec: number) => void;

export class SC68Engine {
  private static instance: SC68Engine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _loadPromise: Promise<SC68LoadResult> | null = null;
  private _resolveLoad: ((result: SC68LoadResult) => void) | null = null;
  private _rejectLoad: ((err: Error) => void) | null = null;
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

  static getInstance(): SC68Engine {
    if (!SC68Engine.instance || SC68Engine.instance._disposed) {
      SC68Engine.instance = new SC68Engine();
    }
    return SC68Engine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!SC68Engine.instance && !SC68Engine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await SC68Engine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[SC68Engine] Initialization failed:', err);
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
        await context.audioWorklet.addModule(`${baseUrl}sc68/SC68.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}sc68/SC68.wasm`),
          fetch(`${baseUrl}sc68/SC68.js`),
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

    this.workletNode = new AudioWorkletNode(ctx, 'sc68-worklet', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SC68Engine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          if (this._resolveLoad) {
            this._resolveLoad({
              title: data.title,
              author: data.author,
              trackCount: data.trackCount,
              duration: data.duration,
            });
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'error':
          console.error('[SC68Engine]', data.message);
          if (this._rejectLoad) {
            this._rejectLoad(new Error(data.message));
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb(data.msec);
          }
          break;

        case 'trackEnd':
          for (const cb of this._trackEndCallbacks) {
            cb();
          }
          break;
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SC68Engine.wasmBinary,
      jsCode: SC68Engine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Load an SC68/SNDH file from binary data */
  async loadFile(buffer: ArrayBuffer): Promise<SC68LoadResult> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SC68Engine not initialized');

    this._loadPromise = new Promise<SC68LoadResult>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadFile', buffer },
      [buffer],
    );

    return this._loadPromise;
  }

  /** Switch to a specific track (1-based) */
  startTrack(track: number): void {
    this.workletNode?.port.postMessage({ type: 'startTrack', track });
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

  /** Subscribe to position updates (milliseconds). Returns unsubscribe function. */
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
    if (SC68Engine.instance === this) {
      SC68Engine.instance = null;
    }
  }
}
