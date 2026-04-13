/**
 * V2MEngine.ts - Singleton WASM engine wrapper for V2M (Farbrausch V2 Synthesizer Music) playback
 *
 * Manages the AudioWorklet node for V2M file playback using the jgilje v2m-player WASM module.
 * Follows the OrganyaEngine/JamCrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class V2MEngine {
  private static instance: V2MEngine | null = null;
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

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): V2MEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!V2MEngine.instance || V2MEngine.instance._disposed ||
        V2MEngine.instance.audioContext !== currentCtx) {
      if (V2MEngine.instance && !V2MEngine.instance._disposed) {
        V2MEngine.instance.dispose();
      }
      V2MEngine.instance = new V2MEngine();
    }
    return V2MEngine.instance;
  }

  static hasInstance(): boolean {
    return !!V2MEngine.instance && !V2MEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await V2MEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[V2MEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}V2MPlayer.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}V2MPlayer.wasm`),
          fetch(`${baseUrl}V2MPlayer.js`),
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
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

    this.workletNode = new AudioWorkletNode(ctx, 'v2m-player-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'initialized':
          console.log('[V2MEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'loaded':
          console.log('[V2MEngine] V2M loaded, length:', data.lengthSeconds, 's');
          break;

        case 'finished':
          console.log('[V2MEngine] Playback finished');
          break;

        case 'error':
          console.error('[V2MEngine]', data.error);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: V2MEngine.wasmBinary,
      jsCode: V2MEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('V2MEngine not initialized');

    const data = new Uint8Array(buffer);
    this.workletNode.port.postMessage({ type: 'load', data });
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play', timeMs: 0 });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop', fadeMs: 0 });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop', fadeMs: 0 });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'stop', fadeMs: 0 });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (V2MEngine.instance === this) {
      V2MEngine.instance = null;
    }
  }
}
