/**
 * FluidSynthSynth.ts - FluidSynth SF2 player WASM engine for DEViLBOX
 *
 * Features:
 * - SF2 SoundFont loading
 * - Reverb (room size, damping, width, level)
 * - Chorus (voices, level, speed, depth, type)
 * - Program/bank selection for GM sounds
 * - Tuning and transpose
 * - ~15 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const FluidSynthParam = {
  REVERB_ROOM_SIZE: 0, REVERB_DAMPING: 1, REVERB_WIDTH: 2, REVERB_LEVEL: 3,
  CHORUS_VOICES: 4, CHORUS_LEVEL: 5, CHORUS_SPEED: 6, CHORUS_DEPTH: 7,
  CHORUS_TYPE: 8,
  GAIN: 9, POLYPHONY: 10,
  PROGRAM: 11, BANK: 12,
  TUNING: 13, TRANSPOSE: 14,
} as const;

export const FLUIDSYNTH_PARAM_NAMES: Record<number, string> = {
  0: 'Reverb Room Size', 1: 'Reverb Damping', 2: 'Reverb Width', 3: 'Reverb Level',
  4: 'Chorus Voices', 5: 'Chorus Level', 6: 'Chorus Speed', 7: 'Chorus Depth',
  8: 'Chorus Type',
  9: 'Gain', 10: 'Polyphony',
  11: 'Program', 12: 'Bank',
  13: 'Tuning', 14: 'Transpose',
};

export interface FluidSynthConfig {
  reverbRoomSize?: number;  // 0-1.2
  reverbDamping?: number;   // 0-1
  reverbWidth?: number;     // 0-100
  reverbLevel?: number;     // 0-1
  chorusVoices?: number;    // 0-99
  chorusLevel?: number;     // 0-10
  chorusSpeed?: number;     // 0.1-5
  chorusDepth?: number;     // 0-21
  chorusType?: number;      // 0=sine, 1=triangle
  gain?: number;            // 0-10
  polyphony?: number;       // 1-256
  program?: number;         // 0-127
  bank?: number;            // 0-128
  tuning?: number;          // 430-450 Hz
  transpose?: number;       // -24 to 24
}

export const DEFAULT_FLUIDSYNTH: FluidSynthConfig = {
  reverbRoomSize: 0.2,
  reverbDamping: 0.0,
  reverbWidth: 0.5,
  reverbLevel: 0.9,
  chorusVoices: 3,
  chorusLevel: 2.0,
  chorusSpeed: 0.3,
  chorusDepth: 8.0,
  chorusType: 0,
  gain: 0.4,
  polyphony: 64,
  program: 0,
  bank: 0,
  tuning: 440,
  transpose: 0,
};

export const FLUIDSYNTH_PRESETS: Record<string, FluidSynthConfig> = {
  'Grand Piano': {
    ...DEFAULT_FLUIDSYNTH,
    program: 0, bank: 0,
    reverbRoomSize: 0.6, reverbLevel: 0.7,
  },
  'Electric Piano': {
    ...DEFAULT_FLUIDSYNTH,
    program: 4, bank: 0,
    chorusVoices: 5, chorusLevel: 3.0, chorusDepth: 10,
  },
  'Strings': {
    ...DEFAULT_FLUIDSYNTH,
    program: 48, bank: 0,
    reverbRoomSize: 0.8, reverbLevel: 0.9,
    chorusVoices: 6, chorusDepth: 12,
  },
  'Choir': {
    ...DEFAULT_FLUIDSYNTH,
    program: 52, bank: 0,
    reverbRoomSize: 0.9, reverbLevel: 0.8,
    chorusVoices: 8, chorusLevel: 4.0,
  },
  'Organ': {
    ...DEFAULT_FLUIDSYNTH,
    program: 19, bank: 0,
    reverbRoomSize: 0.7, reverbLevel: 0.5,
    chorusVoices: 4, chorusSpeed: 0.5,
  },
  'Acoustic Guitar': {
    ...DEFAULT_FLUIDSYNTH,
    program: 25, bank: 0,
    reverbRoomSize: 0.4, reverbLevel: 0.5, reverbDamping: 0.4,
    chorusVoices: 2, chorusLevel: 1.5, chorusDepth: 4,
  },
  'Brass Ensemble': {
    ...DEFAULT_FLUIDSYNTH,
    program: 61, bank: 0,
    reverbRoomSize: 0.7, reverbLevel: 0.6,
    chorusVoices: 3, chorusLevel: 2.0, chorusDepth: 6,
  },
  'Alto Sax': {
    ...DEFAULT_FLUIDSYNTH,
    program: 65, bank: 0,
    reverbRoomSize: 0.5, reverbLevel: 0.55, reverbDamping: 0.3,
    chorusVoices: 2, chorusLevel: 1.0, chorusDepth: 3,
  },
  'Acoustic Bass': {
    ...DEFAULT_FLUIDSYNTH,
    program: 32, bank: 0,
    reverbRoomSize: 0.3, reverbLevel: 0.35,
    chorusVoices: 0, chorusLevel: 0,
  },
  'Flute': {
    ...DEFAULT_FLUIDSYNTH,
    program: 73, bank: 0,
    reverbRoomSize: 0.55, reverbLevel: 0.6, reverbDamping: 0.25,
    chorusVoices: 3, chorusLevel: 2.0, chorusDepth: 5, chorusSpeed: 0.4,
  },
};

const CONFIG_KEYS: (keyof FluidSynthConfig)[] = [
  'reverbRoomSize', 'reverbDamping', 'reverbWidth', 'reverbLevel',
  'chorusVoices', 'chorusLevel', 'chorusSpeed', 'chorusDepth', 'chorusType',
  'gain', 'polyphony',
  'program', 'bank',
  'tuning', 'transpose',
];

export class FluidSynthSynthEngine implements DevilboxSynth {
  readonly name = 'FluidSynthSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: FluidSynthConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<FluidSynthConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_FLUIDSYNTH, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!FluidSynthSynthEngine.isWorkletLoaded) {
        if (!FluidSynthSynthEngine.workletLoadPromise) {
          FluidSynthSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}fluidsynth/FluidSynth.worklet.js`
          );
        }
        await FluidSynthSynthEngine.workletLoadPromise;
        FluidSynthSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}fluidsynth/FluidSynth.wasm`),
        fetch(`${baseUrl}fluidsynth/FluidSynth.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load FluidSynth.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load FluidSynth.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}fluidsynth/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      this._worklet = new AudioWorkletNode(rawContext, 'fluidsynth-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          this.sendConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', channel: 0, key: note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('FluidSynth error:', event.data.message || event.data.error);
        } else if (event.data.type === 'sf2Loaded') {
          console.log('FluidSynth: SF2 loaded, id:', event.data.id);
        }
      };

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

    } catch (error) {
      console.error('Failed to initialize FluidSynth:', error);
      throw error;
    }
  }

  private sendConfig(config: FluidSynthConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const value = config[CONFIG_KEYS[i]];
      if (value !== undefined) {
        this._worklet.port.postMessage({ type: 'setParam', index: i, value });
      }
    }
  }

  loadSF2(data: ArrayBuffer | Uint8Array, filename?: string): void {
    if (!this._worklet) {
      console.warn('FluidSynth: worklet not ready, cannot load SF2');
      return;
    }
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const buf = u8.buffer.byteLength === u8.length ? u8.buffer : u8.slice().buffer;
    this._worklet.port.postMessage(
      { type: 'loadSF2', data: new Uint8Array(buf), filename: filename || 'soundfont.sf2' },
      [buf]
    );
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const key = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.round((velocity ?? 0.8) * 127);
    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note: key, velocity: vel });
      return this;
    }
    this._worklet.port.postMessage({ type: 'noteOn', channel: 0, key, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) return this;
    if (frequency !== undefined) {
      const key = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', channel: 0, key });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const index = CONFIG_KEYS.indexOf(param as keyof FluidSynthConfig);
    if (index >= 0) {
      (this.config as Record<string, number>)[param] = value;
      if (this._worklet && this.isInitialized) {
        this._worklet.port.postMessage({ type: 'setParam', index, value });
      }
    }
  }

  get(param: string): number | undefined {
    return (this.config as Record<string, number | undefined>)[param];
  }

  setPreset(name: string): void {
    const preset = FLUIDSYNTH_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.sendConfig(this.config);
    }
  }

  dispose(): void {
    if (this._worklet) {
      this._worklet.port.postMessage({ type: 'dispose' });
      this._worklet.disconnect();
      this._worklet = null;
    }
    this.isInitialized = false;
  }
}

export class FluidSynthSynthImpl extends FluidSynthSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<FluidSynthConfig>): void {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number') {
        this.set(key, value);
      }
    }
  }
}
