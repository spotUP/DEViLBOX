/**
 * KlysEngine.ts - Singleton WASM engine wrapper for klystrack replayer
 *
 * Manages the AudioWorklet node for klystrack (.kt) song playback.
 * Follows the HivelyEngine pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { getToneEngine } from '@engine/ToneEngine';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** Klys adds a defensive comment footer referencing the EXPORT_NAME factory. */
function klysTransform(code: string): string {
  let out = code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
    .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
  if (!out.includes('var createKlystrack =')) {
    out += '\n// Factory is already named createKlystrack via EXPORT_NAME';
  }
  return out;
}

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
    cutoff: number; resonance: number; flttype: number;
    ymEnvShape: number; buzzOffset: number;
    fxBus: number; vibShape: number; vibDelay: number; pwmShape: number;
    lfsrType: number; wavetableEntry: number; ringMod: number; syncSource: number;
    fmFlags: number; fmModulation: number; fmFeedback: number; fmWave: number; fmHarmonic: number;
    fmAdsr: { a: number; d: number; s: number; r: number }; fmAttackStart: number;
    program: number[];
  } | null>;
}

type PositionCallback = (update: KlysPositionUpdate) => void;

export class KlysEngine extends WASMSingletonBase {
  private static instance: KlysEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songPromise: Promise<KlysSongInfo> | null = null;
  private _resolveSong: ((info: KlysSongInfo) => void) | null = null;
  private _rejectSong: ((err: Error) => void) | null = null;
  private _positionCallbacks: Set<PositionCallback> = new Set();
  private _songEndCallbacks: Set<() => void> = new Set();
  private _songDataCallbacks: Set<(data: KlysSongData) => void> = new Set();
  private _lastSongData: KlysSongData | null = null;
  private _resolveSerialize: ((buf: ArrayBuffer) => void) | null = null;
  private _rejectSerialize: ((err: Error) => void) | null = null;

  private constructor() {
    super();
    this.initialize(KlysEngine.cache);
  }

  static getInstance(): KlysEngine {
    const currentCtx = getDevilboxAudioContext();
    if (!KlysEngine.instance || KlysEngine.instance._disposed ||
        KlysEngine.instance.audioContext !== currentCtx) {
      if (KlysEngine.instance && !KlysEngine.instance._disposed) {
        KlysEngine.instance.dispose();
      }
      KlysEngine.instance = new KlysEngine();
      // Self-register globally so the mixer can find the active instance
      // regardless of module-graph identity. See HivelyEngine for context.
      const g = globalThis as { __devilboxActiveKlysEngine?: KlysEngine };
      g.__devilboxActiveKlysEngine = KlysEngine.instance;
    }
    return KlysEngine.instance;
  }

  static hasInstance(): boolean {
    return !!KlysEngine.instance && !KlysEngine.instance._disposed;
  }

  protected getLoaderConfig(): WASMLoaderConfig {
    return {
      dir: 'klystrack',
      workletFile: 'Klystrack.worklet.js',
      wasmFile: 'Klystrack.wasm',
      jsFile: 'Klystrack.js',
      transformJS: klysTransform,
    };
  }

  protected createNode(): void {
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
          console.log('[KlysEngine] songData message received:', {
            patterns: data.patterns?.length,
            sequences: data.sequences?.length,
            instruments: data.instruments?.length,
            callbacks: this._songDataCallbacks.size,
          });
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

        case 'chLevels':
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            for (let i = 0; i < levels.length; i++) {
              engine.triggerChannelMeter(i, levels[i]);
            }
          } catch { /* ToneEngine not ready */ }
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: KlysEngine.cache.wasmBinary,
      jsCode: KlysEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
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

  setChannelGain(channel: number, gain: number): void {
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
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

  setInstrumentName(idx: number, name: string): void {
    this.sendMessage({ type: 'setInstrumentName', idx, name });
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

  override dispose(): void {
    super.dispose();
    this._positionCallbacks.clear();
    this._songEndCallbacks.clear();
    if (KlysEngine.instance === this) {
      KlysEngine.instance = null;
    }
    const g = globalThis as { __devilboxActiveKlysEngine?: KlysEngine | null };
    if (g.__devilboxActiveKlysEngine === this) {
      g.__devilboxActiveKlysEngine = null;
    }
  }
}
