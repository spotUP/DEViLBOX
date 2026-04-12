/**
 * MdxminiEngine.ts - Singleton WASM engine wrapper for mdxmini MDX player
 *
 * Follows the Sc68Engine/ZxtuneEngine singleton pattern.
 * Plays Sharp X68000 MDX files with built-in YM2151 emulation.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class MdxminiEngine {
  private static instance: MdxminiEngine | null = null;
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
    this._initPromise = new Promise<void>((resolve) => { this._resolveInit = resolve; });
    this.initialize();
  }

  static getInstance(): MdxminiEngine {
    if (!MdxminiEngine.instance || MdxminiEngine.instance._disposed) {
      MdxminiEngine.instance = new MdxminiEngine();
    }
    return MdxminiEngine.instance;
  }

  static hasInstance(): boolean {
    return !!MdxminiEngine.instance && !MdxminiEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await MdxminiEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[MdxminiEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try { await context.audioWorklet.addModule(`${baseUrl}mdxmini/Mdxmini.worklet.js`); } catch { /* already registered */ }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}mdxmini/Mdxmini.wasm`),
          fetch(`${baseUrl}mdxmini/Mdxmini.js`),
        ]);
        if (wasmResponse.ok) this.wasmBinary = await wasmResponse.arrayBuffer();
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
    this.workletNode = new AudioWorkletNode(ctx, 'mdxmini-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[MdxminiEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[MdxminiEngine] MDX module loaded');
          break;
        case 'pdxLoaded':
          console.log('[MdxminiEngine] PDX samples loaded');
          break;
        case 'error':
          console.error('[MdxminiEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: MdxminiEngine.wasmBinary, jsCode: MdxminiEngine.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> { return this._initPromise; }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MdxminiEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  async loadPdx(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('MdxminiEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadPdx', pdxData: buffer });
  }

  play(): void { /* MDX starts playing immediately on load */ }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (MdxminiEngine.instance === this) MdxminiEngine.instance = null;
  }
}
