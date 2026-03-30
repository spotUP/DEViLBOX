/**
 * MdaDX10Synth.ts - MDA DX10 (2-operator FM) WASM synthesizer for DEViLBOX
 *
 * Features:
 * - 8-voice polyphonic 2-operator FM synth
 * - Carrier + modulator with independent envelopes
 * - Configurable modulator ratio and depth
 * - LFO vibrato, velocity sensitivity
 * - 32 factory presets (electric pianos, bass, leads, percussion)
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

/** Parameter indices matching the C++ mdaDX10 NPARAMS=16 */
export const DX10Param = {
  ATTACK: 0,
  DECAY: 1,
  RELEASE: 2,
  COARSE: 3,
  FINE: 4,
  MOD_INIT: 5,
  MOD_DEC: 6,
  MOD_SUS: 7,
  MOD_REL: 8,
  MOD_VEL: 9,
  VIBRATO: 10,
  OCTAVE: 11,
  FINE_TUNE: 12,
  WAVEFORM: 13,
  MOD_THRU: 14,
  LFO_RATE: 15,
} as const;

export const DX10_PARAM_NAMES: Record<number, string> = {
  0: 'Attack',
  1: 'Decay',
  2: 'Release',
  3: 'Mod Coarse',
  4: 'Mod Fine',
  5: 'Mod Init',
  6: 'Mod Decay',
  7: 'Mod Sustain',
  8: 'Mod Release',
  9: 'Mod Velocity',
  10: 'Vibrato',
  11: 'Octave',
  12: 'Fine Tune',
  13: 'Waveform',
  14: 'Mod Thru',
  15: 'LFO Rate',
};

/** All parameters are 0.0-1.0 normalized */
export interface MdaDX10Config {
  attack?: number;
  decay?: number;
  release?: number;
  coarse?: number;
  fine?: number;
  modInit?: number;
  modDec?: number;
  modSus?: number;
  modRel?: number;
  modVel?: number;
  vibrato?: number;
  octave?: number;
  fineTune?: number;
  waveform?: number;
  modThru?: number;
  lfoRate?: number;
}

export const DEFAULT_MDA_DX10: MdaDX10Config = {
  attack: 0.000,
  decay: 0.650,
  release: 0.441,
  coarse: 0.842,
  fine: 0.329,
  modInit: 0.230,
  modDec: 0.800,
  modSus: 0.050,
  modRel: 0.800,
  modVel: 0.900,
  vibrato: 0.000,
  octave: 0.500,
  fineTune: 0.500,
  waveform: 0.447,
  modThru: 0.000,
  lfoRate: 0.414,
};

export const DX10_PRESETS: Record<string, MdaDX10Config> = {
  // All 32 original MDA DX10 factory programs (from Paul Kellett)
  //                          Att    Dec    Rel  | CoarseRatio FineR  ModInit ModDec ModSus ModRel ModVel | Vib    Oct    Fine   Rich   Thru   LFO
  'Bright E.Piano':  { attack: 0.000, decay: 0.650, release: 0.441, coarse: 0.842, fine: 0.329, modInit: 0.230, modDec: 0.800, modSus: 0.050, modRel: 0.800, modVel: 0.900, vibrato: 0.000, octave: 0.500, fineTune: 0.500, waveform: 0.447, modThru: 0.000, lfoRate: 0.414 },
  'Jazz E.Piano':    { attack: 0.000, decay: 0.500, release: 0.100, coarse: 0.671, fine: 0.000, modInit: 0.441, modDec: 0.336, modSus: 0.243, modRel: 0.800, modVel: 0.500, vibrato: 0.000, octave: 0.500, fineTune: 0.500, waveform: 0.178, modThru: 0.000, lfoRate: 0.500 },
  'E.Piano Pad':     { attack: 0.000, decay: 0.700, release: 0.400, coarse: 0.230, fine: 0.184, modInit: 0.270, modDec: 0.474, modSus: 0.224, modRel: 0.800, modVel: 0.974, vibrato: 0.250, octave: 0.500, fineTune: 0.500, waveform: 0.428, modThru: 0.836, lfoRate: 0.500 },
  'Fuzzy E.Piano':   { attack: 0.000, decay: 0.700, release: 0.400, coarse: 0.320, fine: 0.217, modInit: 0.599, modDec: 0.670, modSus: 0.309, modRel: 0.800, modVel: 0.500, vibrato: 0.263, octave: 0.507, fineTune: 0.500, waveform: 0.276, modThru: 0.638, lfoRate: 0.526 },
  'Soft Chimes':     { attack: 0.400, decay: 0.600, release: 0.650, coarse: 0.760, fine: 0.000, modInit: 0.390, modDec: 0.250, modSus: 0.160, modRel: 0.900, modVel: 0.500, vibrato: 0.362, octave: 0.500, fineTune: 0.500, waveform: 0.401, modThru: 0.296, lfoRate: 0.493 },
  'Harpsichord':     { attack: 0.000, decay: 0.342, release: 0.000, coarse: 0.280, fine: 0.000, modInit: 0.880, modDec: 0.100, modSus: 0.408, modRel: 0.740, modVel: 0.000, vibrato: 0.000, octave: 0.600, fineTune: 0.500, waveform: 0.842, modThru: 0.651, lfoRate: 0.500 },
  'Funk Clav':       { attack: 0.000, decay: 0.400, release: 0.100, coarse: 0.360, fine: 0.000, modInit: 0.875, modDec: 0.160, modSus: 0.592, modRel: 0.800, modVel: 0.500, vibrato: 0.000, octave: 0.500, fineTune: 0.500, waveform: 0.303, modThru: 0.868, lfoRate: 0.500 },
  'Sitar':           { attack: 0.000, decay: 0.500, release: 0.704, coarse: 0.230, fine: 0.000, modInit: 0.151, modDec: 0.750, modSus: 0.493, modRel: 0.770, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.421, modThru: 0.632, lfoRate: 0.500 },
  'Chiff Organ':     { attack: 0.600, decay: 0.990, release: 0.400, coarse: 0.320, fine: 0.283, modInit: 0.570, modDec: 0.300, modSus: 0.050, modRel: 0.240, modVel: 0.500, vibrato: 0.138, octave: 0.500, fineTune: 0.500, waveform: 0.283, modThru: 0.822, lfoRate: 0.500 },
  'Tinkle':          { attack: 0.000, decay: 0.500, release: 0.650, coarse: 0.368, fine: 0.651, modInit: 0.395, modDec: 0.550, modSus: 0.257, modRel: 0.900, modVel: 0.500, vibrato: 0.300, octave: 0.800, fineTune: 0.500, waveform: 0.000, modThru: 0.414, lfoRate: 0.500 },
  'Space Pad':       { attack: 0.000, decay: 0.700, release: 0.520, coarse: 0.230, fine: 0.197, modInit: 0.520, modDec: 0.720, modSus: 0.280, modRel: 0.730, modVel: 0.500, vibrato: 0.250, octave: 0.500, fineTune: 0.500, waveform: 0.336, modThru: 0.428, lfoRate: 0.500 },
  'Koto':            { attack: 0.000, decay: 0.240, release: 0.000, coarse: 0.390, fine: 0.000, modInit: 0.880, modDec: 0.100, modSus: 0.600, modRel: 0.740, modVel: 0.500, vibrato: 0.000, octave: 0.500, fineTune: 0.500, waveform: 0.526, modThru: 0.480, lfoRate: 0.500 },
  'Harp':            { attack: 0.000, decay: 0.500, release: 0.700, coarse: 0.160, fine: 0.000, modInit: 0.158, modDec: 0.349, modSus: 0.000, modRel: 0.280, modVel: 0.900, vibrato: 0.000, octave: 0.618, fineTune: 0.500, waveform: 0.401, modThru: 0.000, lfoRate: 0.500 },
  'Jazz Guitar':     { attack: 0.000, decay: 0.500, release: 0.100, coarse: 0.390, fine: 0.000, modInit: 0.490, modDec: 0.250, modSus: 0.250, modRel: 0.800, modVel: 0.500, vibrato: 0.000, octave: 0.500, fineTune: 0.500, waveform: 0.263, modThru: 0.145, lfoRate: 0.500 },
  'Steel Drum':      { attack: 0.000, decay: 0.300, release: 0.507, coarse: 0.480, fine: 0.730, modInit: 0.000, modDec: 0.100, modSus: 0.303, modRel: 0.730, modVel: 1.000, vibrato: 0.000, octave: 0.600, fineTune: 0.500, waveform: 0.579, modThru: 0.000, lfoRate: 0.500 },
  'Log Drum':        { attack: 0.000, decay: 0.300, release: 0.500, coarse: 0.320, fine: 0.000, modInit: 0.467, modDec: 0.079, modSus: 0.158, modRel: 0.500, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.151, modThru: 0.020, lfoRate: 0.500 },
  'Trumpet':         { attack: 0.000, decay: 0.990, release: 0.100, coarse: 0.230, fine: 0.000, modInit: 0.000, modDec: 0.200, modSus: 0.450, modRel: 0.800, modVel: 0.000, vibrato: 0.112, octave: 0.600, fineTune: 0.500, waveform: 0.711, modThru: 0.000, lfoRate: 0.401 },
  'Horn':            { attack: 0.280, decay: 0.990, release: 0.280, coarse: 0.230, fine: 0.000, modInit: 0.180, modDec: 0.400, modSus: 0.300, modRel: 0.800, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.217, modThru: 0.480, lfoRate: 0.500 },
  'Reed 1':          { attack: 0.220, decay: 0.990, release: 0.250, coarse: 0.170, fine: 0.000, modInit: 0.240, modDec: 0.310, modSus: 0.257, modRel: 0.900, modVel: 0.757, vibrato: 0.000, octave: 0.500, fineTune: 0.500, waveform: 0.697, modThru: 0.803, lfoRate: 0.500 },
  'Reed 2':          { attack: 0.220, decay: 0.990, release: 0.250, coarse: 0.450, fine: 0.070, modInit: 0.240, modDec: 0.310, modSus: 0.360, modRel: 0.900, modVel: 0.500, vibrato: 0.211, octave: 0.500, fineTune: 0.500, waveform: 0.184, modThru: 0.000, lfoRate: 0.414 },
  'Violin':          { attack: 0.697, decay: 0.990, release: 0.421, coarse: 0.230, fine: 0.138, modInit: 0.750, modDec: 0.390, modSus: 0.513, modRel: 0.800, modVel: 0.316, vibrato: 0.467, octave: 0.678, fineTune: 0.500, waveform: 0.743, modThru: 0.757, lfoRate: 0.487 },
  'Chunky Bass':     { attack: 0.000, decay: 0.400, release: 0.000, coarse: 0.280, fine: 0.125, modInit: 0.474, modDec: 0.250, modSus: 0.100, modRel: 0.500, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.579, modThru: 0.592, lfoRate: 0.500 },
  'E.Bass':          { attack: 0.230, decay: 0.500, release: 0.100, coarse: 0.395, fine: 0.000, modInit: 0.388, modDec: 0.092, modSus: 0.250, modRel: 0.150, modVel: 0.500, vibrato: 0.200, octave: 0.200, fineTune: 0.500, waveform: 0.178, modThru: 0.822, lfoRate: 0.500 },
  'Clunk Bass':      { attack: 0.000, decay: 0.600, release: 0.400, coarse: 0.230, fine: 0.000, modInit: 0.450, modDec: 0.320, modSus: 0.050, modRel: 0.900, modVel: 0.500, vibrato: 0.000, octave: 0.200, fineTune: 0.500, waveform: 0.520, modThru: 0.105, lfoRate: 0.500 },
  'Thick Bass':      { attack: 0.000, decay: 0.600, release: 0.400, coarse: 0.170, fine: 0.145, modInit: 0.290, modDec: 0.350, modSus: 0.100, modRel: 0.900, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.441, modThru: 0.309, lfoRate: 0.500 },
  'Sine Bass':       { attack: 0.000, decay: 0.600, release: 0.490, coarse: 0.170, fine: 0.151, modInit: 0.099, modDec: 0.400, modSus: 0.000, modRel: 0.900, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.118, modThru: 0.013, lfoRate: 0.500 },
  'Square Bass':     { attack: 0.000, decay: 0.600, release: 0.100, coarse: 0.320, fine: 0.000, modInit: 0.350, modDec: 0.670, modSus: 0.100, modRel: 0.150, modVel: 0.500, vibrato: 0.000, octave: 0.200, fineTune: 0.500, waveform: 0.303, modThru: 0.730, lfoRate: 0.500 },
  'Upright Bass 1':  { attack: 0.300, decay: 0.500, release: 0.400, coarse: 0.280, fine: 0.000, modInit: 0.180, modDec: 0.540, modSus: 0.000, modRel: 0.700, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.296, modThru: 0.033, lfoRate: 0.500 },
  'Upright Bass 2':  { attack: 0.300, decay: 0.500, release: 0.400, coarse: 0.360, fine: 0.000, modInit: 0.461, modDec: 0.070, modSus: 0.070, modRel: 0.700, modVel: 0.500, vibrato: 0.000, octave: 0.400, fineTune: 0.500, waveform: 0.546, modThru: 0.467, lfoRate: 0.500 },
  'Harmonics':       { attack: 0.000, decay: 0.500, release: 0.500, coarse: 0.280, fine: 0.000, modInit: 0.330, modDec: 0.200, modSus: 0.000, modRel: 0.700, modVel: 0.500, vibrato: 0.000, octave: 0.500, fineTune: 0.500, waveform: 0.151, modThru: 0.079, lfoRate: 0.500 },
  'Scratch':         { attack: 0.000, decay: 0.500, release: 0.000, coarse: 0.000, fine: 0.240, modInit: 0.580, modDec: 0.630, modSus: 0.000, modRel: 0.000, modVel: 0.500, vibrato: 0.000, octave: 0.600, fineTune: 0.500, waveform: 0.816, modThru: 0.243, lfoRate: 0.500 },
  'Syn Tom':         { attack: 0.000, decay: 0.355, release: 0.350, coarse: 0.000, fine: 0.105, modInit: 0.000, modDec: 0.000, modSus: 0.200, modRel: 0.500, modVel: 0.500, vibrato: 0.000, octave: 0.645, fineTune: 0.500, waveform: 1.000, modThru: 0.296, lfoRate: 0.500 },
};

const CONFIG_KEYS: (keyof MdaDX10Config)[] = [
  'attack', 'decay', 'release', 'coarse', 'fine',
  'modInit', 'modDec', 'modSus', 'modRel', 'modVel',
  'vibrato', 'octave', 'fineTune', 'waveform', 'modThru', 'lfoRate',
];

export class MdaDX10Synth implements DevilboxSynth {
  readonly name = 'MdaDX10Synth';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: MdaDX10Config;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  private _initPromise: Promise<void>;

  constructor(config: Partial<MdaDX10Config> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_MDA_DX10, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!MdaDX10Synth.isWorkletLoaded) {
        if (!MdaDX10Synth.workletLoadPromise) {
          MdaDX10Synth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}mda-dx10/MdaDX10.worklet.js`
          );
        }
        await MdaDX10Synth.workletLoadPromise;
        MdaDX10Synth.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}mda-dx10/MdaDX10.wasm`),
        fetch(`${baseUrl}mda-dx10/MdaDX10.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load MdaDX10.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load MdaDX10.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}mda-dx10/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      this._worklet = new AudioWorkletNode(rawContext, 'mda-dx10-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          console.log('[MdaDX10] WASM ready, pending notes:', this.pendingNotes.length);
          this.isInitialized = true;
          this.applyConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('MdaDX10 error:', event.data.error);
        }
      };

      this._worklet.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode,
        sampleRate: rawContext.sampleRate,
      });

      this._worklet.connect(this.output);

      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize MdaDX10Synth:', error);
      throw error;
    }
  }

  private applyConfig(config: MdaDX10Config): void {
    if (!this._worklet || !this.isInitialized) return;
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const value = config[CONFIG_KEYS[i]];
      if (value !== undefined) {
        this._worklet.port.postMessage({ type: 'setParam', index: i, value });
      }
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.round((velocity ?? 0.8) * 127);

    console.log('[MdaDX10] triggerAttack note:', note, 'vel:', vel, 'initialized:', this.isInitialized);

    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }

    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) return this;

    if (frequency !== undefined) {
      const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', note });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const index = CONFIG_KEYS.indexOf(param as keyof MdaDX10Config);
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
    const preset = DX10_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.applyConfig(this.config);
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
