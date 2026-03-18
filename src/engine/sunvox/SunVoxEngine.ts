/**
 * SunVoxEngine.ts — Singleton Worker+AudioWorklet wrapper for SunVox WASM engine
 *
 * Architecture (Worker + SAB pattern, like Gearmulator):
 *   SunVoxEngine (main thread)
 *     → Worker (SunVox.worker.js) — runs WASM, renders into SharedArrayBuffer
 *     → AudioWorkletNode (SunVox.worklet.js) — reads SAB, outputs to WebAudio
 *
 * This decouples WASM from the audio thread. If WASM hangs or crashes, the
 * Worker thread stalls but the audio thread (WorkletNode) just reads silence
 * from the drained ring buffer. The tab never freezes.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

// ── Public types ─────────────────────────────────────────────────────────────

export interface SunVoxControl {
  name: string;
  min: number;
  max: number;
  value: number;
}

export interface SunVoxModuleInfo {
  id: number;
  name: string;
}

export interface SunVoxModuleGraphEntry {
  id: number;
  name: string;
  typeName: string;
  flags: number;
  inputs: number[];
  outputs: number[];
  controls: SunVoxControl[];
}

export interface SunVoxSongMeta {
  songName: string;
  bpm: number;
  speed: number;
  patCount: number;
}

export interface SunVoxNoteEvent {
  note: number;
  vel: number;
  module: number;  // 0-indexed (-1 = no module, 0 = Output)
  ctl: number;     // CCXX: CC=high byte (controller), XX=low byte (effect)
  ctlVal: number;
}

export interface SunVoxPatternData {
  patIndex: number;
  x: number;        // timeline position (in lines)
  tracks: number;
  lines: number;
  notes: SunVoxNoteEvent[][];  // notes[track][line]
}

// ── Internal resolver types ──────────────────────────────────────────────────

interface PendingResolvers<T> {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class SunVoxEngine {
  private static instance: SunVoxEngine | null = null;

  private audioContext: AudioContext;
  private worker: Worker | null = null;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _rejectInit: ((err: Error) => void) | null = null;
  private _disposed = false;

  // Promise queues for async responses — keyed by handle or "handle:moduleId"
  private _handleQueue: Array<PendingResolvers<number>> = [];
  private _songLoadedQueue: Map<number, PendingResolvers<SunVoxSongMeta>> = new Map();
  private _patternsQueue: Map<number, PendingResolvers<SunVoxPatternData[]>> = new Map();
  private _songSavedQueue: Map<number, PendingResolvers<ArrayBuffer>> = new Map();
  private _synthLoadedQueue: Map<number, PendingResolvers<number>> = new Map();
  private _synthSavedQueue: Map<string, PendingResolvers<ArrayBuffer>> = new Map();
  private _modulesQueue: Map<number, PendingResolvers<SunVoxModuleInfo[]>> = new Map();
  private _controlsQueue: Map<string, PendingResolvers<SunVoxControl[]>> = new Map();
  private _newModuleQueue: Array<PendingResolvers<number>> = [];
  private _removeModuleQueue: Map<string, PendingResolvers<void>> = new Map();
  private _connectQueue: Map<string, PendingResolvers<number>> = new Map();
  private _disconnectQueue: Map<string, PendingResolvers<number>> = new Map();
  private _moduleGraphQueue: Map<number, PendingResolvers<SunVoxModuleGraphEntry[]>> = new Map();

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });

    this.initialize();
  }

  // ── Singleton ──────────────────────────────────────────────────────────────

  static getInstance(): SunVoxEngine {
    if (!SunVoxEngine.instance || SunVoxEngine.instance._disposed) {
      SunVoxEngine.instance = new SunVoxEngine();
    }
    return SunVoxEngine.instance;
  }

  static hasInstance(): boolean {
    return !!SunVoxEngine.instance && !SunVoxEngine.instance._disposed;
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  private async initialize(): Promise<void> {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Ensure AudioContext is running before addModule
      if ((this.audioContext.state as string) !== 'running') {
        this.audioContext.resume().catch(() => {});
        for (let i = 0; i < 40 && (this.audioContext.state as string) !== 'running'; i++) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Register worklet (SAB reader — no WASM)
      try {
        await this.audioContext.audioWorklet.addModule(`${baseUrl}sunvox/SunVox.worklet.js`);
      } catch {
        // Already registered in this context — ignore
      }

      // Create AudioWorkletNode for SAB audio output
      this.workletNode = new AudioWorkletNode(this.audioContext, 'sunvox-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });
      this.workletNode.connect(this.output);

      // Create classic Worker — it loads SunVox WASM via importScripts and renders into SAB
      // Cache-bust so Vite dev server always serves the latest worker script
      this.worker = new Worker(`${baseUrl}sunvox/SunVox.worker.js?v=${Date.now()}`);
      this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
      this.worker.onerror = (e) => {
        console.error('[SunVoxEngine] Worker error:', e);
        const err = new Error(`SunVox worker error: ${e.message}`);
        if (this._rejectInit) {
          this._rejectInit(err);
          this._rejectInit = null;
          this._resolveInit = null;
        }
        this._rejectAll(err);
      };

      // Tell Worker to init WASM (Worker fetches SunVox.js/wasm itself via importScripts)
      this.worker.postMessage({ type: 'init', sampleRate: this.audioContext.sampleRate });

    } catch (err) {
      console.error('[SunVoxEngine] Initialization failed:', err);
      if (this._rejectInit) {
        this._rejectInit(err instanceof Error ? err : new Error(String(err)));
        this._rejectInit = null;
        this._resolveInit = null;
      }
    }
  }

  // ── Worker message dispatcher ──────────────────────────────────────────────

  private handleWorkerMessage(data: {
    type: string;
    handle?: number;
    moduleId?: number;
    buffer?: ArrayBuffer;
    modules?: SunVoxModuleInfo[] | SunVoxModuleGraphEntry[];
    controls?: SunVoxControl[];
    patterns?: SunVoxPatternData[];
    songName?: string;
    bpm?: number;
    speed?: number;
    patCount?: number;
    message?: string;
    sab?: SharedArrayBuffer;
    sourceId?: number;
    destId?: number;
    result?: number;
  }): void {
    switch (data.type) {

      case 'ready':
        // Worker is initialized — forward SAB to worklet, then resolve
        if (data.sab && this.workletNode) {
          this.workletNode.port.postMessage({ type: 'setSAB', sab: data.sab });
        }
        console.log('[SunVoxEngine] Worker ready, SAB forwarded to worklet');
        if (this._resolveInit) {
          this._resolveInit();
          this._resolveInit = null;
          this._rejectInit = null;
        }
        break;

      case 'handleCreated': {
        const resolver = this._handleQueue.shift();
        if (resolver) resolver.resolve(data.handle!);
        break;
      }

      case 'songLoaded': {
        const resolver = this._songLoadedQueue.get(data.handle!);
        if (resolver) {
          this._songLoadedQueue.delete(data.handle!);
          resolver.resolve({
            songName: data.songName ?? '',
            bpm: data.bpm ?? 125,
            speed: data.speed ?? 6,
            patCount: data.patCount ?? 0,
          });
        }
        break;
      }

      case 'patterns': {
        const resolver = this._patternsQueue.get(data.handle!);
        if (resolver) {
          this._patternsQueue.delete(data.handle!);
          resolver.resolve(data.patterns ?? []);
        }
        break;
      }

      case 'songSaved': {
        const resolver = this._songSavedQueue.get(data.handle!);
        if (resolver) {
          this._songSavedQueue.delete(data.handle!);
          resolver.resolve(data.buffer!);
        }
        break;
      }

      case 'moduleLoaded': {
        const resolver = this._synthLoadedQueue.get(data.handle!);
        if (resolver) {
          this._synthLoadedQueue.delete(data.handle!);
          resolver.resolve(data.moduleId!);
        }
        break;
      }

      case 'synthSaved': {
        const key = `${data.handle}:${data.moduleId}`;
        const resolver = this._synthSavedQueue.get(key);
        if (resolver) {
          this._synthSavedQueue.delete(key);
          resolver.resolve(data.buffer!);
        }
        break;
      }

      case 'modules': {
        const resolver = this._modulesQueue.get(data.handle!);
        if (resolver) {
          this._modulesQueue.delete(data.handle!);
          resolver.resolve(data.modules ?? []);
        }
        break;
      }

      case 'controls': {
        const key = `${data.handle}:${data.moduleId}`;
        const resolver = this._controlsQueue.get(key);
        if (resolver) {
          this._controlsQueue.delete(key);
          resolver.resolve(data.controls ?? []);
        }
        break;
      }

      case 'moduleCreated': {
        const resolver = this._newModuleQueue.shift();
        if (resolver) resolver.resolve(data.moduleId!);
        break;
      }

      case 'moduleRemoved': {
        const key = `${data.handle}:${data.moduleId}`;
        const resolver = this._removeModuleQueue.get(key);
        if (resolver) {
          this._removeModuleQueue.delete(key);
          resolver.resolve();
        }
        break;
      }

      case 'modulesConnected': {
        const key = `${data.handle}:${data.sourceId}:${data.destId}`;
        const resolver = this._connectQueue.get(key);
        if (resolver) {
          this._connectQueue.delete(key);
          resolver.resolve(data.result ?? 0);
        }
        break;
      }

      case 'modulesDisconnected': {
        const key = `${data.handle}:${data.sourceId}:${data.destId}`;
        const resolver = this._disconnectQueue.get(key);
        if (resolver) {
          this._disconnectQueue.delete(key);
          resolver.resolve(data.result ?? 0);
        }
        break;
      }

      case 'moduleGraph': {
        const resolver = this._moduleGraphQueue.get(data.handle!);
        if (resolver) {
          this._moduleGraphQueue.delete(data.handle!);
          resolver.resolve((data.modules as SunVoxModuleGraphEntry[]) ?? []);
        }
        break;
      }

      case 'workerLog':
        console.warn('[SunVoxEngine/Worker]', data.message);
        break;

      case 'error': {
        const err = new Error(data.message ?? 'SunVox worker error');
        console.error('[SunVoxEngine]', data.message);
        if (this._rejectInit) {
          this._rejectInit(err);
          this._rejectInit = null;
          this._resolveInit = null;
        }
        this._rejectAll(err);
        break;
      }
    }
  }

  private _rejectAll(err: Error): void {
    for (const r of this._handleQueue) r.reject(err);
    this._handleQueue.length = 0;
    for (const r of this._songLoadedQueue.values()) r.reject(err);
    this._songLoadedQueue.clear();
    for (const r of this._songSavedQueue.values()) r.reject(err);
    this._songSavedQueue.clear();
    for (const r of this._synthLoadedQueue.values()) r.reject(err);
    this._synthLoadedQueue.clear();
    for (const r of this._synthSavedQueue.values()) r.reject(err);
    this._synthSavedQueue.clear();
    for (const r of this._modulesQueue.values()) r.reject(err);
    this._modulesQueue.clear();
    for (const r of this._controlsQueue.values()) r.reject(err);
    this._controlsQueue.clear();
    for (const r of this._patternsQueue.values()) r.reject(err);
    this._patternsQueue.clear();
    for (const r of this._newModuleQueue) r.reject(err);
    this._newModuleQueue.length = 0;
    for (const r of this._removeModuleQueue.values()) r.reject(err);
    this._removeModuleQueue.clear();
    for (const r of this._connectQueue.values()) r.reject(err);
    this._connectQueue.clear();
    for (const r of this._disconnectQueue.values()) r.reject(err);
    this._disconnectQueue.clear();
    for (const r of this._moduleGraphQueue.values()) r.reject(err);
    this._moduleGraphQueue.clear();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async createHandle(_sampleRate: number): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<number>((resolve, reject) => {
      this._handleQueue.push({ resolve, reject });
      this.worker!.postMessage({ type: 'createHandle' });
    });
  }

  destroyHandle(handle: number): void {
    this.worker?.postMessage({ type: 'destroyHandle', handle });
  }

  async loadSong(handle: number, buffer: ArrayBuffer): Promise<SunVoxSongMeta> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<SunVoxSongMeta>((resolve, reject) => {
      this._songLoadedQueue.set(handle, { resolve, reject });
      const copy = buffer.slice(0);
      this.worker!.postMessage({ type: 'loadSong', handle, buffer: copy }, [copy]);
    });
  }

  async getPatterns(handle: number): Promise<SunVoxPatternData[]> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<SunVoxPatternData[]>((resolve, reject) => {
      this._patternsQueue.set(handle, { resolve, reject });
      this.worker!.postMessage({ type: 'getPatterns', handle });
    });
  }

  async saveSong(handle: number): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this._songSavedQueue.set(handle, { resolve, reject });
      this.worker!.postMessage({ type: 'saveSong', handle });
    });
  }

  async loadSynth(handle: number, buffer: ArrayBuffer): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<number>((resolve, reject) => {
      this._synthLoadedQueue.set(handle, { resolve, reject });
      const copy = buffer.slice(0);
      this.worker!.postMessage({ type: 'loadSynth', handle, buffer: copy }, [copy]);
    });
  }

  async saveSynth(handle: number, moduleId: number): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${moduleId}`;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this._synthSavedQueue.set(key, { resolve, reject });
      this.worker!.postMessage({ type: 'saveSynth', handle, moduleId });
    });
  }

  async getModules(handle: number): Promise<SunVoxModuleInfo[]> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<SunVoxModuleInfo[]>((resolve, reject) => {
      this._modulesQueue.set(handle, { resolve, reject });
      this.worker!.postMessage({ type: 'getModules', handle });
    });
  }

  async getControls(handle: number, moduleId: number): Promise<SunVoxControl[]> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${moduleId}`;
    return new Promise<SunVoxControl[]>((resolve, reject) => {
      this._controlsQueue.set(key, { resolve, reject });
      this.worker!.postMessage({ type: 'getControls', handle, moduleId });
    });
  }

  /** Fire-and-forget: send a message directly to the worker. */
  sendMessage(msg: object): void {
    this.worker?.postMessage(msg);
  }

  play(handle: number): void { this.worker?.postMessage({ type: 'play', handle }); }
  stop(handle: number): void { this.worker?.postMessage({ type: 'stop', handle }); }

  noteOn(handle: number, moduleId: number, note: number, vel: number): void {
    this.worker?.postMessage({ type: 'noteOn', handle, moduleId, note, vel });
  }

  noteOff(handle: number, moduleId: number): void {
    this.worker?.postMessage({ type: 'noteOff', handle, moduleId });
  }

  setControl(handle: number, moduleId: number, ctlId: number, value: number): void {
    this.worker?.postMessage({ type: 'setControl', handle, moduleId, ctlId, value });
  }

  // ── Module CRUD (for modular editor) ──────────────────────────────────────

  async newModule(handle: number, moduleType: string): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<number>((resolve, reject) => {
      this._newModuleQueue.push({ resolve, reject });
      this.worker!.postMessage({ type: 'newModule', handle, moduleType });
    });
  }

  async removeModule(handle: number, moduleId: number): Promise<void> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${moduleId}`;
    return new Promise<void>((resolve, reject) => {
      this._removeModuleQueue.set(key, { resolve, reject });
      this.worker!.postMessage({ type: 'removeModule', handle, moduleId });
    });
  }

  async connectModules(handle: number, sourceId: number, destId: number): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${sourceId}:${destId}`;
    return new Promise<number>((resolve, reject) => {
      this._connectQueue.set(key, { resolve, reject });
      this.worker!.postMessage({ type: 'connectModules', handle, sourceId, destId });
    });
  }

  async disconnectModules(handle: number, sourceId: number, destId: number): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${sourceId}:${destId}`;
    return new Promise<number>((resolve, reject) => {
      this._disconnectQueue.set(key, { resolve, reject });
      this.worker!.postMessage({ type: 'disconnectModules', handle, sourceId, destId });
    });
  }

  setModuleControl(handle: number, moduleId: number, ctlId: number, value: number): void {
    this.worker?.postMessage({ type: 'setModuleControl', handle, moduleId, ctlId, value });
  }

  async getModuleGraph(handle: number): Promise<SunVoxModuleGraphEntry[]> {
    await this._initPromise;
    if (this._disposed || !this.worker) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<SunVoxModuleGraphEntry[]>((resolve, reject) => {
      this._moduleGraphQueue.set(handle, { resolve, reject });
      this.worker!.postMessage({ type: 'getModuleGraph', handle });
    });
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  dispose(): void {
    this._disposed = true;
    this._rejectAll(new Error('SunVoxEngine disposed'));
    this.worker?.terminate();
    this.worker = null;
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (SunVoxEngine.instance === this) {
      SunVoxEngine.instance = null;
    }
  }
}
