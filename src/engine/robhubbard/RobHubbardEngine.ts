/**
 * RobHubbardEngine.ts — Singleton AudioWorklet wrapper for Rob Hubbard WASM synth
 *
 * Manages loading RobHubbard.wasm + RobHubbard.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the HippelCoSoEngine singleton pattern exactly.
 *
 * Usage: call RobHubbardEngine.getInstance() to get (or create) the singleton.
 * Multiple RobHubbardSynth instances share this single engine.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class RobHubbardEngine {
  private static instance: RobHubbardEngine | null = null;
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

  static getInstance(): RobHubbardEngine {
    if (!RobHubbardEngine.instance || RobHubbardEngine.instance._disposed) {
      RobHubbardEngine.instance = new RobHubbardEngine();
    }
    return RobHubbardEngine.instance;
  }

  static hasInstance(): boolean {
    return !!RobHubbardEngine.instance && !RobHubbardEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await RobHubbardEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[RobHubbardEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}robhubbard/RobHubbard.worklet.js`);
      } catch {
        /* Module might already be registered */
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}robhubbard/RobHubbard.wasm`),
          fetch(`${baseUrl}robhubbard/RobHubbard.js`),
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

    this.workletNode = new AudioWorkletNode(ctx, 'rob-hubbard-processor', {
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
          console.error('[RobHubbardEngine]', data.message);
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
      wasmBinary: RobHubbardEngine.wasmBinary,
      jsCode: RobHubbardEngine.jsCode,
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
    if (RobHubbardEngine.instance === this) {
      RobHubbardEngine.instance = null;
    }
  }
}
