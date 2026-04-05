/**
 * SonixEngine.ts - Singleton WASM engine wrapper for Sonix Music Driver
 *
 * Supports SNX, SMUS, and TINY Sonix music formats.
 * Manages the AudioWorklet node for Sonix module playback.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface SonixMeta {
  format: string;
  numChannels: number;
  numInstruments: number;
  numSamples: number;
}

export class SonixEngine {
  private static instance: SonixEngine | null = null;
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
  private _meta: SonixMeta | null = null;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): SonixEngine {
    if (!SonixEngine.instance || SonixEngine.instance._disposed) {
      SonixEngine.instance = new SonixEngine();
    }
    return SonixEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SonixEngine.instance && !SonixEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await SonixEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[SonixEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}sonix/Sonix.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}sonix/Sonix.wasm`),
          fetch(`${baseUrl}sonix/Sonix.js`),
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

    this.workletNode = new AudioWorkletNode(ctx, 'sonix-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SonixEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          this._meta = data.meta || null;
          console.log('[SonixEngine] Module loaded:', this._meta);
          break;

        case 'error':
          console.error('[SonixEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SonixEngine.wasmBinary,
      jsCode: SonixEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer, sidecarFiles?: Array<{ path: string; data: ArrayBuffer }>): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SonixEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer, sidecarFiles: sidecarFiles || [] },
    );
  }

  get meta(): SonixMeta | null {
    return this._meta;
  }

  play(): void {
    // Playback starts automatically after loadModule
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
  }

  setSoloChannel(channel: number): void {
    this.workletNode?.port.postMessage({ type: 'setSoloChannel', channel });
  }

  setStereoMix(mix: number): void {
    this.workletNode?.port.postMessage({ type: 'setStereoMix', mix });
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (SonixEngine.instance === this) {
      SonixEngine.instance = null;
    }
  }
}
