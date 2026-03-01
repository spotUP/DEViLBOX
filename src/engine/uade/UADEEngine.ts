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
  speed: number;        // Detected speed
  warnings?: string[];  // Degradation notices (e.g. VBlank fallback, no PCM extracted)
}

export interface UADEMetadata {
  player: string;       // Detected eagleplayer name (e.g. "JochenHippel")
  formatName: string;   // Human-readable format (e.g. "Jochen Hippel")
  minSubsong: number;
  maxSubsong: number;
  subsongCount: number;
  scanData?: UADEScanRow[][];            // Pre-scanned pattern data: rows of 4 channels
  enhancedScan?: UADEEnhancedScanData;   // Enhanced scan data with samples + effects
}

export interface UADEPositionUpdate {
  subsong: number;
  position: number;
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

export class UADEEngine {
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
    if (!UADEEngine.instance || UADEEngine.instance._disposed) {
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
        await context.audioWorklet.addModule(`${baseUrl}uade/UADE.worklet.js?v=2`);
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
      outputChannelCount: [2],
      numberOfOutputs: 1,
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
            this._resolveLoad(meta);
            this._resolveLoad = null;
            this._rejectLoad = null;
          }
          break;

        case 'error':
          console.error('[UADEEngine]', data.message);
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
            cb({ subsong: data.subsong ?? 0, position: data.position ?? 0 });
          }
          break;

        case 'channels':
          for (const cb of this._channelCallbacks) {
            cb(data.channels, data.totalFrames);
          }
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
   * Load an exotic Amiga music file.
   * @param data - Raw file bytes
   * @param filenameHint - Original filename (used by UADE for format detection)
   */
  async load(data: ArrayBuffer, filenameHint: string): Promise<UADEMetadata> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');

    this._loadPromise = new Promise<UADEMetadata>((resolve, reject) => {
      this._resolveLoad = resolve;
      this._rejectLoad = reject;
    });

    // Clone buffer before transferring (caller may need it later for subsong switching)
    const transferBuf = data.slice(0);
    this.workletNode.port.postMessage(
      { type: 'load', buffer: transferBuf, filenameHint },
      [transferBuf]
    );

    return this._loadPromise;
  }

  /**
   * Write a companion file into the WASM virtual filesystem before loading.
   * Required for multi-file formats like TFMX (mdat.* + smpl.*).
   * Must be called BEFORE load() for the companion to be available.
   */
  async addCompanionFile(filename: string, data: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('UADEEngine not initialized');
    const transferBuf = data.slice(0);
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
    this.workletNode?.port.postMessage({ type: 'play' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
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

  dispose(): void {
    this._disposed = true;
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
