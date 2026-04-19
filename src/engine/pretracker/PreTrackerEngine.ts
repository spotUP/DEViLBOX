/**
 * PreTrackerEngine.ts - Singleton WASM engine wrapper for PreTracker replayer
 *
 * Uses emoon's C port of the Raspberry Casket replayer.
 * Supports metadata queries, track cell access, wave/instrument info,
 * and live playback state (position/row).
 */

import { getDevilboxAudioContext } from "@/utils/audio-context";
import { getToneEngine } from '@engine/ToneEngine';
import type { IsolationCapableEngine } from '@/engine/tone/ChannelRoutedEffects';
import {
  WASMSingletonBase,
  createWASMAssetsCache,
  type WASMAssetsCache,
  type WASMLoaderConfig,
} from '@engine/wasm/WASMSingletonBase';

/** PreTracker adds HEAP32 rewrite. */
function preTrackerTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;')
    .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;')
    .replace(/HEAP32=new Int32Array\(b\);/, 'HEAP32=new Int32Array(b);Module["HEAP32"]=HEAP32;');
}

export interface PreTrackerMetadata {
  title: string;
  author: string;
  numWaves: number;
  numInstruments: number;
  numPositions: number;
  numSteps: number;
  subsongCount: number;
  waveNames: string[];
  instrumentNames: string[];
}

export interface PreTrackerTrackCell {
  note: number;
  instrument: number;
  hasArpeggio: boolean;
  effectCmd: number;
  effectData: number;
}

export interface PreTrackerWaveInfo {
  loopStart: number;
  loopEnd: number;
  subloopLen: number;
  allow9xx: number;
  subloopWait: number;
  subloopStep: number;
  chipram: number;
  loopOffset: number;
  chordNote1: number;
  chordNote2: number;
  chordNote3: number;
  chordShift: number;
  oscPhaseSpd: number;
  oscType: number;
  oscPhaseMin: number;
  oscPhaseMax: number;
  oscBasenote: number;
  oscGain: number;
  samLen: number;
  mixWave: number;
  volAttack: number;
  volDelay: number;
  volDecay: number;
  volSustain: number;
  fltType: number;
  fltResonance: number;
  pitchRamp: number;
  fltStart: number;
  fltMin: number;
  fltMax: number;
  fltSpeed: number;
  modWetness: number;
  modLength: number;
  modPredelay: number;
  modDensity: number;
  boost: boolean;
  pitchLinear: boolean;
  volFast: boolean;
  extraOctaves: boolean;
}

export interface PreTrackerInstInfo {
  vibratoDelay: number;
  vibratoDepth: number;
  vibratoSpeed: number;
  adsrAttack: number;
  adsrDecay: number;
  adsrSustain: number;
  adsrRelease: number;
  patternSteps: number;
}

export interface PreTrackerInstPatternStep {
  pitchByte: number;
  cmdByte: number;
  cmdData: number;
  note: number;
  stitched: boolean;
  pinned: boolean;
  cmd: number;
}

export interface PreTrackerInstPattern {
  steps: number;
  entries: PreTrackerInstPatternStep[];
}

type MetadataCallback = (meta: PreTrackerMetadata) => void;
type WaveInfoCallback = (waves: (PreTrackerWaveInfo | null)[]) => void;
type InstInfoCallback = (instruments: (PreTrackerInstInfo | null)[]) => void;
type InstPatternCallback = (patterns: (PreTrackerInstPattern | null)[]) => void;
type RawFileCallback = (data: ArrayBuffer | null) => void;
type RawInstInfoCallback = (instruments: (number[] | null)[]) => void;

export class PreTrackerEngine extends WASMSingletonBase implements IsolationCapableEngine {
  static readonly MAX_ISOLATION_SLOTS = 4;
  private static instance: PreTrackerEngine | null = null;
  private static cache: WASMAssetsCache = createWASMAssetsCache();

  private _metadata: PreTrackerMetadata | null = null;
  private _metadataCallbacks: MetadataCallback[] = [];
  private _waveInfoCallbacks: WaveInfoCallback[] = [];
  private _instInfoCallbacks: InstInfoCallback[] = [];
  private _instPatternCallbacks: InstPatternCallback[] = [];
  private _rawFileCallbacks: RawFileCallback[] = [];
  private _rawInstInfoCallbacks: RawInstInfoCallback[] = [];

  private _position = 0;
  private _row = 0;

  private constructor() {
    super();
    this.initialize(PreTrackerEngine.cache);
  }

  static getInstance(): PreTrackerEngine {
    // AudioContext-swap guard (see JamCrackerEngine:48-63 for the reference).
    // Without this, the engine stays attached to a dead context on HMR /
    // iOS suspend / page reload and goes silent with no error.
    const currentCtx = getDevilboxAudioContext();
    if (
      !PreTrackerEngine.instance ||
      PreTrackerEngine.instance._disposed ||
      PreTrackerEngine.instance.audioContext !== currentCtx
    ) {
      if (PreTrackerEngine.instance && !PreTrackerEngine.instance._disposed) {
        PreTrackerEngine.instance.dispose();
      }
      PreTrackerEngine.instance = new PreTrackerEngine();
    }
    return PreTrackerEngine.instance;
  }

  static hasInstance(): boolean {
    return !!PreTrackerEngine.instance && !PreTrackerEngine.instance._disposed;
  }

  get metadata(): PreTrackerMetadata | null { return this._metadata; }
  get position(): number { return this._position; }
  get row(): number { return this._row; }

  protected getLoaderConfig(): WASMLoaderConfig {
    // NOTE: worklet file is CamelCase "PreTracker.worklet.js" but the wasm/js
    // glue uses lowercase "Pretracker.wasm/Pretracker.js" — preserve exactly.
    return {
      dir: 'pretracker',
      workletFile: 'PreTracker.worklet.js',
      wasmFile: 'Pretracker.wasm',
      jsFile: 'Pretracker.js',
      transformJS: preTrackerTransform,
    };
  }

  protected createNode(): void {
    const ctx = this.audioContext;

    this.workletNode = new AudioWorkletNode(ctx, 'pretracker-processor', {
      outputChannelCount: [2, 2, 2, 2, 2],
      numberOfOutputs: 1 + PreTrackerEngine.MAX_ISOLATION_SLOTS,
    });

    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'ready':
          console.log('[PreTrackerEngine] WASM ready (emoon C port)');
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;

        case 'moduleLoaded':
          console.log('[PreTrackerEngine] Module loaded');
          break;

        case 'metadata':
          this._metadata = {
            title: data.title,
            author: data.author,
            numWaves: data.numWaves,
            numInstruments: data.numInstruments,
            numPositions: data.numPositions,
            numSteps: data.numSteps,
            subsongCount: data.subsongCount,
            waveNames: data.waveNames,
            instrumentNames: data.instrumentNames,
          };
          for (const cb of this._metadataCallbacks) cb(this._metadata);
          this._metadataCallbacks = [];
          break;

        case 'allWaveInfo': {
          const waves = (data.waves as (number[] | null)[]).map((f) =>
            f ? this.parseWaveFields(f) : null
          );
          for (const cb of this._waveInfoCallbacks) cb(waves);
          this._waveInfoCallbacks = [];
          break;
        }

        case 'allInstInfo': {
          const instruments = (data.instruments as (number[] | null)[]).map((f) =>
            f ? this.parseInstFields(f) : null
          );
          for (const cb of this._instInfoCallbacks) cb(instruments);
          this._instInfoCallbacks = [];
          break;
        }

        case 'allInstPatterns': {
          const patterns = (data.patterns as ({ steps: number; entries: number[][] } | null)[]).map((p) => {
            if (!p) return null;
            return {
              steps: p.steps,
              entries: p.entries.map((e: number[]) => ({
                pitchByte: e[0],
                cmdByte: e[1],
                cmdData: e[2],
                note: e[0] & 0x3F,
                stitched: (e[0] & 0x80) !== 0,
                pinned: (e[0] & 0x40) !== 0,
                cmd: e[1] & 0x0F,
              })),
            };
          });
          for (const cb of this._instPatternCallbacks) cb(patterns);
          this._instPatternCallbacks = [];
          break;
        }

        case 'allRawInstInfo':
          for (const cb of this._rawInstInfoCallbacks) {
            cb(data.instruments as (number[] | null)[]);
          }
          this._rawInstInfoCallbacks = [];
          break;

        case 'rawFile':
          for (const cb of this._rawFileCallbacks) {
            cb(data.valid ? data.data : null);
          }
          this._rawFileCallbacks = [];
          break;

        case 'chLevels':
          this._position = data.position ?? 0;
          this._row = data.row ?? 0;
          try {
            const engine = getToneEngine();
            const levels: number[] = data.levels;
            for (let i = 0; i < levels.length; i++) {
              engine.triggerChannelMeter(i, levels[i]);
            }
          } catch { /* ToneEngine not ready */ }
          break;

        case 'error':
          console.error('[PreTrackerEngine]', data.message);
          break;
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: ctx.sampleRate,
      wasmBinary: PreTrackerEngine.cache.wasmBinary,
      jsCode: PreTrackerEngine.cache.jsCode,
    });

    this.workletNode.connect(this.output);
  }

  private parseWaveFields(f: number[]): PreTrackerWaveInfo {
    return {
      loopStart: f[0], loopEnd: f[1], subloopLen: f[2], allow9xx: f[3],
      subloopWait: f[4], subloopStep: f[5], chipram: f[6], loopOffset: f[7],
      chordNote1: f[8], chordNote2: f[9], chordNote3: f[10], chordShift: f[11],
      oscPhaseSpd: f[12], oscType: f[13], oscPhaseMin: f[14], oscPhaseMax: f[15],
      oscBasenote: f[16], oscGain: f[17], samLen: f[18], mixWave: f[19],
      volAttack: f[20], volDelay: f[21], volDecay: f[22], volSustain: f[23],
      fltType: f[24], fltResonance: f[25], pitchRamp: f[26],
      fltStart: f[27], fltMin: f[28], fltMax: f[29], fltSpeed: f[30],
      modWetness: f[31], modLength: f[32], modPredelay: f[33], modDensity: f[34],
      boost: f[35] !== 0, pitchLinear: f[36] !== 0,
      volFast: f[37] !== 0, extraOctaves: f[38] !== 0,
    };
  }

  private parseInstFields(f: number[]): PreTrackerInstInfo {
    return {
      vibratoDelay: f[0], vibratoDepth: f[1], vibratoSpeed: f[2],
      adsrAttack: f[3], adsrDecay: f[4], adsrSustain: f[5],
      adsrRelease: f[6], patternSteps: f[7],
    };
  }

  async loadTune(buffer: ArrayBuffer): Promise<void> {
    await this._initPromise;
    if (!this.workletNode) throw new Error('PreTrackerEngine not initialized');

    this._metadata = null;
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
    this.workletNode?.port.postMessage({ type: 'setChannelGain', channel, gain });
  }

  setSubsong(index: number): void {
    this.workletNode?.port.postMessage({ type: 'setSubsong', subsong: index });
  }

  setSoloChannel(channel: number): void {
    this.workletNode?.port.postMessage({ type: 'setSoloChannel', channel });
  }

  setStereoMix(mix: number): void {
    this.workletNode?.port.postMessage({ type: 'setStereoMix', mix });
  }

  setInterpMode(mode: number): void {
    this.workletNode?.port.postMessage({ type: 'setInterpMode', mode });
  }

  requestMetadata(): Promise<PreTrackerMetadata> {
    if (this._metadata) return Promise.resolve(this._metadata);
    return new Promise((resolve) => {
      this._metadataCallbacks.push(resolve);
      this.workletNode?.port.postMessage({ type: 'getMetadata' });
    });
  }

  requestAllWaveInfo(): Promise<(PreTrackerWaveInfo | null)[]> {
    return new Promise((resolve) => {
      this._waveInfoCallbacks.push(resolve);
      this.workletNode?.port.postMessage({ type: 'getAllWaveInfo' });
    });
  }

  requestAllInstInfo(): Promise<(PreTrackerInstInfo | null)[]> {
    return new Promise((resolve) => {
      this._instInfoCallbacks.push(resolve);
      this.workletNode?.port.postMessage({ type: 'getAllInstInfo' });
    });
  }

  requestAllInstPatterns(): Promise<(PreTrackerInstPattern | null)[]> {
    return new Promise((resolve) => {
      this._instPatternCallbacks.push(resolve);
      this.workletNode?.port.postMessage({ type: 'getAllInstPatterns' });
    });
  }

  requestAllRawInstInfo(): Promise<(number[] | null)[]> {
    return new Promise((resolve) => {
      this._rawInstInfoCallbacks.push(resolve);
      this.workletNode?.port.postMessage({ type: 'getAllRawInstInfo' });
    });
  }

  requestRawFile(): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
      this._rawFileCallbacks.push(resolve);
      this.workletNode?.port.postMessage({ type: 'getRawFile' });
    });
  }

  // ── Write-back methods (live parameter editing) ──

  setWaveInfo(waveIdx: number, wave: PreTrackerWaveInfo): void {
    const fields = [
      wave.loopStart, wave.loopEnd, wave.subloopLen, wave.allow9xx,
      wave.subloopWait, wave.subloopStep, wave.chipram, wave.loopOffset,
      wave.chordNote1, wave.chordNote2, wave.chordNote3, wave.chordShift,
      wave.oscPhaseSpd, wave.oscType, wave.oscPhaseMin, wave.oscPhaseMax,
      wave.oscBasenote, wave.oscGain, wave.samLen, wave.mixWave,
      wave.volAttack, wave.volDelay, wave.volDecay, wave.volSustain,
      wave.fltType, wave.fltResonance, wave.pitchRamp,
      wave.fltStart, wave.fltMin, wave.fltMax, wave.fltSpeed,
      wave.modWetness, wave.modLength, wave.modPredelay, wave.modDensity,
      wave.boost ? 1 : 0, wave.pitchLinear ? 1 : 0,
      wave.volFast ? 1 : 0, wave.extraOctaves ? 1 : 0,
    ];
    this.workletNode?.port.postMessage({ type: 'setWaveInfo', waveIdx, fields });
  }

  setInstInfo(instIdx: number, inst: PreTrackerInstInfo): void {
    const fields = [
      inst.vibratoDelay, inst.vibratoDepth, inst.vibratoSpeed,
      inst.adsrAttack, inst.adsrDecay, inst.adsrSustain,
      inst.adsrRelease, inst.patternSteps,
    ];
    this.workletNode?.port.postMessage({ type: 'setInstInfo', instIdx, fields });
  }

  setInstPatternStep(instIdx: number, step: number, pitchByte: number, cmdByte: number, cmdData: number): void {
    this.workletNode?.port.postMessage({ type: 'setInstPatternStep', instIdx, step, pitchByte, cmdByte, cmdData });
  }

  setTrackCell(track: number, row: number, pitchCtrl: number, instEffect: number, effectData: number): void {
    this.workletNode?.port.postMessage({ type: 'setTrackCell', track, row, pitchCtrl, instEffect, effectData });
  }

  setPositionEntry(position: number, channel: number, trackNum: number, pitchShift: number): void {
    this.workletNode?.port.postMessage({ type: 'setPositionEntry', position, channel, trackNum, pitchShift });
  }

  // ── IsolationCapableEngine implementation ──

  addIsolation(slotIndex: number, channelMask: number): void {
    this.workletNode?.port.postMessage({ type: 'addIsolation', slotIndex, channelMask });
  }

  removeIsolation(slotIndex: number): void {
    this.workletNode?.port.postMessage({ type: 'removeIsolation', slotIndex });
  }

  getWorkletNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  isAvailable(): boolean {
    return !this._disposed && this.workletNode !== null;
  }

  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask: number): void {
    if (!this.workletNode) return;
    for (let ch = 0; ch < 4; ch++) {
      const muted = (mask & (1 << ch)) === 0;
      this.setChannelGain(ch, muted ? 0 : 1);
    }
  }

  override dispose(): void {
    super.dispose();
    if (PreTrackerEngine.instance === this) {
      PreTrackerEngine.instance = null;
    }
  }
}
