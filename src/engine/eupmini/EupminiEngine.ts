/**
 * EupminiEngine.ts - Singleton WASM engine wrapper for EUP (FM Towns) replayer
 *
 * Manages the AudioWorklet node for EUP module playback.
 * Follows the JamCrackerEngine/FCEngine/PreTrackerEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import type { FmChannelData, FmSlotData } from '@/engine/fmplayer/FmplayerEngine';

export type { FmChannelData, FmSlotData };

export class EupminiEngine {
  private static instance: EupminiEngine | null = null;
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
  private _pendingFmRequests = new Map<number, (data: FmChannelData) => void>();
  private _pendingCountResolve: ((count: number) => void) | null = null;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): EupminiEngine {
    if (!EupminiEngine.instance || EupminiEngine.instance._disposed) {
      EupminiEngine.instance = new EupminiEngine();
    }
    return EupminiEngine.instance;
  }

  static hasInstance(): boolean {
    return !!EupminiEngine.instance && !EupminiEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await EupminiEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[EupminiEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}eupmini/Eupmini.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}eupmini/Eupmini.wasm`),
          fetch(`${baseUrl}eupmini/Eupmini.js`),
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

    this.workletNode = new AudioWorkletNode(ctx, 'eupmini-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[EupminiEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[EupminiEngine] Module loaded');
          break;

        case 'fmInstrumentData': {
          const d = data.data as FmChannelData;
          const resolve = this._pendingFmRequests.get(d.ch ?? (d as unknown as { inst: number }).inst);
          if (resolve) {
            this._pendingFmRequests.delete(d.ch ?? (d as unknown as { inst: number }).inst);
            resolve(d);
          }
          break;
        }
        case 'numFmInstruments':
          if (this._pendingCountResolve) {
            this._pendingCountResolve(data.count);
            this._pendingCountResolve = null;
          }
          break;
        case 'error':
          console.error('[EupminiEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: EupminiEngine.wasmBinary,
      jsCode: EupminiEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('EupminiEngine not initialized');

    this.workletNode.port.postMessage(
      { type: 'loadModule', moduleData: buffer },
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

  setChannelGain(channel: number, gain: number): void {
    // EUPMini uses binary enable/disable per channel
    this.workletNode?.port.postMessage({ type: 'setChannelMute', channel, muted: gain <= 0 ? 1 : 0 });
  }

  setMuteMask(mask: number): void {
    this.workletNode?.port.postMessage({ type: 'setMuteMask', mask });
  }

  /** Get the number of FM instruments in the loaded EUP file */
  requestNumFmInstruments(): Promise<number> {
    return new Promise((resolve) => {
      this._pendingCountResolve = resolve;
      this.workletNode?.port.postMessage({ type: 'getNumFmInstruments' });
    });
  }

  /** Request full FM instrument data */
  requestFmInstrument(inst: number): Promise<FmChannelData> {
    return new Promise((resolve) => {
      this._pendingFmRequests.set(inst, resolve);
      this.workletNode?.port.postMessage({ type: 'getFmInstrument', inst });
    });
  }

  /** Set a single FM operator parameter on an instrument */
  setFmSlotParam(inst: number, op: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setFmSlotParam', inst, op, paramId, value });
  }

  /** Set an FM channel parameter (alg, fb, pan) on an instrument */
  setFmChParam(inst: number, paramId: number, value: number): void {
    this.workletNode?.port.postMessage({ type: 'setFmChParam', inst, paramId, value });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (EupminiEngine.instance === this) {
      EupminiEngine.instance = null;
    }
  }
}
