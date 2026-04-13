/**
 * UADEEngine.ts - Singleton WASM engine wrapper for UADE (Universal Amiga Dead-player Engine)
 *
 * Manages the AudioWorklet node for playback of 130+ exotic Amiga music formats
 * (JochenHippel, TFMX, Future Composer, FRED, SidMon, Hippel-7V, etc.).
 *
 * The UADE WASM module emulates the full Amiga 68000 CPU + Paula chip, running
 * real eagleplayer binaries embedded in the WASM. The fork()/socketpair() IPC
 * is replaced with in-memory ring buffers in shim_ipc.c.
 *
 * Follows the HivelyEngine pattern: static WASM/JS caching, per-context worklet loading.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';
import type { IsolationCapableEngine } from '@engine/tone/ChannelRoutedEffects';
import { registerIsolationEngineResolver } from '@engine/tone/ChannelRoutedEffects';
import type { PlaybackCoordinator } from '@engine/PlaybackCoordinator';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';

export interface UADEScanRow {
  period: number;
  volume: number;
  samplePtr: number;
}

/** Enhanced scan row — includes detected effects and sample metadata */
export interface UADEEnhancedScanRow extends UADEScanRow {
  sampleStart: number;  // Current playback pointer
  sampleLen: number;    // Sample length in words
  effTyp: number;       // Detected effect type (XM format: 0=arpeggio, 1=portaUp, etc.)
  eff: number;          // Detected effect parameter
}

/** Extracted PCM sample from Amiga chip RAM */
export interface UADEExtractedSample {
  pcm: Uint8Array;      // 8-bit signed Amiga PCM
  length: number;       // Bytes
  loopStart: number;    // Bytes (0 = no loop)
  loopLength: number;   // Bytes
  typicalPeriod: number; // Most common playback period (for sample rate calculation)
}

/** Enhanced scan data from the worklet */
export interface UADEEnhancedScanData {
  samples: Record<number, UADEExtractedSample>; // samplePtr → extracted sample
  tempoChanges: Array<{ row: number; bpm: number; speed: number }>;
  bpm: number;          // Detected BPM
  speed: number;        // Detected speed (CIA ticks per row)
  firstTick: number;    // CIA tick of the first row (offset for position calculation)
  warnings?: string[];  // Degradation notices (e.g. VBlank fallback, no PCM extracted)
}

/** Paula register write log entry — captured during enhanced scan */
export interface PaulaLogEntry {
  channel:    number;  // 0-3
  reg:        number;  // PAULA_REG_* (0=LCH,1=LCL,2=LEN,3=PER,4=VOL,5=DAT)
  value:      number;  // Value written to Paula register
  sourceAddr: number;  // Chip RAM address that sourced the value
  tick:       number;  // CIA-A tick count at write time
}

export interface UADEChannelTickState {
  period:    number;  // AUDx PER (current Amiga period)
  volume:    number;  // AUDx VOL (0-64)
  lc:        number;  // AUDx LC — chip RAM address of current sample
  len:       number;  // AUDx LEN — sample length in words
  dmaEn:     number;  // 1 if DMA active on this channel
  triggered: number;  // 1 if DMA restarted this tick (new note started)
}

export interface UADETickSnapshot {
  tick:     number;               // CIA-A Timer A tick count
  channels: UADEChannelTickState[]; // [ch0, ch1, ch2, ch3]
}

/** Memory watchpoint hit */
export interface WatchpointHit {
  addr:    number;
  value:   number;
  tick:    number;
  isWrite: boolean;
  wpSlot:  number;
}

export interface UADEMetadata {
  player: string;       // Detected eagleplayer name (e.g. "JochenHippel")
  formatName: string;   // Human-readable format (e.g. "Jochen Hippel")
  minSubsong: number;
  maxSubsong: number;
  subsongCount: number;
  scanData?: UADEScanRow[][];            // Pre-scanned pattern data: rows of 4 channels
  enhancedScan?: UADEEnhancedScanData;   // Enhanced scan data with samples + effects
  shortScanTicks?: UADETickSnapshot[];   // Tick snapshots from short scan (compiled replayers)
}

export interface UADEPositionUpdate {
  subsong: number;
  position: number;
  tickCount?: number;
  totalFrames?: number;
  audioTime?: number;
}

export interface UADEChannelData {
  period: number;
  volume: number;
  dma: boolean;
  triggered: boolean;  // New note detected (period changed)
  samplePtr: number;   // Paula lc register — identifies which sample/instrument
}

type PositionCallback = (update: UADEPositionUpdate) => void;
type ChannelCallback = (channels: UADEChannelData[], totalFrames: number) => void;

export class UADEEngine implements IsolationCapableEngine {
  private static readonly MAX_ISOLATION_SLOTS = 4;
  private _isolationSlotMasks: (number | null)[] = new Array(4).fill(null);
  private static instance: UADEEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _rejectInit: ((err: Error) => void) | null = null;
  private _initProgress = 0;
  private _initPhase = '';
  private _onInitProgress: ((progress: number, phase: string) => void) | null = null;

  /** Subscribe to init progress updates (0-100). Returns unsubscribe function. */
  onInitProgress(cb: (progress: number, phase: string) => void): () => void {
    this._onInitProgress = cb;
    return () => { this._onInitProgress = null; };
  }

  /** Current init progress (0-100) */
  get initProgress(): number { return this._initProgress; }
  get initPhase(): string { return this._initPhase; }
  private _loadPromise: Promise<UADEMetadata> | null = null;
  private _resolveLoad: ((meta: UADEMetadata) => void) | null = null;
  private _rejectLoad: ((err: Error) => void) | null = null;
  private _renderPromise: Promise<ArrayBuffer> | null = null;
  private _resolveRender: ((buffer: ArrayBuffer) => void) | null = null;
  private _rejectRender: ((err: Error) => void) | null = null;
  private _subsongScanPromise: Promise<{ subsong: number; scanResult: UADEEnhancedScanData & { rows: unknown[][] } }> | null = null;
  private _resolveSubsongScan: ((result: { subsong: number; scanResult: UADEEnhancedScanData & { rows: unknown[][] } }) => void) | null = null;
  private _rejectSubsongScan: ((err: Error) => void) | null = null;
  // Queued isolated channel renders: Map<channelIndex, {resolve, reject}>
  private _isolateChannelPending: Map<number, { resolve: (result: { channelIndex: number; pcm: ArrayBuffer; sampleRate: number; framesWritten: number }) => void; reject: (err: Error) => void }> = new Map();
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _channelCallbacks: Set<ChannelCallback> = new Set();
  private _songEndCallbacks: Set<() => void> = new Set();
  private _disposed = false;
  // Pending readString requests: Map<requestId, {resolve, reject}>
  private _readStringPending: Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }> = new Map();
  private _readStringNextId = 0;
  // Pending scanMemory requests: Map<requestId, {resolve, reject}>
  private _scanMemoryPending: Map<number, { resolve: (addr: number) => void; reject: (e: Error) => void }> = new Map();
  private _scanMemoryNextId = 0;
  // Pending readMemory requests: Map<requestId, {resolve, reject}>
  private _readMemoryPending = new Map<number, { resolve: (v: Uint8Array) => void; reject: (e: Error) => void }>();
  private _readMemoryNextId = 0;
  // Pending writeMemory requests: Map<requestId, {resolve, reject}>
  private _writeMemoryPending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  private _writeMemoryNextId = 0;
  // Pending getPaulaLog requests: Map<requestId, {resolve, reject}>
  private _paulaLogPending = new Map<number, { resolve: (v: PaulaLogEntry[]) => void; reject: (e: Error) => void }>();
  private _paulaLogNextId = 0;
  // Pending getTickSnapshots requests: Map<requestId, {resolve, reject}>
  private _tickSnapPending = new Map<number, { resolve: (v: UADETickSnapshot[]) => void; reject: (e: Error) => void }>();
  private _tickSnapNextId = 0;
  // Pending getWatchpointHits requests: Map<requestId, {resolve, reject}>
  private _wpHitsPending = new Map<number, { resolve: (v: WatchpointHit[]) => void; reject: (e: Error) => void }>();
  private _wpHitsNextId = 0;

  // Live tick capture: accumulated snapshots from playback for incremental pattern reconstruction
  private _liveTickSnapshots: UADETickSnapshot[] = [];
  private _liveTickCallbacks: Set<(snapshots: UADETickSnapshot[]) => void> = new Set();

  /** True when UADE WASM hit a fatal error (protocol cascade, OOM abort).
   *  getInstance() checks this and recreates the engine. */
  private _poisoned = false;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve, reject) => {
      this._resolveInit = resolve;
      this._rejectInit = reject;
    });

    this.initialize();
  }

  static getInstance(): UADEEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!UADEEngine.instance || UADEEngine.instance._disposed ||
        UADEEngine.instance._poisoned ||
        UADEEngine.instance.audioContext !== currentCtx) {
      if (UADEEngine.instance && !UADEEngine.instance._disposed) {
        if (UADEEngine.instance._poisoned) {
          console.warn('[UADEEngine] Recreating poisoned UADE instance (protocol cascade recovery)');
        }
        UADEEngine.instance.dispose();
      }
      UADEEngine.instance = new UADEEngine();
    }
    return UADEEngine.instance;
  }

  /** Check if a live singleton instance exists (without creating one). */
  static hasInstance(): boolean {
    return !!UADEEngine.instance && !UADEEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await UADEEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[UADEEngine] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}uade/UADE.worklet.js`);
      } catch {
        // Module might already be registered
      }

      // Fetch WASM binary and JS glue code (shared across contexts, lazy-loaded)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}uade/UADE.wasm`),
          fetch(`${baseUrl}uade/UADE.js`),
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        } else {
          throw new Error('[UADEEngine] Failed to fetch UADE.wasm');
        }

        if (jsResponse.ok) {
          let code = await jsResponse.text();
          // Transform Emscripten output for worklet Function() execution:
          // - Replace import.meta.url (not available in worklet scope)
          // - Remove ESM export statements
          // - Ensure wasmBinary is read from Module config
          code = code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];');
          this.jsCode = code;
        } else {
          throw new Error('[UADEEngine] Failed to fetch UADE.js');
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'uade-processor', {
      outputChannelCount: [2, 2, 2, 2, 2],
      numberOfOutputs: 1 + UADEEngine.MAX_ISOLATION_SLOTS,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[UADEEngine] WASM ready');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
            this._rejectInit = null;
          }
          break;

        case 'initProgress':
          this._initProgress = data.progress ?? 0;
          this._initPhase = data.phase ?? '';
          if (this._onInitProgress) this._onInitProgress(data.progress, data.phase);
          break;

        case 'loaded':
          if (this._resolveLoad) {
            const meta: UADEMetadata = {
              player: data.player ?? 'Unknown',
              formatName: data.formatName ?? 'Unknown',
              minSubsong: data.minSubsong ?? 1,
              maxSubsong: data.maxSubsong ?? 1,
              subsongCount: data.subsongCount ?? 1,
              scanData: data.scanData,
            };
            // Include enhanced scan data if available
            if (data.enhancedScan) {
              meta.enhancedScan = {
                ...data.enhancedScan,
                warnings: data.enhancedScan.warnings ?? [],
              };
            }
            // Include tick snapshots from short scan (captured before WASM reinit)
            if (data.shortScanTicks) {
              meta.shortScanTicks = data.shortScanTicks;
            }
            this._resolveLoad(meta);
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'error':
          console.error('[UADEEngine]', data.message);
          // Detect protocol cascade corruption — mark engine as poisoned
          // so getInstance() recreates it on next access.
          if (data.message?.includes('protocol error') ||
              data.message?.includes('Aborted') ||
              data.message?.includes('abort()') ||
              data.message?.includes('module check failed')) {
            this._poisoned = true;
          }
          // Reject init promise if still pending (WASM init failed)
          if (this._rejectInit) {
            this._rejectInit(new Error(data.message));
            this._resolveInit = null;
            this._rejectInit = null;
          }
          if (this._rejectLoad) {
            this._rejectLoad(new Error(data.message));
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb({
              subsong: data.subsong ?? 0,
              position: data.position ?? 0,
              tickCount: data.tickCount,
              totalFrames: data.totalFrames,
              audioTime: data.audioTime,
            });
          }
          break;

        case 'channels':
          for (const cb of this._channelCallbacks) {
            cb(data.channels, data.totalFrames);
          }
          break;

        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            for (let i = 0; i < levels.length; i++) {
              engine.triggerChannelMeter(i, levels[i]);
            }
          } catch { /* ToneEngine not ready */ }
          break;

        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels);
          break;

        case 'songEnd':
          for (const cb of this._songEndCallbacks) {
            cb();
          }
          break;

        case 'renderComplete':
          if (this._resolveRender) {
            this._resolveRender(data.audioBuffer);
            this._resolveRender = null;
            this._rejectRender = null;
          }
          break;

        case 'renderError':
          if (this._rejectRender) {
            this._rejectRender(new Error(data.message));
            this._resolveRender = null;
            this._rejectRender = null;
          }
          break;

        case 'subsongScanned':
          if (this._resolveSubsongScan) {
            this._resolveSubsongScan({ subsong: data.subsong, scanResult: data.scanResult });
            this._resolveSubsongScan = null;
            this._rejectSubsongScan = null;
          }
          break;

        case 'subsongScanError':
          if (this._rejectSubsongScan) {
            this._rejectSubsongScan(new Error(data.message));
            this._resolveSubsongScan = null;
            this._rejectSubsongScan = null;
          }
          break;

        case 'instrumentIsolated': {
          const pending = this._isolateChannelPending.get(data.channelIndex);
          if (pending) {
            pending.resolve({ channelIndex: data.channelIndex, pcm: data.pcm, sampleRate: data.sampleRate, framesWritten: data.framesWritten });
            this._isolateChannelPending.delete(data.channelIndex);
          }
          break;
        }

        case 'instrumentIsolatedError': {
          const pending = this._isolateChannelPending.get(data.channelIndex);
          if (pending) {
            pending.reject(new Error(data.message));
            this._isolateChannelPending.delete(data.channelIndex);
          }
          break;
        }

        case 'readStringResult': {
          const pending = this._readStringPending.get(data.requestId);
          if (pending) {
            pending.resolve(data.value ?? '');
            this._readStringPending.delete(data.requestId);
          }
          break;
        }

        case 'readStringError': {
          const pending = this._readStringPending.get(data.requestId);
          if (pending) {
            pending.reject(new Error(data.message));
            this._readStringPending.delete(data.requestId);
          }
          break;
        }

        case 'scanMemoryResult': {
          const pending = this._scanMemoryPending.get(data.requestId);
          if (pending) {
            pending.resolve(data.addr ?? -1);
            this._scanMemoryPending.delete(data.requestId);
          }
          break;
        }

        case 'scanMemoryError': {
          const pending = this._scanMemoryPending.get(data.requestId);
          if (pending) {
            pending.reject(new Error(data.message));
            this._scanMemoryPending.delete(data.requestId);
          }
          break;
        }

        case 'readMemoryResult': {
          const { requestId, data: buf } = data;
          this._readMemoryPending.get(requestId)?.resolve(new Uint8Array(buf));
          this._readMemoryPending.delete(requestId);
          break;
        }
        case 'readMemoryError': {
          const { requestId, error } = data;
          this._readMemoryPending.get(requestId)?.reject(new Error(error));
          this._readMemoryPending.delete(requestId);
          break;
        }
        case 'writeMemoryResult': {
          const { requestId } = data;
          this._writeMemoryPending.get(requestId)?.resolve();
          this._writeMemoryPending.delete(requestId);
          break;
        }
        case 'writeMemoryError': {
          const { requestId, error } = data;
          this._writeMemoryPending.get(requestId)?.reject(new Error(error));
          this._writeMemoryPending.delete(requestId);
          break;
        }
        case 'paulaLogResult': {
          const { requestId, entries } = data;
          this._paulaLogPending.get(requestId)?.resolve(entries as PaulaLogEntry[]);
          this._paulaLogPending.delete(requestId);
          break;
        }
        case 'paulaLogError': {
          const { requestId, error } = data;
          this._paulaLogPending.get(requestId)?.reject(new Error(error));
          this._paulaLogPending.delete(requestId);
          break;
        }
        case 'tickSnapshotsResult': {
          const { requestId, snapshots } = data;
          this._tickSnapPending.get(requestId)?.resolve(snapshots as UADETickSnapshot[]);
          this._tickSnapPending.delete(requestId);
          break;
        }
        case 'tickSnapshotsError': {
          const { requestId, error } = data;
          this._tickSnapPending.get(requestId)?.reject(new Error(error as string));
          this._tickSnapPending.delete(requestId);
          break;
        }
        case 'watchpointHitsResult': {
          const { requestId, hits } = data;
          this._wpHitsPending.get(requestId)?.resolve(hits as WatchpointHit[]);
          this._wpHitsPending.delete(requestId);
          break;
        }
        case 'watchpointHitsError': {
          const { requestId, error } = data;
          this._wpHitsPending.get(requestId)?.reject(new Error(error));
          this._wpHitsPending.delete(requestId);
          break;
        }
        case 'liveTickBatch': {
          const snapshots = data.snapshots as UADETickSnapshot[];
          if (snapshots.length > 0) {
            this._liveTickSnapshots.push(...snapshots);
            for (const cb of this._liveTickCallbacks) {
              cb(this._liveTickSnapshots);
            }
          }
          break;
        }
      }
    };

    this.workletNode.port.postMessage(
      { type: 'init', sampleRate: ctx.sampleRate, wasmBinary: UADEEngine.wasmBinary, jsCode: UADEEngine.jsCode },
      UADEEngine.wasmBinary ? [UADEEngine.wasmBinary] : []
    );
    // Note: transferring the buffer clears the static cache; re-fetch on next load if needed
    UADEEngine.wasmBinary = null;

    this.workletNode.connect(this.output);
  }

  /** Wait for WASM initialization to complete */
  async ready(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Preemptive reinit — call before loading a new song to avoid delay during playback.
   * Only reinits if the engine has rendered audio (played a song). Returns a promise
   * that resolves when reinit is complete, with progress reported via onInitProgress.
   */
  async reinitIfNeeded(): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) return;
    // Create a new init promise that resolves when the worklet sends 'ready'
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          this.workletNode!.port.removeEventListener('message', handler);
          resolve();
        }
        if (event.data.type === 'initProgress' && this._onInitProgress) {
          this._onInitProgress(event.data.progress, event.data.phase);
        }
      };
      this.workletNode!.port.addEventListener('message', handler);
      this.workletNode!.port.postMessage({ type: 'reinit' });
      // If no reinit needed, worklet won't send 'ready' — resolve after short timeout
      setTimeout(() => resolve(), 100);
    });
  }

  /**
   * Load an exotic Amiga music file.
   * @param data - Raw file bytes
   * @param filenameHint - Original filename (used by UADE for format detection)
   */
  async load(data: ArrayBuffer, filenameHint: string, skipScan = false, subsong = 0, scanTimeoutSec?: number): Promise<UADEMetadata> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');

    this._loadPromise = new Promise<UADEMetadata>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    // Clone buffer before transferring (caller may need it later for subsong switching)
    // Ensure we have a real ArrayBuffer — Uint8Array.slice() returns a Uint8Array,
    // which is not transferable. ArrayBuffer.slice() returns an ArrayBuffer.
    const raw = data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer;
    const transferBuf = raw.slice(0);
    this.workletNode.port.postMessage(
      { type: 'load', buffer: transferBuf, filenameHint, skipScan, subsong, scanTimeoutSec },
      [transferBuf]
    );

    return this._loadPromise;
  }

  /**
   * loadTune(buffer) — WASM engine registry compatible wrapper for load().
   * Reads the filename hint and current subsong from the format store.
   */
  async loadTune(buffer: ArrayBuffer): Promise<void> {
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const state = useFormatStore.getState();
    const fileName = state.uadeEditableFileName || 'module.mod';
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const prefix = fileName.split('.')[0]?.toLowerCase() ?? '';

    // Scan control: centralized in uadeScanLists.ts
    const { shouldSkipScan, isShortScan } = await import('./uadeScanLists');
    const scanCrashes = shouldSkipScan(ext, prefix);
    const shortScan = isShortScan(ext, prefix);

    const skipScan = scanCrashes;
    const scanTimeoutSec = shortScan ? 30 : undefined;

    // Register companion files (two-file formats: smp.*, .ins, .set) BEFORE loading
    const companions = state.uadeCompanionFiles;
    if (companions) {
      for (const [cfName, cfBuf] of companions) {
        await this.addCompanionFile(cfName, cfBuf);
      }
    }

    await this.load(buffer, fileName, skipScan, state.uadeEditableCurrentSubsong, scanTimeoutSec);
  }

  /**
   * Write a companion file into the WASM virtual filesystem before loading.
   * Required for multi-file formats like TFMX (mdat.* + smpl.*).
   * Must be called BEFORE load() for the companion to be available.
   */
  async addCompanionFile(filename: string, data: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const raw = data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer;
    const transferBuf = raw.slice(0);
    this.workletNode.port.postMessage(
      { type: 'addCompanionFile', filename, buffer: transferBuf },
      [transferBuf],
    );
  }

  /**
   * Cancel an in-progress load/scan.
   * The WASM scan continues in the worklet (it's synchronous and can't be stopped),
   * but the result will be discarded when it arrives — the returned promise is rejected
   * immediately so the caller can clean up.
   */
  cancelLoad(): void {
    if (this._rejectLoad) {
      this._rejectLoad(new Error('Scan cancelled'));
    }
    this._resolveLoad = null;
    this._rejectLoad = null;
    this._loadPromise = null;
  }

  play(): void {
    // Restore gain (muted by stop())
    try { this.output.gain.setValueAtTime(1, 0); } catch { /* best effort */ }
    this.workletNode?.port.postMessage({ type: 'play' });
    // Enable per-channel oscilloscope capture (4 Paula channels)
    useOscilloscopeStore.getState().setChipInfo(4, 0, ['Paula 0', 'Paula 1', 'Paula 2', 'Paula 3']);
    this.workletNode?.port.postMessage({ type: 'enableOsc' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
    this.workletNode?.port.postMessage({ type: 'disableOsc' });
    useOscilloscopeStore.getState().clear();
    // Immediately mute the output GainNode to prevent audio leaking while
    // the async stop message is processed by the worklet thread.
    // The gain is restored on next loadTune/play.
    try { this.output.gain.setValueAtTime(0, 0); } catch { /* best effort */ }
  }

  pause(): void {
    this.workletNode?.port.postMessage({ type: 'pause' });
  }

  setSubsong(index: number): void {
    this.workletNode?.port.postMessage({ type: 'setSubsong', index });
  }

  setLooping(value: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setLooping', value });
  }

  /** Subscribe to position updates. Returns unsubscribe function. */
  onPositionUpdate(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  /** Subscribe to live Paula channel data (~20Hz). Returns unsubscribe function. */
  onChannelData(cb: ChannelCallback): () => void {
    this._channelCallbacks.add(cb);
    return () => this._channelCallbacks.delete(cb);
  }

  /**
   * Wire this engine into a PlaybackCoordinator. Sets up:
   *
   *   1. Position-update subscription with CIA-tick→row math (uses
   *      song.uadeFirstTick + song.initialSpeed). Throttles to row-change
   *      events and dispatches via coordinator.dispatchEnginePosition.
   *   2. Paula register log polling (10Hz) — converts register writes to
   *      automation capture entries via decodePaulaRegister.
   *   3. Optional deferred pattern reconstruction for SKIP_SCAN formats —
   *      enables tick snapshots, runs reconstructPatterns() after 15s.
   *   4. Optional TFMX timing-table position subscription via
   *      onChannelData → jiffies → row math.
   *
   * Returns a cleanup function that:
   *   - Unsubscribes the position callback
   *   - Clears the Paula log polling interval
   *   - Disables tick snapshots
   *   - Unsubscribes the TFMX channel callback (if attached)
   *
   * Replaces ~110 lines of UADE-specific glue that previously lived inline
   * in TrackerReplayer.play().
   *
   * @param coordinator The PlaybackCoordinator dispatching position updates
   * @param song        The TrackerSong containing UADE timing metadata
   * @param isPlaying   A getter the engine reads to check if it should still
   *                    be processing (lets the cleanup race-free against stop()).
   */
  subscribeToCoordinator(
    coordinator: PlaybackCoordinator,
    song: TrackerSong,
    isPlaying: () => boolean,
  ): () => void {
    const cleanups: Array<() => void> = [];

    // ── 1. Position subscription with CIA-tick → row math ────────────────
    if (song.uadeFirstTick != null) {
      const speed = song.initialSpeed || 6;
      const firstTick = song.uadeFirstTick;
      const patternLengths = song.patterns.map(p => p.length);
      let lastRow = -1;
      let lastPosition = -1;
      const unsub = this.onPositionUpdate((update) => {
        if (!isPlaying()) return;
        const tickCount = update.tickCount ?? 0;
        // Convert CIA tick count to absolute row index
        const absoluteRow = Math.max(0, Math.floor((tickCount - firstTick) / speed));
        // Map absolute row to pattern position + row within pattern
        let remaining = absoluteRow;
        let position = 0;
        for (let i = 0; i < song.songPositions.length; i++) {
          const patIdx = song.songPositions[i];
          const patLen = patternLengths[patIdx] ?? 64;
          if (remaining < patLen) {
            position = i;
            break;
          }
          remaining -= patLen;
          position = i;
          // If we've exhausted all patterns, clamp to last position
          if (i === song.songPositions.length - 1) {
            remaining = Math.min(remaining, patLen - 1);
          }
        }
        const row = remaining;
        if (row === lastRow && position === lastPosition) return;
        lastRow = row;
        lastPosition = position;
        coordinator.dispatchEnginePosition(row, position);
      });
      cleanups.push(unsub);

      // ── 2. Paula register log polling (10Hz) ──────────────────────────
      this.enablePaulaLog(true);
      const paulaInterval = window.setInterval(async () => {
        if (!isPlaying()) return;
        try {
          const entries = await this.getPaulaLog();
          // Lazy-import to avoid pulling automation capture into the engine
          // module's static dependency graph.
          const { getAutomationCapture } = await import('@engine/automation/AutomationCapture');
          const { decodePaulaRegister } = await import('@engine/automation/decoders/PaulaRegisterDecoder');
          const capture = getAutomationCapture();
          for (const entry of entries) {
            const decoded = decodePaulaRegister(entry.channel, entry.reg, entry.value);
            for (const d of decoded) {
              capture.push(d.paramId, entry.tick, d.value, {
                type: 'effect',
                row: Math.floor((entry.tick - firstTick) / speed),
                channel: entry.channel,
                effectCol: 0,
              });
            }
          }
        } catch { /* ignore errors during shutdown */ }
      }, 100);
      cleanups.push(() => clearInterval(paulaInterval));
    }

    // ── 3. Deferred pattern capture for SKIP_SCAN formats ────────────────
    // Also enables live tick capture so patterns build up during playback.
    if (song.uadeDeferredCapture) {
      this.enableLiveTickCapture(true);
      const captureEngine = this;
      const captureSong = song;
      const deferredTimer = window.setTimeout(async () => {
        try {
          // Drain accumulated live tick snapshots (or fall back to ring buffer)
          let tickSnapshots = captureEngine.getLiveTickSnapshots();
          if (tickSnapshots.length < 10) {
            tickSnapshots = await captureEngine.getTickSnapshots();
          }
          captureEngine.enableLiveTickCapture(false);
          if (tickSnapshots.length < 10) return;

          const { reconstructPatterns } = await import('@engine/uade/UADEPatternReconstructor');
          const samplePtrToInstrIndex = new Map<number, number>();
          captureSong.instruments.forEach((inst, idx) => {
            const ptr = inst.sample?.uadeSamplePtr;
            if (ptr != null) samplePtrToInstrIndex.set(ptr, idx + 1);
          });

          const reconstructed = reconstructPatterns(
            tickSnapshots, samplePtrToInstrIndex, captureSong.numChannels, 6,
          );

          if (reconstructed.patterns.length > 0) {
            captureSong.patterns = reconstructed.patterns;
            captureSong.songPositions = reconstructed.patterns.map((_, i) => i);
            captureSong.songLength = reconstructed.patterns.length;
            captureSong.initialSpeed = reconstructed.speed;
            captureSong.uadeFirstTick = reconstructed.firstTick;
            captureSong.uadeDeferredCapture = false;

            // Update the TrackerStore so the UI reflects the new patterns
            try {
              const { useTrackerStore } = await import('@stores/useTrackerStore');
              const store = useTrackerStore.getState();
              store.loadPatterns(reconstructed.patterns);
              store.setPatternOrder(reconstructed.patterns.map((_, i) => i));
              console.log(`[UADEEngine] Deferred capture: ${reconstructed.patterns.length} patterns loaded into store`);
            } catch (storeErr) {
              console.warn('[UADEEngine] Could not update TrackerStore:', storeErr);
            }
          }
        } catch (e) {
          console.warn('[UADEEngine] Deferred pattern capture failed:', e);
        }
      }, 15000);
      cleanups.push(() => {
        clearTimeout(deferredTimer);
        this.enableLiveTickCapture(false);
      });
    }

    // ── 4. TFMX timing-table position subscription ───────────────────────
    if (song.tfmxTimingTable && song.tfmxTimingTable.length > 0) {
      const tt = song.tfmxTimingTable;
      let lastRow = -1;
      let lastPosition = -1;
      // Lazy-load the format playback store (UI plumbing for the pattern
      // editor RAF loop). TFMX is the only path that needs this — it doesn't
      // come through the main play() route that sets it elsewhere.
      let setFormatPlaybackRow: ((row: number) => void) | null = null;
      let setFormatPlaybackPlaying: ((playing: boolean) => void) | null = null;
      void import('@engine/FormatPlaybackState').then((mod) => {
        setFormatPlaybackRow = mod.setFormatPlaybackRow;
        setFormatPlaybackPlaying = mod.setFormatPlaybackPlaying;
      }).catch(() => { /* store unavailable */ });

      const tfmxUnsub = this.onChannelData((_channels, totalFrames) => {
        if (!isPlaying()) return;
        // Convert totalFrames to jiffies (PAL VBlank = 50 Hz = 882 samples at 44100)
        const jiffies = Math.floor(totalFrames / 882);

        // Binary search the timing table
        let lo = 0, hi = tt.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (tt[mid].cumulativeJiffies <= jiffies) lo = mid;
          else hi = mid - 1;
        }

        const entry = tt[lo];
        const position = entry.patternIndex;
        const row = entry.row;
        if (row === lastRow && position === lastPosition) return;
        lastRow = row;
        lastPosition = position;

        // TFMX opts out of fireHybridNotes — sister UADE position
        // subscription block (above) already covers it for UADE-backed formats.
        coordinator.dispatchEnginePosition(row, position, undefined, /*fireHybrid*/ false);

        // Drive FormatPlaybackState for PatternEditorCanvas RAF loop
        if (setFormatPlaybackRow) setFormatPlaybackRow(row);
        if (setFormatPlaybackPlaying) setFormatPlaybackPlaying(true);
      });
      cleanups.push(tfmxUnsub);
    }

    // Return composite cleanup
    return () => {
      for (const fn of cleanups) {
        try { fn(); } catch { /* best-effort */ }
      }
    };
  }

  /** Subscribe to song end events. Returns unsubscribe function. */
  onSongEnd(cb: () => void): () => void {
    this._songEndCallbacks.add(cb);
    return () => this._songEndCallbacks.delete(cb);
  }

  /**
   * Render the loaded song to a complete audio buffer (WAV format).
   * Useful for pre-rendering UADE modules for DJ playback.
   * @param subsong - Optional subsong index (default: current subsong)
   * @returns ArrayBuffer containing encoded WAV audio
   */
  async renderFull(subsong?: number): Promise<ArrayBuffer> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');

    this._renderPromise = new Promise<ArrayBuffer>((resolve, reject) => {
      this._resolveRender = resolve;
      this._rejectRender = reject;
    });

    this.workletNode.port.postMessage({ type: 'renderFull', subsong });

    return this._renderPromise;
  }

  /**
   * Re-scan a specific subsong using the last loaded file (no re-transfer needed).
   * Returns the enhanced scan result for that subsong.
   * @param subsong - Subsong index to scan (0-based, relative to minSubsong)
   */
  async scanSubsong(subsong: number): Promise<{ subsong: number; scanResult: UADEEnhancedScanData & { rows: unknown[][] } }> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');

    this._subsongScanPromise = new Promise((resolve, reject) => {
      this._resolveSubsongScan = resolve;
      this._rejectSubsongScan = reject;
    });

    this.workletNode.port.postMessage({ type: 'scanSubsong', subsong });
    return this._subsongScanPromise;
  }

  /**
   * Render a single Paula channel in isolation.
   * Mutes all other channels, renders durationMs of audio, resets mute mask.
   * @param channelIndex - Paula channel 0-3 to isolate
   * @param durationMs   - Duration in milliseconds to render (default 2000)
   */
  async isolateChannel(channelIndex: number, durationMs = 2000): Promise<{ channelIndex: number; pcm: ArrayBuffer; sampleRate: number; framesWritten: number }> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');

    const promise = new Promise<{ channelIndex: number; pcm: ArrayBuffer; sampleRate: number; framesWritten: number }>((resolve, reject) => {
      this._isolateChannelPending.set(channelIndex, { resolve, reject });
    });

    this.workletNode.port.postMessage({ type: 'isolateChannel', channelIndex, durationMs });
    return promise;
  }

  /**
   * Set the Paula channel mute mask for live playback.
   * Bit N=1 means channel N is ACTIVE (playing); bit N=0 means muted.
   * Bits 0-3 correspond to Paula channels 0-3.
   * Use 0x0F to unmute all channels.
   */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMuteMask', mask });
  }

  /**
   * Write new PCM data directly into Amiga chip RAM at the given address.
   * Used to apply edits from the Sampler instrument editor back to the running WASM.
   * @param samplePtr - Amiga chip RAM address (samplePtr from UADEExtractedSample)
   * @param pcmData   - New 8-bit signed PCM bytes to write
   */
  setInstrumentSample(samplePtr: number, pcmData: Uint8Array): void {
    if (!this.workletNode) return;
    // Transfer the buffer for zero-copy delivery to the worklet
    const copy = pcmData.slice();
    this.workletNode.port.postMessage(
      { type: 'setInstrumentSample', samplePtr, pcmData: copy.buffer },
      [copy.buffer],
    );
  }

  /**
   * Read a null-terminated string from Amiga chip RAM at the given address.
   * Wraps uade_wasm_read_string() via worklet message round-trip.
   * Useful for reading instrument names from format-specific memory offsets.
   * @param addr   - Amiga chip RAM address (e.g. 0x000000 = chip RAM base)
   * @param maxLen - Maximum string length to read (default 22, max 256)
   */
  async readStringFromMemory(addr: number, maxLen = 22): Promise<string> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const requestId = this._readStringNextId++;
    const promise = new Promise<string>((resolve, reject) => {
      this._readStringPending.set(requestId, { resolve, reject });
    });
    this.workletNode.port.postMessage({ type: 'readString', requestId, addr, maxLen });
    return promise;
  }

  /**
   * Scan Amiga chip RAM for a byte sequence (magic bytes) starting from address 0.
   * Returns the address of the first match, or -1 if not found.
   * Useful for locating module base address when format uses non-standard load address.
   * @param magic     - Byte sequence to search for
   * @param searchLen - How many bytes of chip RAM to search (default 512KB)
   */
  async scanMemoryForMagic(magic: Uint8Array, searchLen = 524288): Promise<number> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const requestId = this._scanMemoryNextId++;
    const promise = new Promise<number>((resolve, reject) => {
      this._scanMemoryPending.set(requestId, { resolve, reject });
    });
    const magicCopy = magic.slice();
    this.workletNode.port.postMessage(
      { type: 'scanMemory', requestId, magic: magicCopy.buffer, searchLen },
      [magicCopy.buffer],
    );
    return promise;
  }

  /** Read `length` bytes from Amiga chip RAM starting at `addr`. */
  async readMemory(addr: number, length: number): Promise<Uint8Array> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const requestId = this._readMemoryNextId++;
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      this._readMemoryPending.set(requestId, { resolve, reject });
    });
    this.workletNode.port.postMessage({ type: 'readMemory', requestId, addr, length });
    return promise;
  }

  /** Write `data` bytes into Amiga chip RAM at `addr`. Changes take effect on next note trigger. */
  async writeMemory(addr: number, data: Uint8Array): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const requestId = this._writeMemoryNextId++;
    const promise = new Promise<void>((resolve, reject) => {
      this._writeMemoryPending.set(requestId, { resolve, reject });
    });
    const copy = data.slice();
    this.workletNode.port.postMessage(
      { type: 'writeMemory', requestId, addr, data: copy.buffer },
      [copy.buffer],
    );
    return promise;
  }

  /** Enable or disable Paula write logging (fires-and-forgets; no response). */
  enablePaulaLog(enable: boolean): void {
    this.workletNode?.port.postMessage({ type: 'enablePaulaLog', enable });
  }

  /**
   * Drain all queued Paula register write log entries accumulated since the
   * last call to enablePaulaLog(true). Returns entries sorted by tick.
   * Typically called after the enhanced scan completes.
   */
  async getPaulaLog(): Promise<PaulaLogEntry[]> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const requestId = this._paulaLogNextId++;
    const promise = new Promise<PaulaLogEntry[]>((resolve, reject) => {
      this._paulaLogPending.set(requestId, { resolve, reject });
    });
    this.workletNode.port.postMessage({ type: 'getPaulaLog', requestId });
    return promise;
  }

  /** Enable or disable CIA tick snapshot capture. */
  enableTickSnapshots(enable: boolean): void {
    this.workletNode?.port.postMessage({ type: 'enableTickSnapshots', enable });
  }

  /** Reset (clear) the accumulated tick snapshot ring buffer. */
  resetTickSnapshots(): void {
    this.workletNode?.port.postMessage({ type: 'resetTickSnapshots' });
  }

  /**
   * Drain all accumulated CIA tick snapshots since the last reset.
   * Each snapshot contains the CIA-A tick count and per-channel Paula DMA state.
   */
  async getTickSnapshots(): Promise<UADETickSnapshot[]> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const requestId = this._tickSnapNextId++;
    const promise = new Promise<UADETickSnapshot[]>((resolve, reject) => {
      this._tickSnapPending.set(requestId, { resolve, reject });
    });
    this.workletNode.port.postMessage({ type: 'getTickSnapshots', requestId });
    return promise;
  }

  /**
   * Enable/disable live tick capture during playback.
   * When enabled, tick snapshots are continuously captured and sent to the main thread
   * via liveTickBatch messages. Subscribe to updates via onLiveTickUpdate().
   */
  enableLiveTickCapture(enable: boolean): void {
    if (enable) {
      this._liveTickSnapshots = [];
    }
    this.workletNode?.port.postMessage({ type: 'enableLiveTickCapture', enable });
  }

  /** Subscribe to live tick batch updates. Returns unsubscribe function. */
  onLiveTickUpdate(cb: (allSnapshots: UADETickSnapshot[]) => void): () => void {
    this._liveTickCallbacks.add(cb);
    return () => { this._liveTickCallbacks.delete(cb); };
  }

  /** Get all accumulated live tick snapshots. */
  getLiveTickSnapshots(): UADETickSnapshot[] {
    return this._liveTickSnapshots;
  }

  /** Set a memory watchpoint on chip RAM. mode: 1=read, 2=write, 3=both. */
  setWatchpoint(slot: number, addr: number, size: number, mode: 1 | 2 | 3): void {
    this.workletNode?.port.postMessage({ type: 'setWatchpoint', slot, addr, size, mode });
  }

  /** Clear a single watchpoint slot. */
  clearWatchpoint(slot: number): void {
    this.workletNode?.port.postMessage({ type: 'clearWatchpoint', slot });
  }

  /** Clear all watchpoint slots and drain the hit log. */
  clearAllWatchpoints(): void {
    this.workletNode?.port.postMessage({ type: 'clearAllWatchpoints' });
  }

  /** Drain all accumulated watchpoint hits since the last clear. */
  async getWatchpointHits(): Promise<WatchpointHit[]> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const requestId = this._wpHitsNextId++;
    const promise = new Promise<WatchpointHit[]>((resolve, reject) => {
      this._wpHitsPending.set(requestId, { resolve, reject });
    });
    this.workletNode.port.postMessage({ type: 'getWatchpointHits', requestId });
    return promise;
  }

  // ========== IsolationCapableEngine interface ==========

  isAvailable(): boolean {
    return this.workletNode !== null && !this._disposed;
  }

  getWorkletNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  getAudioContext(): AudioContext | null {
    try {
      return (getDevilboxAudioContext() as any)?.rawContext ?? null;
    } catch { return null; }
  }

  addIsolation(slotIndex: number, channelMask: number): void {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= UADEEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = channelMask;
    this.workletNode.port.postMessage({ type: 'addIsolation', slotIndex, channelMask });
    console.log(`[UADEEngine] addIsolation: slot=${slotIndex}, mask=0x${channelMask.toString(16)}`);
  }

  removeIsolation(slotIndex: number): void {
    if (!this.workletNode || slotIndex < 0 || slotIndex >= UADEEngine.MAX_ISOLATION_SLOTS) return;
    this._isolationSlotMasks[slotIndex] = null;
    this.workletNode.port.postMessage({ type: 'removeIsolation', slotIndex });
  }

  diagIsolation(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'diagIsolation' });
  }

  dispose(): void {
    this._disposed = true;
    for (let i = 0; i < UADEEngine.MAX_ISOLATION_SLOTS; i++) {
      if (this._isolationSlotMasks[i] !== null) this.removeIsolation(i);
    }
    this._isolationSlotMasks.fill(null);
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._channelCallbacks.clear();
    this._songEndCallbacks.clear();
    if (UADEEngine.instance === this) {
      UADEEngine.instance = null;
    }
  }
}

// Register with the per-channel isolation system (tfmx editor mode = UADE formats)
registerIsolationEngineResolver(async () => {
  if (UADEEngine.hasInstance()) {
    const engine = UADEEngine.getInstance();
    if (engine.isAvailable()) return engine;
  }
  return null;
}, 'tfmx');
