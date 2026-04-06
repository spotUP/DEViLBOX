/**
 * TFMXEngine.ts — Singleton AudioWorklet wrapper for TFMX WASM synth
 *
 * Manages loading TFMX.wasm + TFMX.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the SoundMonEngine singleton pattern exactly.
 *
 * Usage: call TFMXEngine.getInstance() to get (or create) the singleton.
 * Multiple TFMXSynth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class TFMXEngine {
  private static instance: TFMXEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _playerHandleResolvers: Array<(handle: number) => void> = [];
  private _disposed = false;
  private _positionCallbacks: Array<(update: { samplesRendered: number; songEnd: boolean }) => void> = [];
  private _moduleLoadedResolvers: Array<(info: { voices: number; songs: number; duration: number }) => void> = [];

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): TFMXEngine {
    if (!TFMXEngine.instance || TFMXEngine.instance._disposed) {
      TFMXEngine.instance = new TFMXEngine();
    }
    return TFMXEngine.instance;
  }

  static hasInstance(): boolean {
    return !!TFMXEngine.instance && !TFMXEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await TFMXEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[TFMXEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}tfmx/TFMX.worklet.js`);
      } catch {
        /* Module might already be registered */
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}tfmx/TFMX.wasm`),
          fetch(`${baseUrl}tfmx/TFMX.js`),
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
            // Expose heap views on Module so worklet can access them as this.wasm.HEAPU8 / HEAPF32
            .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
            .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
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

    this.workletNode = new AudioWorkletNode(ctx, 'tfmx-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'error':
          console.error('[TFMXEngine]', data.message);
          // Unblock any pending waitForPlayerHandle() callers (e.g. pool-full) with sentinel -1
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(-1);
          }
          // Unblock any pending loadTune() callers on module load failure
          if (this._moduleLoadedResolvers.length > 0) {
            const resolve = this._moduleLoadedResolvers.shift()!;
            resolve({ voices: 0, songs: 0, duration: 0 });
          }
          break;

        case 'playerCreated':
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(data.handle);
          }
          break;

        case 'moduleLoaded':
          if (this._moduleLoadedResolvers.length > 0) {
            const resolve = this._moduleLoadedResolvers.shift()!;
            resolve({ voices: data.voices, songs: data.songs, duration: data.duration });
          }
          break;

        case 'modulePosition':
          for (const cb of this._positionCallbacks) {
            cb({ samplesRendered: data.samplesRendered, songEnd: data.songEnd });
          }
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: TFMXEngine.wasmBinary,
      jsCode: TFMXEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) {
      this.workletNode.port.postMessage(msg, transfers);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  waitForPlayerHandle(): Promise<number> {
    return new Promise<number>((resolve) => {
      this._playerHandleResolvers.push(resolve);
    });
  }

  // ── Full-module playback API (singleton engine pattern) ──────────────────

  /**
   * Load a full TFMX module (mdat + optional smpl companion) for playback.
   * Returns module info: { voices, songs, duration }.
   */
  async loadTune(mdatData: ArrayBuffer, smplData?: ArrayBuffer): Promise<{ voices: number; songs: number; duration: number }> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('TFMXEngine not initialized');

    const mdatCopy = mdatData.slice(0);
    const smplCopy = smplData ? smplData.slice(0) : null;
    const transfers: Transferable[] = [mdatCopy];
    if (smplCopy) transfers.push(smplCopy);

    const promise = new Promise<{ voices: number; songs: number; duration: number }>((resolve) => {
      this._moduleLoadedResolvers.push(resolve);
    });

    this.workletNode.port.postMessage({
      type: 'loadModule',
      mdatBuffer: mdatCopy,
      smplBuffer: smplCopy,
      subsong: 0,
    }, transfers);

    return promise;
  }

  play(): void {
    this.sendMessage({ type: 'modulePlay' });
  }

  pause(): void {
    // TFMX doesn't support true pause — stop the module
    this.sendMessage({ type: 'moduleStop' });
  }

  stop(): void {
    this.sendMessage({ type: 'moduleStop' });
    this._positionCallbacks = [];
  }

  onPositionUpdate(callback: (update: { samplesRendered: number; songEnd: boolean }) => void): () => void {
    this._positionCallbacks.push(callback);
    return () => {
      const idx = this._positionCallbacks.indexOf(callback);
      if (idx >= 0) this._positionCallbacks.splice(idx, 1);
    };
  }

  setMuteMask(mask: number): void {
    // mask: bit N = 1 means voice N is muted
    for (let v = 0; v < 7; v++) {
      this.sendMessage({ type: 'moduleMuteVoice', voice: v, mute: (mask & (1 << v)) !== 0 });
    }
  }

  dispose(): void {
    this._disposed = true;
    this._positionCallbacks = [];
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (TFMXEngine.instance === this) {
      TFMXEngine.instance = null;
    }
  }
}
