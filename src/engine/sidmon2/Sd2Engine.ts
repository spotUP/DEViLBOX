/**
 * Sd2Engine.ts - Singleton WASM engine wrapper for SidMon 2.0 replayer
 *
 * Follows the MaEngine/BdEngine singleton pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export class Sd2Engine {
  private static instance: Sd2Engine | null = null;
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

  static getInstance(): Sd2Engine {
    if (!Sd2Engine.instance || Sd2Engine.instance._disposed) {
      Sd2Engine.instance = new Sd2Engine();
    }
    return Sd2Engine.instance;
  }

  static hasInstance(): boolean {
    return !!Sd2Engine.instance && !Sd2Engine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await Sd2Engine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[Sd2Engine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      try { await context.audioWorklet.addModule(`${baseUrl}sidmon2/Sd2.worklet.js`); } catch { /* already registered */ }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}sidmon2/Sd2.wasm`),
          fetch(`${baseUrl}sidmon2/Sd2.js`),
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
    this.workletNode = new AudioWorkletNode(ctx, 'sd2-processor', {
      outputChannelCount: [2], numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      // Check if this is a response to a pending request
      if (this.handleResponse(data)) return;

      switch (data.type) {
        case 'ready':
          console.log('[Sd2Engine] WASM ready');
          if (this._resolveInit) { this._resolveInit(); this._resolveInit = null; }
          break;
        case 'moduleLoaded':
          console.log('[Sd2Engine] Module loaded');
          break;
        case 'error':
          console.error('[Sd2Engine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init', sampleRate: ctx.sampleRate,
      wasmBinary: Sd2Engine.wasmBinary, jsCode: Sd2Engine.jsCode,
    });
    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> { return this._initPromise; }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('Sd2Engine not initialized');
    this.workletNode.port.postMessage({ type: 'loadModule', moduleData: buffer });
  }

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  play(): void { this.workletNode?.port.postMessage({ type: 'play' }); }
  stop(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }
  pause(): void { this.workletNode?.port.postMessage({ type: 'stop' }); }

  noteOn(instrument: number, note: number, velocity: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOn', instrument, note, velocity });
  }

  noteOff(): void {
    this.workletNode?.port.postMessage({ type: 'noteOff' });
  }

  async save(): Promise<ArrayBuffer | null> {
    await this._initPromise;
    const result = await this.sendRequest<{ data: ArrayBuffer | null }>({ type: 'save' });
    return result.data;
  }

  // ---- Track editing API ----

  private _requestId = 0;
  private _pendingRequests = new Map<number, (data: unknown) => void>();

  private sendRequest<T>(message: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, resolve as (data: unknown) => void);
      this.workletNode?.port.postMessage({ ...message, requestId });
    });
  }

  private handleResponse(data: { requestId?: number }): boolean {
    if (data.requestId !== undefined) {
      const resolve = this._pendingRequests.get(data.requestId);
      if (resolve) {
        this._pendingRequests.delete(data.requestId);
        resolve(data);
        return true;
      }
    }
    return false;
  }

  async getNumTracks(): Promise<number> {
    await this._initPromise;
    const result = await this.sendRequest<{ count: number }>({ type: 'getNumTracks' });
    return result.count;
  }

  async getTrackLength(trackIdx: number): Promise<number> {
    await this._initPromise;
    const result = await this.sendRequest<{ length: number }>({ type: 'getTrackLength', trackIdx });
    return result.length;
  }

  async getCell(trackIdx: number, row: number): Promise<{ note: number; instrument: number; effect: number; param: number }> {
    await this._initPromise;
    return this.sendRequest<{ note: number; instrument: number; effect: number; param: number }>({
      type: 'getCell', trackIdx, row,
    });
  }

  async setCell(trackIdx: number, row: number, note: number, instrument: number, effect: number, param: number): Promise<void> {
    await this._initPromise;
    await this.sendRequest<unknown>({ type: 'setCell', trackIdx, row, note, instrument, effect, param });
  }

  async getTrackData(trackIdx: number): Promise<Array<{ note: number; instrument: number; effect: number; param: number }>> {
    await this._initPromise;
    const result = await this.sendRequest<{ cells: Array<{ note: number; instrument: number; effect: number; param: number }> }>({
      type: 'getTrackData', trackIdx,
    });
    return result.cells;
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
    this._pendingRequests.clear();
    if (Sd2Engine.instance === this) Sd2Engine.instance = null;
  }
}
