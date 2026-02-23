/**
 * HivelyEngine.ts - Singleton WASM engine wrapper for HivelyTracker replayer
 *
 * Manages the AudioWorklet node for HVL/AHX song playback.
 * Follows the DB303Synth pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface HivelyTuneInfo {
  name: string;
  channels: number;
  positions: number;
  trackLength: number;
  subsongs: number;
  speedMultiplier: number;
  restart: number;
  mixGain: number;
  stereoMode: number;
  version: number;
}

export interface HivelyPositionUpdate {
  position: number;
  row: number;
  speed: number;
}

type PositionCallback = (update: HivelyPositionUpdate) => void;

export class HivelyEngine {
  private static instance: HivelyEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _tunePromise: Promise<HivelyTuneInfo> | null = null;
  private _resolveTune: ((info: HivelyTuneInfo) => void) | null = null;
  private _rejectTune: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _songEndCallbacks: Set<() => void> = new Set();
  private _playerHandleResolvers: Array<(handle: number) => void> = [];
  private _disposed = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): HivelyEngine {
    if (!HivelyEngine.instance || HivelyEngine.instance._disposed) {
      HivelyEngine.instance = new HivelyEngine();
    }
    return HivelyEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!HivelyEngine.instance && !HivelyEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await HivelyEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[HivelyEngine] Initialization failed:', err);
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
        await context.audioWorklet.addModule(`${baseUrl}hively/Hively.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}hively/Hively.wasm`),
          fetch(`${baseUrl}hively/Hively.js`),
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
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];');
          code += '\nvar createHively = createHively || ' + code.match(/var\s+(\w+)\s*=\s*\(\s*\)\s*=>/)?.[1] + ';';
          // Simpler approach: just make sure the factory is accessible
          if (!code.includes('var createHively =')) {
            code += '\n// Factory is already named createHively via EXPORT_NAME';
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

    this.workletNode = new AudioWorkletNode(ctx, 'hively-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[HivelyEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'tuneLoaded':
          if (this._resolveTune) {
            this._resolveTune({
              name: data.name,
              channels: data.channels,
              positions: data.positions,
              trackLength: data.trackLength,
              subsongs: data.subsongs,
              speedMultiplier: data.speedMultiplier,
              restart: data.restart,
              mixGain: data.mixGain,
              stereoMode: data.stereoMode,
              version: data.version,
            });
            this._resolveTune = null;
            this._rejectTune = null;
          }
          break;

        case 'error':
          console.error('[HivelyEngine]', data.message);
          if (this._rejectTune) {
            this._rejectTune(new Error(data.message));
            this._resolveTune = null;
            this._rejectTune = null;
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb({ position: data.position, row: data.row, speed: data.speed });
          }
          break;

        case 'songEnd':
          for (const cb of this._songEndCallbacks) {
            cb();
          }
          break;

        case 'playerCreated':
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(data.handle);
          }
          break;
      }
    };

    // Send init message with WASM binary and JS code
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: HivelyEngine.wasmBinary,
      jsCode: HivelyEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /** Load a .hvl or .ahx tune from binary data */
  async loadTune(buffer: ArrayBuffer, defStereo = 2): Promise<HivelyTuneInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('HivelyEngine not initialized');

    this._tunePromise = new Promise<HivelyTuneInfo>((resolve, reject) => {
      this._resolveTune = resolve;
      this._rejectTune = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadTune', buffer, defStereo },
      [buffer] // transfer ownership
    );

    return this._tunePromise;
  }

  /** Switch to a different subsong */
  initSubsong(nr: number): void {
    this.workletNode?.port.postMessage({ type: 'initSubsong', nr });
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

  setLooping(value: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setLooping', value });
  }

  freeTune(): void {
    this.workletNode?.port.postMessage({ type: 'freeTune' });
  }

  /** Subscribe to position updates (~15fps). Returns unsubscribe function. */
  onPositionUpdate(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  /** Subscribe to song end events. Returns unsubscribe function. */
  onSongEnd(cb: () => void): () => void {
    this._songEndCallbacks.add(cb);
    return () => this._songEndCallbacks.delete(cb);
  }

  /** Send a message to the worklet. Optional transferable list for ArrayBuffers. */
  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) {
      this.workletNode.port.postMessage(msg, transfers);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  /** Wait for the next 'playerCreated' message and return the handle. */
  waitForPlayerHandle(): Promise<number> {
    return new Promise<number>((resolve) => {
      this._playerHandleResolvers.push(resolve);
    });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._songEndCallbacks.clear();
    if (HivelyEngine.instance === this) {
      HivelyEngine.instance = null;
    }
  }
}
