/**
 * SunVoxEngine.ts — Singleton AudioWorklet wrapper for SunVox WASM engine
 *
 * Manages loading SunVox.wasm + SunVox.worklet.js and creating/communicating
 * with the AudioWorklet. Follows the HivelyEngine singleton pattern exactly.
 *
 * Usage: call SunVoxEngine.getInstance() to get (or create) the singleton.
 * Async methods (createHandle, loadSong, etc.) send messages and await replies
 * via a Promise queue keyed by response type + optional handle.
 */

import {
  WASMSingletonBase,
  createWASMAssetsCache,
  loadWASMAssets,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

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
  y: number;        // vertical position on timeline
  tracks: number;
  lines: number;
  patName: string;  // pattern name from sv_get_pattern_name
  cloneOf: number;  // patIndex of original if clone, -1 if original
  notes: SunVoxNoteEvent[][];  // notes[track][line]
}

// ── Internal resolver types ──────────────────────────────────────────────────

interface PendingResolvers<T> {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class SunVoxEngine extends WASMSingletonBase {
  private static instance: SunVoxEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _rejectInit: ((err: Error) => void) | null = null;

  // Promise queues for async responses — keyed by "type:handle" or just "type"
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
  private _moduleScopeQueue: Map<string, PendingResolvers<Float32Array>> = new Map();
  private _moduleLevelsQueue: Map<number, PendingResolvers<Float32Array>> = new Map();

  private constructor() {
    super();
    // Replace the base init promise with one that carries a reject handle.
    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });
    this.initializeSunVox();
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'sunvox',
      workletFile: 'SunVox.worklet.js',
      wasmFile: 'SunVox.wasm',
      jsFile: 'SunVox.js',
      workletCacheBust: true,
    };
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

  /**
   * Override of initialize() that resumes the AudioContext before loading the
   * worklet module. iOS won't complete addModule() on a suspended context, so
   * we poll up to 2s for 'running' before delegating to the shared loader.
   */
  private async initializeSunVox(): Promise<void> {
    try {
      const context = this.audioContext;
      if ((context.state as string) !== 'running') {
        console.log('[SunVoxEngine] context suspended — resuming before addModule');
        context.resume().catch(() => {});
        for (let i = 0; i < 40 && (context.state as string) !== 'running'; i++) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if ((context.state as string) !== 'running') {
          console.warn('[SunVoxEngine] AudioContext still suspended — addModule may hang');
        }
      }
      console.log('[SunVoxEngine] calling addModule, context.state:', context.state);

      await loadWASMAssets(this.audioContext, SunVoxEngine.cache, this.getLoaderConfig());
      this.createNode();
      console.log('[SunVoxEngine] node created, init message sent');
    } catch (err) {
      console.error('[SunVoxEngine] Initialization failed:', err);
      if (this._rejectInit) {
        this._rejectInit(err instanceof Error ? err : new Error(String(err)));
        this._rejectInit = null;
        this._resolveInit = null;
      }
    }
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'sunvox-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      this.handleWorkletMessage(event.data);
    };

    // Send WASM binary + JS glue code to the worklet for instantiation
    // Send wasmBinary as Uint8Array for reliable structured clone transfer
    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: SunVoxEngine.cache.wasmBinary ? new Uint8Array(SunVoxEngine.cache.wasmBinary) : null,
      jsCode: SunVoxEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  // ── Worklet message dispatcher ─────────────────────────────────────────────

  private handleWorkletMessage(data: {
    type: string;
    handle?: number;
    moduleId?: number;
    buffer?: ArrayBuffer;
    data?: ArrayBuffer;
    modules?: SunVoxModuleInfo[] | SunVoxModuleGraphEntry[];
    controls?: SunVoxControl[];
    patterns?: SunVoxPatternData[];
    songName?: string;
    bpm?: number;
    speed?: number;
    patCount?: number;
    message?: string;
    sourceId?: number;
    destId?: number;
    result?: number;
    levels?: ArrayBuffer;
  }): void {
    switch (data.type) {
      case 'ready':
        console.log('[SunVoxEngine] WASM ready');
        if (this._resolveInit) {
          this._resolveInit();
          this._resolveInit = null;
          this._rejectInit = null;
        }
        break;

      case 'handle': {
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

      case 'synthLoaded': {
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
        if (resolver) { this._removeModuleQueue.delete(key); resolver.resolve(); }
        break;
      }

      case 'modulesConnected': {
        const key = `${data.handle}:${data.sourceId}:${data.destId}`;
        const resolver = this._connectQueue.get(key);
        if (resolver) { this._connectQueue.delete(key); resolver.resolve(data.result ?? 0); }
        break;
      }

      case 'modulesDisconnected': {
        const key = `${data.handle}:${data.sourceId}:${data.destId}`;
        const resolver = this._disconnectQueue.get(key);
        if (resolver) { this._disconnectQueue.delete(key); resolver.resolve(data.result ?? 0); }
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

      case 'moduleScope': {
        const key = `${data.handle}:${data.moduleId}`;
        const resolver = this._moduleScopeQueue.get(key);
        if (resolver) {
          this._moduleScopeQueue.delete(key);
          resolver.resolve(data.data ? new Float32Array(data.data) : new Float32Array(0));
        }
        break;
      }

      case 'moduleLevels': {
        const resolver = this._moduleLevelsQueue.get(data.handle!);
        if (resolver) {
          this._moduleLevelsQueue.delete(data.handle!);
          resolver.resolve(data.levels ? new Float32Array(data.levels) : new Float32Array(0));
        }
        break;
      }

      case 'error': {
        const err = new Error(data.message ?? 'SunVox worklet error');
        console.error('[SunVoxEngine]', data.message);
        // Reject _initPromise if still pending
        if (this._rejectInit) {
          this._rejectInit(err);
          this._rejectInit = null;
          this._resolveInit = null;
        }
        // Reject any other pending resolvers
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
    for (const r of this._moduleScopeQueue.values()) r.reject(err);
    this._moduleScopeQueue.clear();
    for (const r of this._moduleLevelsQueue.values()) r.reject(err);
    this._moduleLevelsQueue.clear();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Wait for WASM initialization to complete. */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Create a new SunVox instance at the given sample rate.
   * Returns the handle (integer ≥ 0) used for subsequent calls.
   */
  async createHandle(sampleRate: number): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<number>((resolve, reject) => {
      this._handleQueue.push({ resolve, reject });
      this.workletNode!.port.postMessage({ type: 'create', sampleRate });
    });
  }

  /** Destroy a SunVox instance. Fire-and-forget. */
  destroyHandle(handle: number): void {
    this.workletNode?.port.postMessage({ type: 'destroy', handle });
  }

  /** Load a .sunvox song file from an ArrayBuffer. Returns song metadata. */
  async loadSong(handle: number, buffer: ArrayBuffer): Promise<SunVoxSongMeta> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<SunVoxSongMeta>((resolve, reject) => {
      this._songLoadedQueue.set(handle, { resolve, reject });
      // Slice to keep the original buffer intact in the instrument store (IDB needs to clone it).
      const copy = buffer.slice(0);
      this.workletNode!.port.postMessage({ type: 'loadSong', handle, buffer: copy }, [copy]);
    });
  }

  /** Read all patterns from a loaded .sunvox song. */
  async getPatterns(handle: number): Promise<SunVoxPatternData[]> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<SunVoxPatternData[]>((resolve, reject) => {
      this._patternsQueue.set(handle, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getPatterns', handle });
    });
  }

  /** Save the current song to an ArrayBuffer. */
  async saveSong(handle: number): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this._songSavedQueue.set(handle, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'saveSong', handle });
    });
  }

  /**
   * Load a .sunsynth module file into the given SunVox instance.
   * Returns the module_id assigned by SunVox.
   */
  async loadSynth(handle: number, buffer: ArrayBuffer): Promise<number> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<number>((resolve, reject) => {
      this._synthLoadedQueue.set(handle, { resolve, reject });
      // Slice to keep the original buffer intact in the instrument store (IDB needs to clone it).
      const copy = buffer.slice(0);
      this.workletNode!.port.postMessage({ type: 'loadSynth', handle, buffer: copy }, [copy]);
    });
  }

  /** Save a specific module as a .sunsynth ArrayBuffer. */
  async saveSynth(handle: number, moduleId: number): Promise<ArrayBuffer> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    const key = `${handle}:${moduleId}`;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this._synthSavedQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'saveSynth', handle, moduleId });
    });
  }

  /** Get the list of modules (synthesizers, effects) in a SunVox instance. */
  async getModules(handle: number): Promise<SunVoxModuleInfo[]> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    return new Promise<SunVoxModuleInfo[]>((resolve, reject) => {
      this._modulesQueue.set(handle, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getModules', handle });
    });
  }

  /** Get the controls (parameters) of a specific module. */
  async getControls(handle: number, moduleId: number): Promise<SunVoxControl[]> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) {
      throw new Error('[SunVoxEngine] Engine is disposed or not initialized');
    }
    const key = `${handle}:${moduleId}`;
    return new Promise<SunVoxControl[]>((resolve, reject) => {
      this._controlsQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getControls', handle, moduleId });
    });
  }

  /**
   * Send an arbitrary message to the worklet.
   * Use for fire-and-forget commands: noteOn, noteOff, setControl, play, stop.
   */
  sendMessage(msg: object, transfer?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfer && transfer.length > 0) {
      this.workletNode.port.postMessage(msg, transfer);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  // ── Convenience fire-and-forget helpers ────────────────────────────────────

  noteOn(handle: number, moduleId: number, note: number, vel: number): void {
    this.sendMessage({ type: 'noteOn', handle, moduleId, note, vel });
  }

  noteOff(handle: number, moduleId: number): void {
    this.sendMessage({ type: 'noteOff', handle, moduleId });
  }

  setControl(handle: number, moduleId: number, ctlId: number, value: number): void {
    this.sendMessage({ type: 'setControl', handle, moduleId, ctlId, value });
  }

  /** Write a pattern event to the SunVox WASM state. Pass -1 for fields to leave unchanged. */
  setPatternEvent(handle: number, pat: number, track: number, line: number,
    nn: number, vv: number, mm: number, ccee: number, xxyy: number): void {
    this.sendMessage({ type: 'setPatternEvent', handle, pat, track, line, nn, vv, mm, ccee, xxyy });
  }

  muteModule(handle: number, moduleId: number): void {
    this.sendMessage({ type: 'muteModule', handle, moduleId });
  }

  unmuteModule(handle: number, moduleId: number): void {
    this.sendMessage({ type: 'unmuteModule', handle, moduleId });
  }

  /** Chain-aware muting: walks the module graph from each root to Output,
   *  muting entire signal chains. Shared modules stay unmuted if ANY chain is active. */
  setModuleMuteState(handle: number, unmutedRoots: number[], mutedRoots: number[]): void {
    this.sendMessage({ type: 'setModuleMuteState', handle, unmutedRoots, mutedRoots });
  }

  /** Bitmask muting: bit N = generator module N muted. Delegates to chain-aware muting. */
  setMuteMask(handle: number, mask: number): void {
    this.sendMessage({ type: 'setMuteMask', handle, mask });
  }

  play(handle: number, fromBeginning = false): void {
    this.sendMessage({ type: 'play', handle, fromBeginning });
  }

  /**
   * Connect the worklet's raw output directly to a native AudioNode.
   * Tone.js/SAC dispose cycles silently sever native-level connections
   * made through intermediate GainNodes, so ToneEngine routes the worklet
   * directly to synthBus's native node instead.
   * Web Audio connect() is idempotent — safe to call repeatedly.
   */
  connectWorkletTo(destination: AudioNode): void {
    if (this.workletNode) {
      this.workletNode.connect(destination);
    }
  }

  stop(handle: number): void {
    this.sendMessage({ type: 'stop', handle });
  }

  // ── Module CRUD (for modular editor) ──────────────────────────────────────

  async newModule(handle: number, moduleType: string): Promise<number> {
    await this._initPromise;
    if (this._disposed) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<number>((resolve, reject) => {
      this._newModuleQueue.push({ resolve, reject });
      this.workletNode!.port.postMessage({ type: 'newModule', handle, moduleType });
    });
  }

  async removeModule(handle: number, moduleId: number): Promise<void> {
    await this._initPromise;
    if (this._disposed) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${moduleId}`;
    return new Promise<void>((resolve, reject) => {
      this._removeModuleQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'removeModule', handle, moduleId });
    });
  }

  async connectModules(handle: number, sourceId: number, destId: number): Promise<number> {
    await this._initPromise;
    if (this._disposed) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${sourceId}:${destId}`;
    return new Promise<number>((resolve, reject) => {
      this._connectQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'connectModules', handle, sourceId, destId });
    });
  }

  async disconnectModules(handle: number, sourceId: number, destId: number): Promise<number> {
    await this._initPromise;
    if (this._disposed) throw new Error('[SunVoxEngine] not initialized');
    const key = `${handle}:${sourceId}:${destId}`;
    return new Promise<number>((resolve, reject) => {
      this._disconnectQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'disconnectModules', handle, sourceId, destId });
    });
  }

  setModuleControl(handle: number, moduleId: number, ctlId: number, value: number): void {
    this.sendMessage({ type: 'setControl', handle, moduleId, ctlId, value });
  }

  async getModuleGraph(handle: number): Promise<SunVoxModuleGraphEntry[]> {
    await this._initPromise;
    if (this._disposed) throw new Error('[SunVoxEngine] not initialized');
    return new Promise<SunVoxModuleGraphEntry[]>((resolve, reject) => {
      this._moduleGraphQueue.set(handle, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getModuleGraph', handle });
    });
  }

  /** Get oscilloscope waveform data for a specific module (1024 int16 samples → float32). */
  async getModuleScope(handle: number, moduleId: number, channel = 0): Promise<Float32Array> {
    await this._initPromise;
    if (this._disposed || !this.workletNode) return new Float32Array(0);
    const key = `${handle}:${moduleId}`;
    return new Promise<Float32Array>((resolve, reject) => {
      this._moduleScopeQueue.set(key, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getModuleScope', handle, moduleId, channel });
    });
  }

  /** Get RMS levels for multiple modules in one round-trip (for VU meters). */
  async getModuleLevels(handle: number, moduleIds: number[]): Promise<Float32Array> {
    await this._initPromise;
    if (this._disposed || !this.workletNode || moduleIds.length === 0) return new Float32Array(0);
    return new Promise<Float32Array>((resolve, reject) => {
      this._moduleLevelsQueue.set(handle, { resolve, reject });
      this.workletNode!.port.postMessage({ type: 'getModuleLevels', handle, moduleIds });
    });
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  override dispose(): void {
    this._rejectAll(new Error('SunVoxEngine disposed'));
    super.dispose();
    if (SunVoxEngine.instance === this) {
      SunVoxEngine.instance = null;
    }
  }
}
