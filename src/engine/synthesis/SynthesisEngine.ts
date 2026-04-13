/**
 * SynthesisEngine.ts — Singleton WASM engine wrapper for Synthesis replayer
 * Whole-song replayer: loads entire file, WASM handles sequencing + audio.
 * Follows the BdEngine/SonicArrangerEngine pattern.
 */

import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getDevilboxAudioContext } from '@/utils/audio-context';

export class SynthesisEngine {
  private static instance: SynthesisEngine | null = null;
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

  static getInstance(): SynthesisEngine {
    if (SynthesisEngine.instance && !SynthesisEngine.instance._disposed) {
      try {
        const currentCtx = getDevilboxAudioContext();
        if (SynthesisEngine.instance.audioContext !== currentCtx) {
          SynthesisEngine.instance.dispose();
        }
      } catch { /* context not yet set */ }
    }
    if (!SynthesisEngine.instance || SynthesisEngine.instance._disposed) {
      SynthesisEngine.instance = new SynthesisEngine();
    }
    return SynthesisEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SynthesisEngine.instance && !SynthesisEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await SynthesisEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[SynthesisEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try { await context.audioWorklet.addModule(`${baseUrl}synthesis/Synthesis.worklet.js?v=${Date.now()}`); } catch { /* already registered */ }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}synthesis/Synthesis.wasm`),
          fetch(`${baseUrl}synthesis/Synthesis.js`),
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
    this.workletNode = new AudioWorkletNode(ctx, 'synthesis-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[SynthesisEngine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
          console.log('[SynthesisEngine] Module loaded, subsongs:', data.subsongCount);
          break;
        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels);
          break;
        case 'songEnd':
          this._songEndCallback?.();
          break;
        case 'error':
          console.error('[SynthesisEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: SynthesisEngine.wasmBinary, jsCode: SynthesisEngine.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> { return this._initPromise; }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('SynthesisEngine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'pause' }); }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelMask', mask });
  }

  onSongEnd(callback: () => void): void { this._songEndCallback = callback; }

  /** Edit a pattern cell in the WASM replayer */  setCell(index: number, row: number, channel: number, note: number, instrument: number, effect: number, effectArg: number): void {    this.workletNode?.port.postMessage({ type: 'setCell', index, row, channel, note, instrument, effect, effectArg });  }  /** Set an instrument parameter by name */  setInstrumentParam(instrument: number, param: string, value: number): void {    this.workletNode?.port.postMessage({ type: 'setInstrumentParam', instrument, param, value });  }  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (SynthesisEngine.instance === this) SynthesisEngine.instance = null;
  }
}
