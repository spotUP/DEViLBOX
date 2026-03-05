/**
 * PMDEngine.ts - Singleton WASM engine wrapper for PMD (PC-98) replayer
 *
 * Manages the AudioWorklet node for PMD song playback via pmdmini WASM.
 * Follows the HivelyEngine pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface PMDLoadResult {
  title: string;
  duration: number;
  channels: number; // typically 11 for OPNA
}

type PositionCallback = (msec: number) => void;

export class PMDEngine {
  private static instance: PMDEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _loadPromise: Promise<PMDLoadResult> | null = null;
  private _resolveLoad: ((result: PMDLoadResult) => void) | null = null;
  private _rejectLoad: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _trackEndCallbacks: Set<() => void> = new Set();
  private _title = '';
  private _duration = 0;
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): PMDEngine {
    if (!PMDEngine.instance || PMDEngine.instance._disposed) {
      PMDEngine.instance = new PMDEngine();
    }
    return PMDEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!PMDEngine.instance && !PMDEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await PMDEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[PMDEngine] Initialization failed:', err);
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
        await context.audioWorklet.addModule(`${baseUrl}pmd/PMD.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}pmd/PMD.wasm`),
          fetch(`${baseUrl}pmd/PMD.js`),
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
          code += '\nvar createPMD = createPMD || ' + code.match(/var\s+(\w+)\s*=\s*\(\s*\)\s*=>/)?.[1] + ';';
          if (!code.includes('var createPMD =')) {
            code += '\n// Factory is already named createPMD via EXPORT_NAME';
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

    this.workletNode = new AudioWorkletNode(ctx, 'pmd-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PMDEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          this._title = data.title ?? '';
          this._duration = data.duration ?? 0;
          if (this._resolveLoad) {
            this._resolveLoad({
              title: data.title ?? '',
              duration: data.duration ?? 0,
              channels: data.channels ?? 11,
            });
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'error':
          console.error('[PMDEngine]', data.message);
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
      wasmBinary: PMDEngine.wasmBinary,
      jsCode: PMDEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Load a PMD file from binary data */
  async loadFile(buffer: ArrayBuffer): Promise<PMDLoadResult> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PMDEngine not initialized');

    this._loadPromise = new Promise<PMDLoadResult>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadFile', buffer },
      [buffer], // transfer ownership
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

  getTitle(): string {
    return this._title;
  }

  getDuration(): number {
    return this._duration;
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
    if (PMDEngine.instance === this) {
      PMDEngine.instance = null;
    }
  }
}
