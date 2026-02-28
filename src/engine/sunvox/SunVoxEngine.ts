/**
 * SunVoxEngine.ts — Singleton AudioWorklet wrapper for SunVox WASM engine
 *
 * Manages loading SunVox.wasm + SunVox.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the HivelyEngine singleton pattern exactly.
 *
 * Usage: call SunVoxEngine.getInstance() to get (or create) the singleton.
 * Async methods (createHandle, loadSong, etc.) send messages and await replies
 * via a Promise queue keyed by response type + optional handle.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

// ── Public types ─────────────────────────────────────────────────────────────

export interface SunVoxControl {
  name: string;
  min: number;
  max: number;
  value: number;
}

export interface SunVoxModuleInfo {
  id: number;
  name: string;
}

// ── Internal resolver types ──────────────────────────────────────────────────

interface PendingResolvers<T> {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class SunVoxEngine {
  private static instance: SunVoxEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _disposed = false;

  // Promise queues for async responses — keyed by "type:handle" or just "type"
  private _handleQueue: Array<PendingResolvers<number>> = [];
  private _songLoadedQueue: Map<number, PendingResolvers<void>> = new Map();
  private _songSavedQueue: Map<number, PendingResolvers<ArrayBuffer>> = new Map();
  private _synthLoadedQueue: Map<number, PendingResolvers<number>> = new Map();
  private _synthSavedQueue: Map<string, PendingResolvers<ArrayBuffer>> = new Map();
  private _modulesQueue: Map<number, PendingResolvers<SunVoxModuleInfo[]>> = new Map();
  private _controlsQueue: Map<string, PendingResolvers<SunVoxControl[]>> = new Map();

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  // ── Singleton ──────────────────────────────────────────────────────────────

  static getInstance(): SunVoxEngine {
    if (!SunVoxEngine.instance || SunVoxEngine.instance._disposed) {
      SunVoxEngine.instance = new SunVoxEngine();
    }
    return SunVoxEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SunVoxEngine.instance && !SunVoxEngine.instance._disposed;
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  private async initialize(): Promise<void> {
    try {
      await SunVoxEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[SunVoxEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Register worklet module with this AudioContext
      try {
        await context.audioWorklet.addModule(`${baseUrl}sunvox/SunVox.worklet.js`);
      } catch {
        // Module might already be registered in this context
      }

      // Fetch WASM binary and JS glue code (cached across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}sunvox/SunVox.wasm`),
          fetch(`${baseUrl}sunvox/SunVox.js`),
        ]);

        if (!wasmResponse.ok) throw new Error(`[SunVoxEngine] Failed to fetch SunVox.wasm: ${wasmResponse.status}`);
        if (!jsResponse.ok) throw new Error(`[SunVoxEngine] Failed to fetch SunVox.js: ${jsResponse.status}`);

        this.wasmBinary = await wasmResponse.arrayBuffer();

        let code = await jsResponse.text();
        // Transform Emscripten output for Function() execution inside the worklet
        code = code
          .replace(/import\.meta\.url/g, "'.'")
          .replace(/export\s+default\s+\w+;?/g, '')
          .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
          // Mirror HEAPU8/HEAPF32 onto Module so the worklet can access them
          // after memory grows (updateMemoryViews is closure-local in Emscripten)
          .replace(
            /HEAPU8=new Uint8Array\(b\);/,
            'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;',
          )
          .replace(
            /HEAPF32=new Float32Array\(b\);/,
            'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;',
          );
        this.jsCode = code;
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sunvox-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      this.handleWorkletMessage(event.data);
    };

    // Send WASM binary + JS glue code to the worklet for instantiation
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SunVoxEngine.wasmBinary,
      jsCode: SunVoxEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  // ── Worklet message dispatcher ─────────────────────────────────────────────

  private handleWorkletMessage(data: {
    type: string;
    handle?: number;
    moduleId?: number;
    buffer?: ArrayBuffer;
    modules?: SunVoxModuleInfo[];
    controls?: SunVoxControl[];
    message?: string;
  }): void {
    switch (data.type) {
      case 'ready':
        console.log('[SunVoxEngine] WASM ready');
        if (this._resolveInit) {
          this._resolveInit();
          this._resolveInit = null;
        }
        break;

      case 'handle': {
        const resolver = this._handleQueue.shift();
        if (resolver) resolver.resolve(data.handle!);
        break;
      }

      case 'songLoaded': {
        const resolver = this._songLoadedQueue.get(data.handle!);
        if (resolver) {
          this._songLoadedQueue.delete(data.handle!);
          resolver.resolve();
        }
        break;
      }

      case 'songSaved': {
        const resolver = this._songSavedQueue.get(data.handle!);
        if (resolver) {
          this._songSavedQueue.delete(data.handle!);
          resolver.resolve(data.buffer!);
        }
        break;
      }

      case 'synthLoaded': {
        const resolver = this._synthLoadedQueue.get(data.handle!);
        if (resolver) {
          this._synthLoadedQueue.delete(data.handle!);
          resolver.resolve(data.moduleId!);
        }
        break;
      }

      case 'synthSaved': {
        const key = `${data.handle}:${data.moduleId}`;
        const resolver = this._synthSavedQueue.get(key);
        if (resolver) {
          this._synthSavedQueue.delete(key);
          resolver.resolve(data.buffer!);
        }
        break;
      }

      case 'modules': {
        const resolver = this._modulesQueue.get(data.handle!);
        if (resolver) {
          this._modulesQueue.delete(data.handle!);
          resolver.resolve(data.modules ?? []);
        }
        break;
      }

      case 'controls': {
        const key = `${data.handle}:${data.moduleId}`;
        const resolver = this._controlsQueue.get(key);
        if (resolver) {
          this._controlsQueue.delete(key);
          resolver.resolve(data.controls ?? []);
        }
        break;
      }

      case 'error':
        console.error('[SunVoxEngine]', data.message);
        // Reject any pending resolvers that may be waiting
        this._rejectAll(new Error(data.message ?? 'SunVox worklet error'));
        break;
    }
  }

  private _rejectAll(err: Error): void {
    for (const r of this._handleQueue) r.reject(err);
    this._handleQueue.length = 0;

    for (const r of this._songLoadedQueue.values()) r.reject(err);
    this._songLoadedQueue.clear();

    for (const r of this._songSavedQueue.values()) r.reject(err);
    this._songSavedQueue.clear();

    for (const r of this._synthLoadedQueue.values()) r.reject(err);
    this._synthLoadedQueue.clear();

    for (const r of this._synthSavedQueue.values()) r.reject(err);
    this._synthSavedQueue.clear();

    for (const r of this._modulesQueue.values()) r.reject(err);
    this._modulesQueue.clear();

    for (const r of this._controlsQueue.values()) r.reject(err);
    this._controlsQueue.clear();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Wait for WASM initialization to complete. */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Create a new SunVox instance at the given sample rate.
   * Returns the handle (integer ≥ 0) used for subsequent calls.
   */
  async createHandle(sampleRate: number): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<number>((resolve, reject) => {
      this._handleQueue.push({ resolve, reject });
      this.workletNode!.port.postMessage({ type: 'create', sampleRate });
    });
  }

  /** Destroy a SunVox instance. Fire-and-forget. */
  destroyHandle(handle: number): void {
    this.workletNode?.port.postMessage({ type: 'destroy', handle });
  }

  /** Load a .sunvox song file from an ArrayBuffer. Transfers ownership. */
  async loadSong(handle: number, buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<void>((resolve, reject) => {
      this._songLoadedQueue.set(handle, { resolve, reject });
      // Slice to keep the original buffer intact in the instrument store (IDB needs to clone it).
      const copy = buffer.slice(0);
      this.workletNode!.port.postMessage({ type: 'loadSong', handle, buffer: copy }, [copy]);
    });
  }

  /** Save the current song to an ArrayBuffer. */
  async saveSong(handle: number): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this._songSavedQueue.set(handle, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'saveSong', handle });
    });
  }

  /**
   * Load a .sunsynth module file into the given SunVox instance.
   * Returns the module_id assigned by SunVox.
   */
  async loadSynth(handle: number, buffer: ArrayBuffer): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<number>((resolve, reject) => {
      this._synthLoadedQueue.set(handle, { resolve, reject });
      // Slice to keep the original buffer intact in the instrument store (IDB needs to clone it).
      const copy = buffer.slice(0);
      this.workletNode!.port.postMessage({ type: 'loadSynth', handle, buffer: copy }, [copy]);
    });
  }

  /** Save a specific module as a .sunsynth ArrayBuffer. */
  async saveSynth(handle: number, moduleId: number): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    const key = `${handle}:${moduleId}`;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this._synthSavedQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'saveSynth', handle, moduleId });
    });
  }

  /** Get the list of modules (synthesizers, effects) in a SunVox instance. */
  async getModules(handle: number): Promise<SunVoxModuleInfo[]> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<SunVoxModuleInfo[]>((resolve, reject) => {
      this._modulesQueue.set(handle, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getModules', handle });
    });
  }

  /** Get the controls (parameters) of a specific module. */
  async getControls(handle: number, moduleId: number): Promise<SunVoxControl[]> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    const key = `${handle}:${moduleId}`;
    return new Promise<SunVoxControl[]>((resolve, reject) => {
      this._controlsQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getControls', handle, moduleId });
    });
  }

  /**
   * Send an arbitrary message to the worklet.
   * Use for fire-and-forget commands: noteOn, noteOff, setControl, play, stop.
   */
  sendMessage(msg: object, transfer?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfer && transfer.length > 0) {
      this.workletNode.port.postMessage(msg, transfer);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  // ── Convenience fire-and-forget helpers ────────────────────────────────────

  noteOn(handle: number, moduleId: number, note: number, vel: number): void {
    this.sendMessage({ type: 'noteOn', handle, moduleId, note, vel });
  }

  noteOff(handle: number, moduleId: number): void {
    this.sendMessage({ type: 'noteOff', handle, moduleId });
  }

  setControl(handle: number, moduleId: number, ctlId: number, value: number): void {
    this.sendMessage({ type: 'setControl', handle, moduleId, ctlId, value });
  }

  play(handle: number): void {
    this.sendMessage({ type: 'play', handle });
  }

  stop(handle: number): void {
    this.sendMessage({ type: 'stop', handle });
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  dispose(): void {
    this._disposed = true;
    this._rejectAll(new Error('SunVoxEngine disposed'));
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (SunVoxEngine.instance === this) {
      SunVoxEngine.instance = null;
    }
  }
}
