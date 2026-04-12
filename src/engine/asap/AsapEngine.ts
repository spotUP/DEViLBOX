/**
 * AsapEngine.ts - Singleton WASM engine wrapper for ASAP (Another Slight Atari Player)
 *
 * Manages the AudioWorklet node for Atari 8-bit POKEY music playback.
 * Supports SAP, CMC, RMT, TMC, DLT, MPT and more.
 * Follows the OrganyaEngine/Sc68Engine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class AsapEngine {
  private static instance: AsapEngine | null = null;
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

  static getInstance(): AsapEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!AsapEngine.instance || AsapEngine.instance._disposed ||
        AsapEngine.instance.audioContext !== currentCtx) {
      if (AsapEngine.instance && !AsapEngine.instance._disposed) {
        AsapEngine.instance.dispose();
      }
      AsapEngine.instance = new AsapEngine();
    }
    return AsapEngine.instance;
  }

  static hasInstance(): boolean {
    return !!AsapEngine.instance && !AsapEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await AsapEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[AsapEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}asap/Asap.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}asap/Asap.wasm`),
          fetch(`${baseUrl}asap/Asap.js`),
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

    this.workletNode = new AudioWorkletNode(ctx, 'asap-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[AsapEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[AsapEngine] Module loaded', data.meta);
          break;

        case 'error':
          console.error('[AsapEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: AsapEngine.wasmBinary,
      jsCode: AsapEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer, filename?: string): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('AsapEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer, filename: filename || 'tune.sap' },
    );
  }

  play(): void {
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  playSong(song: number): void {
    this.workletNode?.port.postMessage({ type: 'playSong', song });
  }

  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (AsapEngine.instance === this) {
      AsapEngine.instance = null;
    }
  }
}
