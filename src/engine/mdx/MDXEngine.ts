/**
 * MDXEngine.ts - Singleton WASM engine wrapper for mdxmini (X68000 MDX) replayer
 *
 * Manages the AudioWorklet node for MDX song playback.
 * Follows the HivelyEngine pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface MDXLoadResult {
  title: string;
  duration: number;
  channels: number;
}

type PositionCallback = (msec: number) => void;

export class MDXEngine {
  private static instance: MDXEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _loadPromise: Promise<MDXLoadResult> | null = null;
  private _resolveLoad: ((result: MDXLoadResult) => void) | null = null;
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

  static getInstance(): MDXEngine {
    if (!MDXEngine.instance || MDXEngine.instance._disposed) {
      MDXEngine.instance = new MDXEngine();
    }
    return MDXEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!MDXEngine.instance && !MDXEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await MDXEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[MDXEngine] Initialization failed:', err);
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
        await context.audioWorklet.addModule(`${baseUrl}mdx/MDX.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}mdx/MDX.wasm`),
          fetch(`${baseUrl}mdx/MDX.js`),
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
          code += '\nvar createMDX = createMDX || ' + code.match(/var\s+(\w+)\s*=\s*\(\s*\)\s*=>/)?.[1] + ';';
          if (!code.includes('var createMDX =')) {
            code += '\n// Factory is already named createMDX via EXPORT_NAME';
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

    this.workletNode = new AudioWorkletNode(ctx, 'mdx-worklet', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[MDXEngine] WASM ready');
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
              channels: data.channels ?? 0,
            });
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'error':
          console.error('[MDXEngine]', data.message);
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
      wasmBinary: MDXEngine.wasmBinary,
      jsCode: MDXEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Load an MDX file from binary data, with optional PDX sample data */
  async loadFile(buffer: ArrayBuffer, pdxBuffer?: ArrayBuffer): Promise<MDXLoadResult> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MDXEngine not initialized');

    this._loadPromise = new Promise<MDXLoadResult>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    const transfers: Transferable[] = [buffer];
    if (pdxBuffer) transfers.push(pdxBuffer);

    this.workletNode.port.postMessage(
      { type: 'loadFile', buffer, pdxBuffer: pdxBuffer ?? null },
      transfers,
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
    if (MDXEngine.instance === this) {
      MDXEngine.instance = null;
    }
  }
}
