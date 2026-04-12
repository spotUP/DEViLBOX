/**
 * PmdminiEngine.ts - Singleton WASM engine wrapper for pmdmini PMD replayer
 *
 * Manages the AudioWorklet node for PC-98 PMD (Professional Music Driver)
 * playback. Uses pmdmini with fmgen YM2608 (OPNA) emulation.
 * Follows the OrganyaEngine/SC68Engine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class PmdminiEngine {
  private static instance: PmdminiEngine | null = null;
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

  static getInstance(): PmdminiEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!PmdminiEngine.instance || PmdminiEngine.instance._disposed ||
        PmdminiEngine.instance.audioContext !== currentCtx) {
      if (PmdminiEngine.instance && !PmdminiEngine.instance._disposed) {
        PmdminiEngine.instance.dispose();
      }
      PmdminiEngine.instance = new PmdminiEngine();
    }
    return PmdminiEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PmdminiEngine.instance && !PmdminiEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await PmdminiEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[PmdminiEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}pmdmini/Pmdmini.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}pmdmini/Pmdmini.wasm`),
          fetch(`${baseUrl}pmdmini/Pmdmini.js`),
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
            .replace(/HEAP16=new Int16Array\(b\);/, 'HEAP16=new Int16Array(b);Module["HEAP16"]=HEAP16;')
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

    this.workletNode = new AudioWorkletNode(ctx, 'pmdmini-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PmdminiEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[PmdminiEngine] Module loaded', data.meta);
          break;

        case 'error':
          console.error('[PmdminiEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: PmdminiEngine.wasmBinary,
      jsCode: PmdminiEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PmdminiEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
    );
  }

  play(): void {
    // pmdmini starts playing on load, so play is a no-op
    // (song is already playing after loadTune)
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (PmdminiEngine.instance === this) {
      PmdminiEngine.instance = null;
    }
  }
}
