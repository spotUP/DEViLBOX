/**
 * KlysEngine.ts - Singleton WASM engine wrapper for klystrack replayer
 *
 * Manages the AudioWorklet node for klystrack (.kt) song playback.
 * Follows the HivelyEngine pattern.
 */

import { getDevilboxAudioContext } from '@/utils/audio-context';
import { ChannelMeterFeed } from '../tone/channelMeterFeed';
import { PositionCallbacks, type EnginePositionUpdate } from '@engine/wasm/PositionCallbacks';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

const meterFeed = new ChannelMeterFeed();

/** Klys adds a defensive comment footer referencing the EXPORT_NAME factory. */
export function klysTransform(code: string): string {
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

/** One channel's instrument program state, from the worklet's programStatus report. */
export interface KlysChannelProgram { instrument: number; step: number; tick: number; running: boolean }

export interface KlysWavetableInfo { name: string; samples: number; loopBegin: number; loopEnd: number; baseNote: number }

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
  wavetables: KlysWavetableInfo[];
}

type KlysEngineInstrument = NonNullable<KlysSongData['instruments'][number]>;

/**
 * Pack an instrument in the layout of klys_get_instrument_data / klys_set_instrument_data
 * (KlysWrapper.c): the one inverse of the worklet's reader.
 */
export function packKlysInstrument(i: KlysEngineInstrument): Uint8Array {
  const out = new Uint8Array(147);
  let p = 0;
  const u8 = (v: number) => { out[p++] = v & 0xff; };
  const u16 = (v: number) => { u8(v); u8(v >> 8); };
  const u32 = (v: number) => { u8(v); u8(v >> 8); u8(v >> 16); u8(v >>> 24); };
  u8(i.adsr.a); u8(i.adsr.d); u8(i.adsr.s); u8(i.adsr.r);
  u32(i.flags); u32(i.cydflags);
  u8(i.baseNote); u8(i.finetune); u8(i.slideSpeed); u16(i.pw); u8(i.volume); u8(i.progPeriod);
  u8(i.vibratoSpeed); u8(i.vibratoDepth); u8(i.pwmSpeed); u8(i.pwmDepth);
  u16(i.cutoff); u8(i.resonance); u8(i.flttype); u8(i.ymEnvShape); u16(i.buzzOffset);
  u8(i.fxBus); u8(i.vibShape); u8(i.vibDelay); u8(i.pwmShape);
  u8(i.lfsrType); u8(i.wavetableEntry); u8(i.ringMod); u8(i.syncSource);
  u32(i.fmFlags); u8(i.fmModulation); u8(i.fmFeedback); u8(i.fmWave); u8(i.fmHarmonic);
  u8(i.fmAdsr.a); u8(i.fmAdsr.d); u8(i.fmAdsr.s); u8(i.fmAdsr.r); u8(i.fmAttackStart);
  for (let k = 0; k < 32; k++) u16(i.program[k] ?? 0xfffe);
  for (let k = 0; k < 32; k++) u8(k < i.name.length ? i.name.charCodeAt(k) : 0);
  return out;
}

export class KlysEngine extends WASMSingletonBase {
  private static instance: KlysEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _songPromise: Promise<KlysSongInfo> | null = null;
  private _resolveSong: ((info: KlysSongInfo) => void) | null = null;
  private _rejectSong: ((err: Error) => void) | null = null;
  /**
   * Position reports in the house shape (EnginePositionUpdate): row = the
   * pattern step channel 0 plays, songPos = the song ROW (g_mus.song_position),
   * klystrack's position unit. One shape means NativeEngineRouting wires it
   * once, through its generic subscription.
   */
  private readonly _positions = new PositionCallbacks();
  private _songEndCallbacks: Set<() => void> = new Set();
  private _songDataCallbacks: Set<(data: KlysSongData) => void> = new Set();
  private _lastSongData: KlysSongData | null = null;
  private readonly _programCallbacks = new Set<(channels: KlysChannelProgram[]) => void>();
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
          useOscilloscopeStore.getState().setChipInfo(
            data.channels, 0, Array.from({ length: data.channels }, (_, i) => `CH${i + 1}`),
          );
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
          this._positions.emit({ songPos: data.songPosition, row: data.patternPosition });
          break;

        case 'programStatus':
          for (const cb of this._programCallbacks) cb(data.channels);
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
            wavetables: data.wavetables ?? [],
          };
          // The one writer of klysNative from the engine (klysSongData.ts). Imported
          // at call time: a static import would put this engine in the stores'
          // import cycle (songPersistenceImportCycle.test.ts).
          {
            const songData = this._lastSongData;
            void import('./klysSongData').then(({ applyKlysSongData }) => applyKlysSongData(songData));
          }
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
          meterFeed.report(data.levels, data.noteStarts);
          break;

        case 'oscData':
          useOscilloscopeStore.getState().updateChannelData(data.channels, data.frame, data.sampleRate);
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
    this.workletNode?.port.postMessage({ type: 'enableOsc' });
  }

  stop(): void {
    this.workletNode?.port.postMessage({ type: 'stop' });
    this.workletNode?.port.postMessage({ type: 'disableOsc' });
    useOscilloscopeStore.getState().clear();
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

  onPositionUpdate(cb: (update: EnginePositionUpdate) => void): () => void {
    return this._positions.add(cb);
  }

  /**
   * Drive the replayer's coordinator from the engine's own position: the
   * playing row (channel 0's pattern step) and the song position, which in
   * klystrack is the song ROW (g_mus.song_position; sequence entries and the
   * parser's songPositions are indexed by it). With this wired the replayer
   * skips its TS scheduler, which would otherwise tick the parser's stub song
   * at its estimated BPM and write the transport row at the wrong rate.
   */
  subscribeToCoordinator(coordinator: import('@engine/PlaybackCoordinator').PlaybackCoordinator): () => void {
    let lastRow = -1;
    let lastPosition = -1;
    return this.onPositionUpdate((update) => {
      if (update.row === lastRow && update.songPos === lastPosition) return;
      lastRow = update.row;
      lastPosition = update.songPos;
      coordinator.dispatchEnginePosition(update.row, update.songPos);
    });
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

  /** Replace every field of instrument idx at once (inverse of the songData read). */
  setInstrumentData(idx: number, inst: KlysEngineInstrument): void {
    this.sendMessage({ type: 'setInstrumentData', idx, data: packKlysInstrument(inst).buffer });
  }

  /** Audition instrument inst on the spare channel; never starts or stops the song. */
  previewNoteOn(inst: number, note: number): void {
    this.sendMessage({ type: 'previewNoteOn', inst, note });
  }

  previewNoteOff(): void {
    this.sendMessage({ type: 'previewNoteOff' });
  }

  /** Per-channel program state with every position report; the worklet watches only while subscribed. */
  subscribeProgramStatus(cb: (channels: KlysChannelProgram[]) => void): () => void {
    this._programCallbacks.add(cb);
    if (this._programCallbacks.size === 1) this.sendMessage({ type: 'watchProgram', on: true });
    return () => {
      if (!this._programCallbacks.delete(cb)) return;
      if (this._programCallbacks.size === 0) this.sendMessage({ type: 'watchProgram', on: false });
    };
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
    this._positions.clear();
    this._songEndCallbacks.clear();
    this._programCallbacks.clear();
    if (KlysEngine.instance === this) {
      KlysEngine.instance = null;
    }
    const g = globalThis as { __devilboxActiveKlysEngine?: KlysEngine | null };
    if (g.__devilboxActiveKlysEngine === this) {
      g.__devilboxActiveKlysEngine = null;
    }
  }
}
