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
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _channelCallbacks: Set<ChannelCallback> = new Set();
  private _songEndCallbacks: Set<() => void> = new Set();
  private _disposed = false;

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
              meta.enhancedScan = data.enhancedScan;
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
