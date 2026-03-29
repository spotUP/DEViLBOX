/**
 * SfizzSynth.ts — Sfizz SFZ sample player engine for DEViLBOX
 *
 * Loads SFZ instrument definitions and WAV/FLAC/OGG samples into a WASM-based
 * sfizz engine running in an AudioWorklet. Supports the SFZ v1/v2 format.
 *
 * CC Mappings (standard MIDI CCs used by SFZ instruments):
 *   CC 1   - Modulation Wheel
 *   CC 7   - Volume
 *   CC 10  - Pan
 *   CC 11  - Expression
 *   CC 64  - Sustain Pedal (hold)
 *   CC 66  - Sostenuto
 *   CC 67  - Soft Pedal
 *   CC 71  - Filter Resonance (Timbre)
 *   CC 72  - Release Time
 *   CC 73  - Attack Time
 *   CC 74  - Filter Cutoff (Brightness)
 *   CC 91  - Reverb Send
 *   CC 93  - Chorus Send
 *   CC 120 - All Sound Off
 *   CC 123 - All Notes Off
 *   (SFZ instruments can map any CC 0-511 via the sfizz HD CC system)
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

/** Standard MIDI CC numbers commonly used in SFZ instruments */
export const SFIZZ_CC = {
  MODULATION: 1,
  VOLUME: 7,
  PAN: 10,
  EXPRESSION: 11,
  SUSTAIN: 64,
  SOSTENUTO: 66,
  SOFT_PEDAL: 67,
  FILTER_RESONANCE: 71,
  RELEASE_TIME: 72,
  ATTACK_TIME: 73,
  FILTER_CUTOFF: 74,
  REVERB_SEND: 91,
  CHORUS_SEND: 93,
  ALL_SOUND_OFF: 120,
  ALL_NOTES_OFF: 123,
} as const;

/** Sfizz engine configuration */
export interface SfizzConfig {
  volume: number;              // dB (-60 to +6)
  numVoices: number;           // 1-256
  oversampling: number;        // 1, 2, 4, or 8
  preloadSize: number;         // bytes, sample preload buffer size
  sampleQuality: number;       // 0-10
  oscillatorQuality: number;   // 0-3
}

export const DEFAULT_SFIZZ: SfizzConfig = {
  volume: 0,
  numVoices: 64,
  oversampling: 1,
  preloadSize: 8192,
  sampleQuality: 2,
  oscillatorQuality: 1,
};

export const SFIZZ_PRESETS: Record<string, Partial<SfizzConfig>> = {
  'Default': { ...DEFAULT_SFIZZ },
  'High Quality': { ...DEFAULT_SFIZZ, oversampling: 2, sampleQuality: 5, oscillatorQuality: 2 },
  'Low CPU': { ...DEFAULT_SFIZZ, numVoices: 32, oversampling: 1, sampleQuality: 1, oscillatorQuality: 0 },
  'Maximum': { ...DEFAULT_SFIZZ, numVoices: 128, oversampling: 4, sampleQuality: 8, oscillatorQuality: 3 },
};

export class SfizzEngine implements DevilboxSynth {
  readonly name = 'SfizzEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: SfizzConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private _initPromise: Promise<void> | null = null;
  private sfzLoaded = false;

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  constructor(config: Partial<SfizzConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_SFIZZ, ...config };
  }

  async init(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this.initialize();
    }
    return this._initPromise;
  }

  async ensureInitialized(): Promise<void> {
    return this.init();
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!SfizzEngine.isWorkletLoaded) {
        if (!SfizzEngine.workletLoadPromise) {
          SfizzEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}sfizz/Sfizz.worklet.js`
          );
        }
        await SfizzEngine.workletLoadPromise;
        SfizzEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}sfizz/Sfizz.wasm`),
        fetch(`${baseUrl}sfizz/Sfizz.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load Sfizz.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load Sfizz.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}sfizz/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      this._worklet = new AudioWorkletNode(rawContext, 'sfizz-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Sfizz init timeout')), 15000);
        this._worklet!.port.onmessage = (event) => {
          const msg = event.data;
          if (msg.type === 'ready') {
            clearTimeout(timeout);
            this.isInitialized = true;
            this.applyConfig(this.config);
            for (const { note, velocity } of this.pendingNotes) {
              this._worklet!.port.postMessage({ type: 'noteOn', note, velocity: velocity / 127 });
            }
            this.pendingNotes = [];
            resolve();
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            console.error('Sfizz error:', msg.message);
            reject(new Error(msg.message));
          } else if (msg.type === 'sfzLoaded') {
            this.sfzLoaded = msg.success;
          }
        };
      });

      this._worklet.port.postMessage({
        type: 'init', wasmBinary, jsCode, sampleRate: rawContext.sampleRate,
      });

      this._worklet.connect(this.output);

      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

      await readyPromise;
    } catch (error) {
      console.error('Failed to initialize Sfizz:', error);
      throw error;
    }
  }

  applyConfig(config: Partial<SfizzConfig>): void {
    Object.assign(this.config, config);
    if (!this._worklet || !this.isInitialized) return;

    if (config.volume !== undefined) {
      this._worklet.port.postMessage({ type: 'setVolume', value: config.volume });
    }
    if (config.numVoices !== undefined) {
      this._worklet.port.postMessage({ type: 'setNumVoices', value: config.numVoices });
    }
    if (config.oversampling !== undefined) {
      this._worklet.port.postMessage({ type: 'setOversampling', value: config.oversampling });
    }
    if (config.preloadSize !== undefined) {
      this._worklet.port.postMessage({ type: 'setPreloadSize', value: config.preloadSize });
    }
    if (config.sampleQuality !== undefined) {
      this._worklet.port.postMessage({ type: 'setSampleQuality', value: config.sampleQuality });
    }
    if (config.oscillatorQuality !== undefined) {
      this._worklet.port.postMessage({ type: 'setOscillatorQuality', value: config.oscillatorQuality });
    }
  }

  /** Load an SFZ definition from a text string */
  async loadSfzString(sfzText: string, virtualPath?: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this._worklet) return false;

    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'sfzLoaded') {
          this._worklet!.port.removeEventListener('message', handler);
          this.sfzLoaded = event.data.success;
          resolve(event.data.success);
        }
      };
      this._worklet!.port.addEventListener('message', handler);
      this._worklet!.port.postMessage({ type: 'loadSfzString', sfzText, virtualPath });
    });
  }

  /** Load an SFZ file already written to MEMFS */
  async loadSfzFile(path: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this._worklet) return false;

    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'sfzLoaded') {
          this._worklet!.port.removeEventListener('message', handler);
          this.sfzLoaded = event.data.success;
          resolve(event.data.success);
        }
      };
      this._worklet!.port.addEventListener('message', handler);
      this._worklet!.port.postMessage({ type: 'loadSfzFile', path });
    });
  }

  /** Write a sample file to the WASM virtual filesystem */
  async writeSample(path: string, data: ArrayBuffer): Promise<void> {
    await this.ensureInitialized();
    if (!this._worklet) return;
    this._worklet.port.postMessage({ type: 'writeSample', path, data }, [data]);
  }

  /** Write multiple files at once (SFZ + samples) */
  async writeFiles(files: Array<{ path: string; data: ArrayBuffer }>): Promise<void> {
    await this.ensureInitialized();
    if (!this._worklet) return;
    const transferables = files.map(f => f.data);
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'filesWritten') {
          this._worklet!.port.removeEventListener('message', handler);
          resolve();
        }
      };
      this._worklet!.port.addEventListener('message', handler);
      this._worklet!.port.postMessage({ type: 'writeFiles', files }, transferables);
    });
  }

  /** Create directory tree in MEMFS */
  async mkdirp(path: string): Promise<void> {
    await this.ensureInitialized();
    if (!this._worklet) return;
    this._worklet.port.postMessage({ type: 'mkdirp', path });
  }

  /**
   * Load a complete SFZ instrument with all referenced samples.
   * @param sfzPath Virtual path for the SFZ file (e.g., "/instruments/piano.sfz")
   * @param sfzContent The SFZ file text content
   * @param samples Array of {path, data} for each referenced sample
   */
  async loadInstrument(
    sfzPath: string,
    sfzContent: string,
    samples: Array<{ path: string; data: ArrayBuffer }>
  ): Promise<boolean> {
    await this.ensureInitialized();
    if (!this._worklet) return false;

    if (samples.length > 0) {
      await this.writeFiles(samples);
    }

    const encoder = new TextEncoder();
    const sfzData = encoder.encode(sfzContent);
    const sfzBuf = sfzData.buffer.slice(sfzData.byteOffset, sfzData.byteOffset + sfzData.byteLength);
    await this.writeSample(sfzPath, sfzBuf);

    return this.loadSfzFile(sfzPath);
  }

  noteOn(noteOrName: number | string, velocity = 100): void {
    const note = typeof noteOrName === 'string' ? noteToMidi(noteOrName) : noteOrName;
    const vel = Math.max(0, Math.min(1, velocity / 127));

    if (!this._worklet || !this.isInitialized) {
      this.pendingNotes.push({ note, velocity });
      return;
    }
    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
  }

  noteOff(noteOrName: number | string): void {
    const note = typeof noteOrName === 'string' ? noteToMidi(noteOrName) : noteOrName;
    if (!this._worklet || !this.isInitialized) return;
    this._worklet.port.postMessage({ type: 'noteOff', note, velocity: 0 });
  }

  allNotesOff(): void {
    if (!this._worklet || !this.isInitialized) return;
    this._worklet.port.postMessage({ type: 'allSoundOff' });
    this.pendingNotes = [];
  }

  /** Send a MIDI CC (value 0-1 normalized, HD precision) */
  sendCC(cc: number, value: number): void {
    if (!this._worklet || !this.isInitialized) return;
    this._worklet.port.postMessage({ type: 'cc', cc, value: Math.max(0, Math.min(1, value)) });
  }

  /** Send pitch wheel (-8192 to +8191) */
  sendPitchWheel(value: number): void {
    if (!this._worklet || !this.isInitialized) return;
    this._worklet.port.postMessage({ type: 'pitchWheel', value: Math.max(-8192, Math.min(8191, value | 0)) });
  }

  /** Send channel aftertouch (0-127) */
  sendAftertouch(value: number): void {
    if (!this._worklet || !this.isInitialized) return;
    this._worklet.port.postMessage({ type: 'aftertouch', value: Math.max(0, Math.min(127, value | 0)) });
  }

  /** Send MIDI program change (0-127) */
  sendProgramChange(program: number): void {
    if (!this._worklet || !this.isInitialized) return;
    this._worklet.port.postMessage({ type: 'programChange', program: Math.max(0, Math.min(127, program | 0)) });
  }

  /** Set transport tempo (BPM) — used by SFZ instruments with tempo-synced LFOs */
  setTempo(bpm: number): void {
    if (!this._worklet || !this.isInitialized) return;
    this._worklet.port.postMessage({ type: 'setTempo', bpm });
  }

  /** Query engine info (async round-trip to worklet) */
  async getInfo(): Promise<{
    numRegions: number;
    numGroups: number;
    numVoices: number;
    activeVoices: number;
    preloadedSamples: number;
    volume: number;
    oversampling: number;
    sfzLoaded: boolean;
  } | null> {
    if (!this._worklet || !this.isInitialized) return null;
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'info') {
          this._worklet!.port.removeEventListener('message', handler);
          resolve(event.data);
        }
      };
      this._worklet!.port.addEventListener('message', handler);
      this._worklet!.port.postMessage({ type: 'getInfo' });
    });
  }

  get isSfzLoaded(): boolean {
    return this.sfzLoaded;
  }

  dispose(): void {
    if (this._worklet) {
      this._worklet.port.postMessage({ type: 'dispose' });
      this._worklet.disconnect();
      this._worklet = null;
    }
    this.isInitialized = false;
    this.sfzLoaded = false;
    this.pendingNotes = [];
    this._initPromise = null;
  }
}
