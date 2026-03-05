/**
 * AdPlugEngine.ts - Singleton WASM engine wrapper for AdPlug OPL2/3 replayer
 *
 * Manages the AudioWorklet node for OPL music file playback.
 * Follows the HivelyEngine pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface AdPlugLoadResult {
  title: string;
  author: string;
  description: string;
  duration: number;
  channels: number;
  format: string; // detected sub-format name
}

type PositionCallback = (msec: number) => void;

export class AdPlugEngine {
  private static instance: AdPlugEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _loadPromise: Promise<AdPlugLoadResult> | null = null;
  private _resolveLoad: ((info: AdPlugLoadResult) => void) | null = null;
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

  static getInstance(): AdPlugEngine {
    if (!AdPlugEngine.instance || AdPlugEngine.instance._disposed) {
      AdPlugEngine.instance = new AdPlugEngine();
    }
    return AdPlugEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!AdPlugEngine.instance && !AdPlugEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await AdPlugEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[AdPlugEngine] Initialization failed:', err);
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
        await context.audioWorklet.addModule(`${baseUrl}adplug/AdPlug.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}adplug/AdPlug.wasm`),
          fetch(`${baseUrl}adplug/AdPlug.js`),
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
          code += '\nvar createAdPlug = createAdPlug || ' + code.match(/var\s+(\w+)\s*=\s*\(\s*\)\s*=>/)?.[1] + ';';
          if (!code.includes('var createAdPlug =')) {
            code += '\n// Factory is already named createAdPlug via EXPORT_NAME';
          }
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

    this.workletNode = new AudioWorkletNode(ctx, 'adplug-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[AdPlugEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'fileLoaded':
          if (this._resolveLoad) {
            this._resolveLoad({
              title: data.title,
              author: data.author,
              description: data.description,
              duration: data.duration,
              channels: data.channels,
              format: data.format,
            });
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'error':
          console.error('[AdPlugEngine]', data.message);
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
      wasmBinary: AdPlugEngine.wasmBinary,
      jsCode: AdPlugEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Load an OPL music file from binary data. Filename is required for format detection. */
  async loadFile(buffer: ArrayBuffer, filename: string): Promise<AdPlugLoadResult> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('AdPlugEngine not initialized');

    this._loadPromise = new Promise<AdPlugLoadResult>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadFile', buffer, filename },
      [buffer] // transfer ownership
    );

    return this._loadPromise;
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

  setTempo(tempo: number): void {
    this.workletNode?.port.postMessage({ type: 'setTempo', tempo });
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
    if (AdPlugEngine.instance === this) {
      AdPlugEngine.instance = null;
    }
  }
}
