/**
 * KlysEngine.ts - Singleton WASM engine wrapper for klystrack replayer
 *
 * Manages the AudioWorklet node for klystrack (.kt) song playback.
 * Follows the HivelyEngine pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';

export interface KlysSongInfo {
  title: string;
  channels: number;
  songLength: number;
  numInstruments: number;
  numPatterns: number;
  songSpeed: number;
  songSpeed2: number;
  songRate: number;
  loopPoint: number;
  masterVolume: number;
  flags: number;
}

export interface KlysPositionUpdate {
  songPosition: number;
  patternPosition: number;
  speed: number;
}

export interface KlysSongData {
  patterns: Array<{ numSteps: number; steps: Array<{ note: number; instrument: number; ctrl: number; volume: number; command: number }> }>;
  sequences: Array<{ entries: Array<{ position: number; pattern: number; noteOffset: number }> }>;
  instruments: Array<{
    name: string; adsr: { a: number; d: number; s: number; r: number };
    flags: number; cydflags: number; baseNote: number; finetune: number;
    slideSpeed: number; pw: number; volume: number; progPeriod: number;
    vibratoSpeed: number; vibratoDepth: number; pwmSpeed: number; pwmDepth: number;
    cutoff: number; resonance: number; flttype: number; fxBus: number;
    buzzOffset: number; ringMod: number; syncSource: number; wavetableEntry: number;
    fmModulation: number; fmFeedback: number; fmHarmonic: number;
    fmAdsr: { a: number; d: number; s: number; r: number }; program: number[];
  } | null>;
}

type PositionCallback = (update: KlysPositionUpdate) => void;

export class KlysEngine {
  private static instance: KlysEngine | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  readonly output: GainNode;

  private _initPromise: Promise<void>;
  private _resolveInit: (() => void) | null = null;
  private _songPromise: Promise<KlysSongInfo> | null = null;
  private _resolveSong: ((info: KlysSongInfo) => void) | null = null;
  private _rejectSong: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _songEndCallbacks: Set<() => void> = new Set();
  private _songDataCallbacks: Set<(data: KlysSongData) => void> = new Set();
  private _lastSongData: KlysSongData | null = null;
  private _disposed = false;
  private _resolveSerialize: ((buf: ArrayBuffer) => void) | null = null;
  private _rejectSerialize: ((err: Error) => void) | null = null;

  private constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this._initPromise = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    this.initialize();
  }

  static getInstance(): KlysEngine {
    if (!KlysEngine.instance || KlysEngine.instance._disposed) {
      KlysEngine.instance = new KlysEngine();
    }
    return KlysEngine.instance;
  }

  static hasInstance(): boolean {
    return !!KlysEngine.instance && !KlysEngine.instance._disposed;
  }

  private async initialize(): Promise<void> {
    try {
      await KlysEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error('[KlysEngine] Initialization failed:', err);
      // Resolve init promise so callers don't hang forever
      if (this._resolveInit) {
        this._resolveInit();
        this._resolveInit = null;
      }
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';

      try {
        await context.audioWorklet.addModule(`${baseUrl}klystrack/Klystrack.worklet.js`);
      } catch {
        // Module might already be registered
      }

      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}klystrack/Klystrack.wasm`),
          fetch(`${baseUrl}klystrack/Klystrack.js`),
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
          if (!code.includes('var createKlystrack =')) {
            code += '\n// Factory is already named createKlystrack via EXPORT_NAME';
          }
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

    this.workletNode = new AudioWorkletNode(ctx, 'klystrack-processor', {
      outputChannelCount: [2],
      numberOfOutputs: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'songLoaded':
          if (this._resolveSong) {
            this._resolveSong({
              title: data.title,
              channels: data.channels,
              songLength: data.songLength,
              numInstruments: data.numInstruments,
              numPatterns: data.numPatterns,
              songSpeed: data.songSpeed,
              songSpeed2: data.songSpeed2,
              songRate: data.songRate,
              loopPoint: data.loopPoint,
              masterVolume: data.masterVolume,
              flags: data.flags,
            });
            this._resolveSong = null;
            this._rejectSong = null;
          }
          break;

        case 'error':
          console.error('[KlysEngine]', data.message);
          // If init hasn't resolved yet, this error is from WASM init
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          if (this._rejectSong) {
            this._rejectSong(new Error(data.message));
            this._resolveSong = null;
            this._rejectSong = null;
          }
          break;

        case 'position':
          for (const cb of this._positionCallbacks) {
            cb({
              songPosition: data.songPosition,
              patternPosition: data.patternPosition,
              speed: data.speed,
            });
          }
          break;

        case 'songEnd':
          for (const cb of this._songEndCallbacks) {
            cb();
          }
          break;

        case 'songData':
          this._lastSongData = {
            patterns: data.patterns,
            sequences: data.sequences,
            instruments: data.instruments,
          };
          for (const cb of this._songDataCallbacks) {
            cb(this._lastSongData);
          }
          break;

        case 'serializeSongResult':
          if (this._resolveSerialize) {
            if (data.error) {
              this._rejectSerialize?.(new Error(data.error));
            } else {
              this._resolveSerialize(data.data as ArrayBuffer);
            }
            this._resolveSerialize = null;
            this._rejectSerialize = null;
          }
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: KlysEngine.wasmBinary,
      jsCode: KlysEngine.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  async ready(): Promise<void> {
    return this._initPromise;
  }

  async loadSong(buffer: ArrayBuffer): Promise<KlysSongInfo> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('KlysEngine not initialized');

    this._songPromise = new Promise<KlysSongInfo>((resolve, reject) => {
      this._resolveSong = resolve;
      this._rejectSong = reject;
    });

    this.workletNode.port.postMessage(
      { type: 'loadSong', buffer },
      [buffer]
    );

    return this._songPromise;
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

  setLooping(value: boolean): void {
    this.workletNode?.port.postMessage({ type: 'setLooping', value });
  }

  freeSong(): void {
    this.workletNode?.port.postMessage({ type: 'freeSong' });
  }

  onPositionUpdate(cb: PositionCallback): () => void {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  onSongEnd(cb: () => void): () => void {
    this._songEndCallbacks.add(cb);
    return () => this._songEndCallbacks.delete(cb);
  }

  onSongData(cb: (data: KlysSongData) => void): () => void {
    this._songDataCallbacks.add(cb);
    // If data already received, call immediately
    if (this._lastSongData) cb(this._lastSongData);
    return () => this._songDataCallbacks.delete(cb);
  }

  get lastSongData(): KlysSongData | null {
    return this._lastSongData;
  }

  sendMessage(msg: Record<string, unknown>, transfers?: Transferable[]): void {
    if (!this.workletNode) return;
    if (transfers) {
      this.workletNode.port.postMessage(msg, transfers);
    } else {
      this.workletNode.port.postMessage(msg);
    }
  }

  // ---- Editing methods ----

  setPatternStep(patIdx: number, stepIdx: number, note: number, instrument: number, ctrl: number, volume: number, cmdLo: number, cmdHi: number): void {
    this.sendMessage({ type: 'setPatternStep', patIdx, stepIdx, note, instrument, ctrl, volume, cmdLo, cmdHi });
  }

  setSequenceEntry(chan: number, pos: number, position: number, pattern: number, noteOffset: number): void {
    this.sendMessage({ type: 'setSequenceEntry', chan, pos, position, pattern, noteOffset });
  }

  setInstrumentParam(idx: number, paramId: number, value: number): void {
    this.sendMessage({ type: 'setInstrumentParam', idx, paramId, value });
  }

  setInstrumentProgramStep(idx: number, step: number, value: number): void {
    this.sendMessage({ type: 'setInstrumentProgramStep', idx, step, value });
  }

  serializeSong(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this._resolveSerialize = resolve;
      this._rejectSerialize = reject;
      this.sendMessage({ type: 'serializeSong' });
    });
  }

  dispose(): void {
    this._disposed = true;
    this.workletNode?.port.postMessage({ type: 'dispose' });
    this.workletNode?.disconnect();
    this.workletNode = null;
    this._positionCallbacks.clear();
    this._songEndCallbacks.clear();
    if (KlysEngine.instance === this) {
      KlysEngine.instance = null;
    }
  }
}
