/**
 * MdaEPianoSynth.ts - MDA ePiano (Fender Rhodes) WASM synthesizer for DEViLBOX
 *
 * Features:
 * - 32-voice polyphonic sample-based Rhodes piano
 * - 12 multisampled velocity layers
 * - Tremolo and autopan LFO
 * - Overdrive, treble boost, muffling filter
 * - 5 factory presets (Default, Bright, Mellow, Autopan, Tremolo)
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

/** Parameter indices matching the C++ mdaEPiano NPARAMS=12 */
export const EPianoParam = {
  ENVELOPE_DECAY: 0,
  ENVELOPE_RELEASE: 1,
  HARDNESS: 2,
  TREBLE_BOOST: 3,
  MODULATION: 4,
  LFO_RATE: 5,
  VELOCITY_SENSE: 6,
  STEREO_WIDTH: 7,
  POLYPHONY: 8,
  FINE_TUNING: 9,
  RANDOM_TUNING: 10,
  OVERDRIVE: 11,
} as const;

export const EPIANO_PARAM_NAMES: Record<number, string> = {
  0: 'Envelope Decay',
  1: 'Envelope Release',
  2: 'Hardness',
  3: 'Treble Boost',
  4: 'Modulation',
  5: 'LFO Rate',
  6: 'Velocity Sense',
  7: 'Stereo Width',
  8: 'Polyphony',
  9: 'Fine Tuning',
  10: 'Random Tuning',
  11: 'Overdrive',
};

/** All parameters are 0.0-1.0 normalized */
export interface MdaEPianoConfig {
  envelopeDecay?: number;
  envelopeRelease?: number;
  hardness?: number;
  trebleBoost?: number;
  modulation?: number;
  lfoRate?: number;
  velocitySense?: number;
  stereoWidth?: number;
  polyphony?: number;
  fineTuning?: number;
  randomTuning?: number;
  overdrive?: number;
}

export const DEFAULT_MDA_EPIANO: MdaEPianoConfig = {
  envelopeDecay: 0.500,
  envelopeRelease: 0.500,
  hardness: 0.500,
  trebleBoost: 0.500,
  modulation: 0.500,
  lfoRate: 0.650,
  velocitySense: 0.250,
  stereoWidth: 0.500,
  polyphony: 1.0,
  fineTuning: 0.500,
  randomTuning: 0.146,
  overdrive: 0.000,
};

export const EPIANO_PRESETS: Record<string, MdaEPianoConfig> = {
  'Default': { ...DEFAULT_MDA_EPIANO },
  'Bright': {
    envelopeDecay: 0.500, envelopeRelease: 0.500, hardness: 1.000, trebleBoost: 0.800,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.250, stereoWidth: 0.500,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.146, overdrive: 0.500,
  },
  'Mellow': {
    envelopeDecay: 0.500, envelopeRelease: 0.500, hardness: 0.000, trebleBoost: 0.000,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.250, stereoWidth: 0.500,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.246, overdrive: 0.000,
  },
  'Autopan': {
    envelopeDecay: 0.500, envelopeRelease: 0.500, hardness: 0.500, trebleBoost: 0.500,
    modulation: 0.250, lfoRate: 0.650, velocitySense: 0.250, stereoWidth: 0.500,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.246, overdrive: 0.000,
  },
  'Tremolo': {
    envelopeDecay: 0.500, envelopeRelease: 0.500, hardness: 0.500, trebleBoost: 0.500,
    modulation: 0.750, lfoRate: 0.650, velocitySense: 0.250, stereoWidth: 0.500,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.246, overdrive: 0.000,
  },
  'Warm Rhodes': {
    envelopeDecay: 0.600, envelopeRelease: 0.550, hardness: 0.300, trebleBoost: 0.250,
    modulation: 0.500, lfoRate: 0.500, velocitySense: 0.400, stereoWidth: 0.600,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.180, overdrive: 0.100,
  },
  'Dyno Rhodes': {
    envelopeDecay: 0.450, envelopeRelease: 0.400, hardness: 0.750, trebleBoost: 0.700,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.500, stereoWidth: 0.550,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.120, overdrive: 0.250,
  },
  'Suitcase': {
    envelopeDecay: 0.650, envelopeRelease: 0.600, hardness: 0.350, trebleBoost: 0.300,
    modulation: 0.280, lfoRate: 0.400, velocitySense: 0.350, stereoWidth: 0.800,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.200, overdrive: 0.050,
  },
  'Stage Piano': {
    envelopeDecay: 0.500, envelopeRelease: 0.450, hardness: 0.600, trebleBoost: 0.550,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.600, stereoWidth: 0.500,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.100, overdrive: 0.150,
  },
  'Wurlitzer-ish': {
    envelopeDecay: 0.350, envelopeRelease: 0.300, hardness: 0.650, trebleBoost: 0.400,
    modulation: 0.700, lfoRate: 0.550, velocitySense: 0.450, stereoWidth: 0.400,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.160, overdrive: 0.350,
  },
  'Honky Tonk': {
    envelopeDecay: 0.400, envelopeRelease: 0.350, hardness: 0.800, trebleBoost: 0.600,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.300, stereoWidth: 0.700,
    polyphony: 1.0, fineTuning: 0.520, randomTuning: 0.400, overdrive: 0.200,
  },
  'Glass Keys': {
    envelopeDecay: 0.300, envelopeRelease: 0.600, hardness: 0.900, trebleBoost: 0.900,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.200, stereoWidth: 0.650,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.050, overdrive: 0.000,
  },
  'Broken Keys': {
    envelopeDecay: 0.250, envelopeRelease: 0.200, hardness: 0.850, trebleBoost: 0.350,
    modulation: 0.600, lfoRate: 0.750, velocitySense: 0.700, stereoWidth: 0.450,
    polyphony: 1.0, fineTuning: 0.480, randomTuning: 0.500, overdrive: 0.600,
  },
  'Dark Piano': {
    envelopeDecay: 0.700, envelopeRelease: 0.650, hardness: 0.100, trebleBoost: 0.050,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.500, stereoWidth: 0.500,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.200, overdrive: 0.000,
  },
  'Lo-Fi Keys': {
    envelopeDecay: 0.350, envelopeRelease: 0.300, hardness: 0.450, trebleBoost: 0.200,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.350, stereoWidth: 0.350,
    polyphony: 1.0, fineTuning: 0.490, randomTuning: 0.450, overdrive: 0.400,
  },
  'Chorus EP': {
    envelopeDecay: 0.550, envelopeRelease: 0.500, hardness: 0.450, trebleBoost: 0.450,
    modulation: 0.300, lfoRate: 0.700, velocitySense: 0.300, stereoWidth: 0.900,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.220, overdrive: 0.050,
  },
  'Soft Ballad': {
    envelopeDecay: 0.750, envelopeRelease: 0.700, hardness: 0.200, trebleBoost: 0.200,
    modulation: 0.500, lfoRate: 0.500, velocitySense: 0.550, stereoWidth: 0.600,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.180, overdrive: 0.000,
  },
  'Jazz Club': {
    envelopeDecay: 0.600, envelopeRelease: 0.550, hardness: 0.250, trebleBoost: 0.300,
    modulation: 0.260, lfoRate: 0.350, velocitySense: 0.450, stereoWidth: 0.700,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.250, overdrive: 0.080,
  },
  'Funky Clav EP': {
    envelopeDecay: 0.200, envelopeRelease: 0.150, hardness: 0.950, trebleBoost: 0.750,
    modulation: 0.500, lfoRate: 0.650, velocitySense: 0.700, stereoWidth: 0.400,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.100, overdrive: 0.450,
  },
  'Vintage Tine': {
    envelopeDecay: 0.550, envelopeRelease: 0.500, hardness: 0.550, trebleBoost: 0.400,
    modulation: 0.270, lfoRate: 0.450, velocitySense: 0.400, stereoWidth: 0.650,
    polyphony: 1.0, fineTuning: 0.500, randomTuning: 0.300, overdrive: 0.120,
  },
};

const CONFIG_KEYS: (keyof MdaEPianoConfig)[] = [
  'envelopeDecay', 'envelopeRelease', 'hardness', 'trebleBoost',
  'modulation', 'lfoRate', 'velocitySense', 'stereoWidth',
  'polyphony', 'fineTuning', 'randomTuning', 'overdrive',
];

export class MdaEPianoSynth implements DevilboxSynth {
  readonly name = 'MdaEPianoSynth';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: MdaEPianoConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  private _initPromise: Promise<void>;

  constructor(config: Partial<MdaEPianoConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_MDA_EPIANO, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module (once per session)
      if (!MdaEPianoSynth.isWorkletLoaded) {
        if (!MdaEPianoSynth.workletLoadPromise) {
          MdaEPianoSynth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}mda-epiano/MdaEPiano.worklet.js`
          );
        }
        await MdaEPianoSynth.workletLoadPromise;
        MdaEPianoSynth.isWorkletLoaded = true;
      }

      // Fetch WASM binary and JS glue in parallel
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}mda-epiano/MdaEPiano.wasm`),
        fetch(`${baseUrl}mda-epiano/MdaEPiano.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load MdaEPiano.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load MdaEPiano.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      // Preprocess JS code for AudioWorklet compatibility
      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}mda-epiano/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      // Create worklet node
      this._worklet = new AudioWorkletNode(rawContext, 'mda-epiano-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          this.applyConfig(this.config);

          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('MdaEPiano error:', event.data.error);
        }
      };

      // Send WASM binary + JS code to worklet
      this._worklet.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode,
        sampleRate: rawContext.sampleRate,
      });

      // Connect worklet to output
      this._worklet.connect(this.output);

      // Keepalive connection to force processing
      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize MdaEPianoSynth:', error);
      throw error;
    }
  }

  private applyConfig(config: MdaEPianoConfig): void {
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
    const index = CONFIG_KEYS.indexOf(param as keyof MdaEPianoConfig);
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
    const preset = EPIANO_PRESETS[name];
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
