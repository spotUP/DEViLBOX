/**
 * RonKlarenEngine.ts — Singleton WASM engine wrapper for RonKlaren replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';

export class RonKlarenEngine {
  private static instance: RonKlarenEngine | null = null;
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
  private _songEndCallback: (() => void) | null = null;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise<void>((resolve) => { this._resolveInit = resolve; });
    this.initialize();
  }

  static getInstance(): RonKlarenEngine {
    if (RonKlarenEngine.instance && !RonKlarenEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (RonKlarenEngine.instance.audioContext !== currentCtx) {
          RonKlarenEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!RonKlarenEngine.instance || RonKlarenEngine.instance._disposed) {
      RonKlarenEngine.instance = new RonKlarenEngine();
    }
    return RonKlarenEngine.instance;
  }

  static hasInstance(): boolean {
    return !!RonKlarenEngine.instance && !RonKlarenEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await RonKlarenEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[RonKlarenEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try { await context.audioWorklet.addModule(`${baseUrl}ronklaren/RonKlaren.worklet.js?v=${Date.now()}`); } catch { /* already registered */ }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}ronklaren/RonKlaren.wasm`),
          fetch(`${baseUrl}ronklaren/RonKlaren.js`),
        ]);
        if (wasmResponse.ok) this.wasmBinary = await wasmResponse.arrayBuffer();
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/self\.location\.href/g, "'.'")
            .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
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
    this.workletNode = new AudioWorkletNode(ctx, 'ronklaren-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[RonKlarenEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[RonKlarenEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels);
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[RonKlarenEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: RonKlarenEngine.wasmBinary, jsCode: RonKlarenEngine.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> { return this._initPromise; }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('RonKlarenEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelMask', mask });
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (RonKlarenEngine.instance === this) RonKlarenEngine.instance = null;
  }
}
