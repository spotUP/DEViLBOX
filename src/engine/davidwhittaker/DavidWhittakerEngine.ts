/**
 * DavidWhittakerEngine.ts — Singleton AudioWorklet wrapper for David Whittaker WASM synth
 *
 * Manages loading DavidWhittaker.wasm + DavidWhittaker.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the HippelCoSoEngine singleton pattern exactly.
 *
 * Usage: call DavidWhittakerEngine.getInstance() to get (or create) the singleton.
 * Multiple DavidWhittakerSynth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class DavidWhittakerEngine {
  private static instance: DavidWhittakerEngine | null = null;
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

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): DavidWhittakerEngine {
    if (!DavidWhittakerEngine.instance || DavidWhittakerEngine.instance._disposed) {
      DavidWhittakerEngine.instance = new DavidWhittakerEngine();
    }
    return DavidWhittakerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!DavidWhittakerEngine.instance && !DavidWhittakerEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await DavidWhittakerEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[DavidWhittakerEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}davidwhittaker/DavidWhittaker.worklet.js`);
      } catch {
        /* Module might already be registered */
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}davidwhittaker/DavidWhittaker.wasm`),
          fetch(`${baseUrl}davidwhittaker/DavidWhittaker.js`),
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

    this.workletNode = new AudioWorkletNode(ctx, 'david-whittaker-processor', {
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
          console.error('[DavidWhittakerEngine]', data.message);
          break;

        case 'playerCreated':
          if (this._playerHandleResolvers.length > 0) {
            const resolve = this._playerHandleResolvers.shift()!;
            resolve(data.handle);
          }
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: DavidWhittakerEngine.wasmBinary,
      jsCode: DavidWhittakerEngine.jsCode,
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

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (DavidWhittakerEngine.instance === this) {
      DavidWhittakerEngine.instance = null;
    }
  }
}
