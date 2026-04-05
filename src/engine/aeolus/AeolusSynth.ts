/**
 * AeolusSynth.ts - Aeolus pipe organ WASM engine for DEViLBOX
 *
 * Features:
 * - 3 divisions: Great (8 stops), Swell (8 stops), Pedal (5 stops)
 * - Tremulant (speed, depth, on/off)
 * - Reverb (amount, size)
 * - Wind pressure, tuning, expression pedals
 * - 4 couplers (swell-great, great-pedal, swell-pedal, swell-octave)
 * - ~35 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const AeolusParam = {
  GREAT_STOP_0: 0, GREAT_STOP_1: 1, GREAT_STOP_2: 2, GREAT_STOP_3: 3,
  GREAT_STOP_4: 4, GREAT_STOP_5: 5, GREAT_STOP_6: 6, GREAT_STOP_7: 7,
  SWELL_STOP_0: 8, SWELL_STOP_1: 9, SWELL_STOP_2: 10, SWELL_STOP_3: 11,
  SWELL_STOP_4: 12, SWELL_STOP_5: 13, SWELL_STOP_6: 14, SWELL_STOP_7: 15,
  PEDAL_STOP_0: 16, PEDAL_STOP_1: 17, PEDAL_STOP_2: 18, PEDAL_STOP_3: 19, PEDAL_STOP_4: 20,
  TREMULANT_SPEED: 21, TREMULANT_DEPTH: 22, TREMULANT_ON: 23,
  REVERB_AMOUNT: 24, REVERB_SIZE: 25,
  VOLUME: 26, TUNING: 27, WIND_PRESSURE: 28,
  SWELL_EXPRESSION: 29, GREAT_EXPRESSION: 30,
  COUPLER_SWELL_GREAT: 31, COUPLER_GREAT_PEDAL: 32,
  COUPLER_SWELL_PEDAL: 33, COUPLER_SWELL_OCTAVE: 34,
} as const;

export const AEOLUS_PARAM_NAMES: Record<number, string> = {
  0: 'Great Principal 8', 1: 'Great Principal 4', 2: 'Great Octave 2', 3: 'Great Mixture IV',
  4: 'Great Flute 8', 5: 'Great Flute 4', 6: 'Great Trumpet 8', 7: 'Great Cornet V',
  8: 'Swell Gedeckt 8', 9: 'Swell Salicional 8', 10: 'Swell Voix Celeste 8', 11: 'Swell Principal 4',
  12: 'Swell Flute 4', 13: 'Swell Nazard 2 2/3', 14: 'Swell Oboe 8', 15: 'Swell Tremulant',
  16: 'Pedal Bourdon 16', 17: 'Pedal Principal 8', 18: 'Pedal Flute 8', 19: 'Pedal Octave 4', 20: 'Pedal Trombone 16',
  21: 'Tremulant Speed', 22: 'Tremulant Depth', 23: 'Tremulant On',
  24: 'Reverb Amount', 25: 'Reverb Size',
  26: 'Volume', 27: 'Tuning', 28: 'Wind Pressure',
  29: 'Swell Expression', 30: 'Great Expression',
  31: 'Swell to Great', 32: 'Great to Pedal', 33: 'Swell to Pedal', 34: 'Swell 4 to Great',
};

export interface AeolusConfig {
  greatStop0?: number; greatStop1?: number; greatStop2?: number; greatStop3?: number;
  greatStop4?: number; greatStop5?: number; greatStop6?: number; greatStop7?: number;
  swellStop0?: number; swellStop1?: number; swellStop2?: number; swellStop3?: number;
  swellStop4?: number; swellStop5?: number; swellStop6?: number; swellStop7?: number;
  pedalStop0?: number; pedalStop1?: number; pedalStop2?: number; pedalStop3?: number; pedalStop4?: number;
  tremulantSpeed?: number;
  tremulantDepth?: number;
  tremulantOn?: number;
  reverbAmount?: number;
  reverbSize?: number;
  volume?: number;
  tuning?: number;
  windPressure?: number;
  swellExpression?: number;
  greatExpression?: number;
  couplerSwellGreat?: number;
  couplerGreatPedal?: number;
  couplerSwellPedal?: number;
  couplerSwellOctave?: number;
}

export const DEFAULT_AEOLUS: AeolusConfig = {
  greatStop0: 1, greatStop1: 0, greatStop2: 0, greatStop3: 0,
  greatStop4: 1, greatStop5: 0, greatStop6: 0, greatStop7: 0,
  swellStop0: 1, swellStop1: 1, swellStop2: 0, swellStop3: 0,
  swellStop4: 0, swellStop5: 0, swellStop6: 0, swellStop7: 0,
  pedalStop0: 1, pedalStop1: 0, pedalStop2: 0, pedalStop3: 0, pedalStop4: 0,
  tremulantSpeed: 0.5, tremulantDepth: 0.5, tremulantOn: 0,
  reverbAmount: 0.3, reverbSize: 0.5,
  volume: 0.8, tuning: 440, windPressure: 0.5,
  swellExpression: 0.7, greatExpression: 1.0,
  couplerSwellGreat: 0, couplerGreatPedal: 0, couplerSwellPedal: 0, couplerSwellOctave: 0,
};

export const AEOLUS_PRESETS: Record<string, AeolusConfig> = {
  'Full Organ': {
    ...DEFAULT_AEOLUS,
    greatStop0: 1, greatStop1: 1, greatStop2: 1, greatStop3: 1,
    greatStop4: 1, greatStop5: 1, greatStop6: 1, greatStop7: 1,
    swellStop0: 1, swellStop1: 1, swellStop2: 1, swellStop3: 1,
    swellStop4: 1, swellStop5: 1, swellStop6: 1, swellStop7: 1,
    pedalStop0: 1, pedalStop1: 1, pedalStop2: 1, pedalStop3: 1, pedalStop4: 1,
    tremulantOn: 0, couplerSwellGreat: 1, couplerGreatPedal: 1,
    swellExpression: 1.0, greatExpression: 1.0,
  },
  'Soft Registration': {
    ...DEFAULT_AEOLUS,
    greatStop0: 1, greatStop1: 0, greatStop2: 0, greatStop3: 0,
    greatStop4: 1, greatStop5: 0, greatStop6: 0, greatStop7: 0,
    swellStop0: 1, swellStop1: 0, swellStop2: 0, swellStop3: 0,
    swellStop4: 0, swellStop5: 0, swellStop6: 0, swellStop7: 0,
    pedalStop0: 1, pedalStop1: 0, pedalStop2: 0, pedalStop3: 0, pedalStop4: 0,
    swellExpression: 0.3, greatExpression: 0.5,
  },
  'Baroque': {
    ...DEFAULT_AEOLUS,
    greatStop0: 1, greatStop1: 1, greatStop2: 1, greatStop3: 1,
    greatStop4: 0, greatStop5: 0, greatStop6: 0, greatStop7: 0,
    swellStop0: 0, swellStop1: 0, swellStop2: 0, swellStop3: 1,
    swellStop4: 1, swellStop5: 1, swellStop6: 0, swellStop7: 0,
    pedalStop0: 1, pedalStop1: 1, pedalStop2: 0, pedalStop3: 1, pedalStop4: 0,
    tremulantOn: 0, couplerSwellGreat: 1,
  },
  'Romantic': {
    ...DEFAULT_AEOLUS,
    greatStop0: 1, greatStop1: 0, greatStop2: 0, greatStop3: 0,
    greatStop4: 1, greatStop5: 1, greatStop6: 0, greatStop7: 0,
    swellStop0: 1, swellStop1: 1, swellStop2: 1, swellStop3: 0,
    swellStop4: 0, swellStop5: 0, swellStop6: 1, swellStop7: 0,
    tremulantOn: 1, tremulantSpeed: 0.6, tremulantDepth: 0.4,
    reverbAmount: 0.5, reverbSize: 0.7,
    couplerSwellGreat: 1,
  },
  'Pedal Solo': {
    ...DEFAULT_AEOLUS,
    greatStop0: 0, greatStop1: 0, greatStop2: 0, greatStop3: 0,
    greatStop4: 0, greatStop5: 0, greatStop6: 0, greatStop7: 0,
    swellStop0: 0, swellStop1: 0, swellStop2: 0, swellStop3: 0,
    swellStop4: 0, swellStop5: 0, swellStop6: 0, swellStop7: 0,
    pedalStop0: 1, pedalStop1: 1, pedalStop2: 1, pedalStop3: 0, pedalStop4: 1,
    volume: 0.9, reverbAmount: 0.4,
  },
  'Flute Choir': {
    ...DEFAULT_AEOLUS,
    // Great: Flute 8' + Flute 4'
    greatStop0: 0, greatStop1: 0, greatStop2: 0, greatStop3: 0,
    greatStop4: 1, greatStop5: 1, greatStop6: 0, greatStop7: 0,
    // Swell: Gedeckt 8' + Flute 4' + Nazard 2⅔' + tremulant
    swellStop0: 1, swellStop1: 0, swellStop2: 0, swellStop3: 0,
    swellStop4: 1, swellStop5: 1, swellStop6: 0, swellStop7: 1,
    pedalStop0: 1, pedalStop1: 0, pedalStop2: 1, pedalStop3: 0, pedalStop4: 0,
    tremulantOn: 1, tremulantSpeed: 0.5, tremulantDepth: 0.35,
    couplerSwellGreat: 1, couplerGreatPedal: 1,
    reverbAmount: 0.4, reverbSize: 0.55,
    swellExpression: 0.7, greatExpression: 0.7,
  },
  'Reed Ensemble': {
    ...DEFAULT_AEOLUS,
    // Great: Principal 8' + Trumpet 8'
    greatStop0: 1, greatStop1: 0, greatStop2: 0, greatStop3: 0,
    greatStop4: 0, greatStop5: 0, greatStop6: 1, greatStop7: 0,
    // Swell: Salicional 8' + Oboe 8'
    swellStop0: 0, swellStop1: 1, swellStop2: 0, swellStop3: 0,
    swellStop4: 0, swellStop5: 0, swellStop6: 1, swellStop7: 0,
    // Pedal: Bourdon 16' + Principal 8' + Trombone 16'
    pedalStop0: 1, pedalStop1: 1, pedalStop2: 0, pedalStop3: 0, pedalStop4: 1,
    couplerSwellGreat: 1, couplerGreatPedal: 1,
    swellExpression: 0.85, greatExpression: 0.9,
    reverbAmount: 0.35, reverbSize: 0.5,
  },
  'Principal Chorus': {
    ...DEFAULT_AEOLUS,
    // Great: Principal 8' + 4' + Octave 2' + Mixture IV
    greatStop0: 1, greatStop1: 1, greatStop2: 1, greatStop3: 1,
    greatStop4: 0, greatStop5: 0, greatStop6: 0, greatStop7: 0,
    // Swell: Principal 4' only (light support)
    swellStop0: 0, swellStop1: 0, swellStop2: 0, swellStop3: 1,
    swellStop4: 0, swellStop5: 0, swellStop6: 0, swellStop7: 0,
    // Pedal: Bourdon 16' + Principal 8' + Octave 4'
    pedalStop0: 1, pedalStop1: 1, pedalStop2: 0, pedalStop3: 1, pedalStop4: 0,
    tremulantOn: 0, couplerSwellGreat: 1, couplerGreatPedal: 1,
    swellExpression: 0.8, greatExpression: 0.9,
  },
  'Swell Solo': {
    ...DEFAULT_AEOLUS,
    // Great off — Swell plays solo through coupler
    greatStop0: 0, greatStop1: 0, greatStop2: 0, greatStop3: 0,
    greatStop4: 0, greatStop5: 0, greatStop6: 0, greatStop7: 0,
    // Swell: Salicional 8' + Voix Celeste 8' + Oboe 8' + tremulant
    swellStop0: 0, swellStop1: 1, swellStop2: 1, swellStop3: 0,
    swellStop4: 0, swellStop5: 0, swellStop6: 1, swellStop7: 1,
    pedalStop0: 1, pedalStop1: 0, pedalStop2: 1, pedalStop3: 0, pedalStop4: 0,
    tremulantOn: 1, tremulantSpeed: 0.55, tremulantDepth: 0.4,
    couplerSwellGreat: 1, couplerGreatPedal: 1,
    swellExpression: 0.6, greatExpression: 0.5,
    reverbAmount: 0.45, reverbSize: 0.65,
  },
  'Meditation': {
    ...DEFAULT_AEOLUS,
    // Great: Flute 8' only — very quiet
    greatStop0: 0, greatStop1: 0, greatStop2: 0, greatStop3: 0,
    greatStop4: 1, greatStop5: 0, greatStop6: 0, greatStop7: 0,
    // Swell: Gedeckt 8' + Voix Celeste 8' + tremulant
    swellStop0: 1, swellStop1: 0, swellStop2: 1, swellStop3: 0,
    swellStop4: 0, swellStop5: 0, swellStop6: 0, swellStop7: 1,
    pedalStop0: 1, pedalStop1: 0, pedalStop2: 0, pedalStop3: 0, pedalStop4: 0,
    tremulantOn: 1, tremulantSpeed: 0.4, tremulantDepth: 0.3,
    couplerSwellGreat: 1, couplerGreatPedal: 1,
    swellExpression: 0.35, greatExpression: 0.4,
    volume: 0.6, reverbAmount: 0.6, reverbSize: 0.8,
  },
};

const CONFIG_KEYS: (keyof AeolusConfig)[] = [
  'greatStop0', 'greatStop1', 'greatStop2', 'greatStop3',
  'greatStop4', 'greatStop5', 'greatStop6', 'greatStop7',
  'swellStop0', 'swellStop1', 'swellStop2', 'swellStop3',
  'swellStop4', 'swellStop5', 'swellStop6', 'swellStop7',
  'pedalStop0', 'pedalStop1', 'pedalStop2', 'pedalStop3', 'pedalStop4',
  'tremulantSpeed', 'tremulantDepth', 'tremulantOn',
  'reverbAmount', 'reverbSize',
  'volume', 'tuning', 'windPressure',
  'swellExpression', 'greatExpression',
  'couplerSwellGreat', 'couplerGreatPedal', 'couplerSwellPedal', 'couplerSwellOctave',
];

// Maps CONFIG_KEYS index → WASM aeolus_set_param index.
// WASM has 32 params (enum in aeolus_bridge.cpp):
//   0-13:  14 stops (Great 0-6, Swell 7-10, Pedal 11-13)
//   14-16: Expression (Great, Swell, Pedal)
//   17-19: Tremulant (speed, depth, enable)
//   20-24: Reverb (amount, delay, time, bass_time, treble_time)
//   25:    Master Volume
//   26:    Tuning
//   27:    Temperament
//   28-31: Azimuth, Stereo Width, Direct Level, Reflection Level
// CONFIG_KEYS has 34 entries; entries with no WASM equivalent are omitted.
const WASM_PARAM_INDEX: Record<number, number> = {
  // Great stops: CONFIG 0-6 → WASM stops 0-6 (CONFIG 7 = greatStop7 has no WASM stop)
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
  // Swell stops: CONFIG 8-11 → WASM stops 7-10 (CONFIG 12-15 = swellStop4-7 have no WASM stop)
  8: 7, 9: 8, 10: 9, 11: 10,
  // Pedal stops: CONFIG 16-18 → WASM stops 11-13 (CONFIG 19-20 = pedalStop3-4 have no WASM stop)
  16: 11, 17: 12, 18: 13,
  // Tremulant: CONFIG 21-23 → WASM 17-19
  21: 17, 22: 18, 23: 19,
  // Reverb: CONFIG 24 (amount) → WASM 20, CONFIG 25 (size) → WASM 22 (reverb time)
  24: 20, 25: 22,
  // Volume: CONFIG 26 → WASM 25
  26: 25,
  // Tuning: CONFIG 27 → WASM 26
  27: 26,
  // windPressure (CONFIG 28) has no WASM equivalent
  // Expression: CONFIG 29 (swellExpression) → WASM 15, CONFIG 30 (greatExpression) → WASM 14
  29: 15, 30: 14,
  // Couplers (CONFIG 31-34) have no WASM equivalent
};

export class AeolusSynthEngine implements DevilboxSynth {
  readonly name = 'AeolusSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: AeolusConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<AeolusConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_AEOLUS, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!AeolusSynthEngine.isWorkletLoaded) {
        if (!AeolusSynthEngine.workletLoadPromise) {
          AeolusSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}aeolus/Aeolus.worklet.js`
          );
        }
        await AeolusSynthEngine.workletLoadPromise;
        AeolusSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}aeolus/Aeolus.wasm`),
        fetch(`${baseUrl}aeolus/Aeolus.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load Aeolus.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load Aeolus.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}aeolus/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

      this._worklet = new AudioWorkletNode(rawContext, 'aeolus-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          this.sendConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('Aeolus error:', event.data.error);
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
      console.error('Failed to initialize Aeolus:', error);
      throw error;
    }
  }

  private sendConfig(config: AeolusConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const key = CONFIG_KEYS[i];
      const value = config[key];
      const wasmIdx = WASM_PARAM_INDEX[i];
      if (value !== undefined && wasmIdx !== undefined && value !== this.config[key]) {
        this.config[key] = value;
        this._worklet.port.postMessage({ type: 'setParam', index: wasmIdx, value });
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
    if (!this._worklet || !this.isInitialized) {
      // Clear pending notes to prevent stuck notes when noteOff arrives before init
      if (frequency !== undefined) {
        const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
        this.pendingNotes = this.pendingNotes.filter(p => p.note !== note);
      } else {
        this.pendingNotes = [];
      }
      return this;
    }
    if (frequency !== undefined) {
      const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', note });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const configIdx = CONFIG_KEYS.indexOf(param as keyof AeolusConfig);
    if (configIdx >= 0) {
      (this.config as Record<string, number>)[param] = value;
      const wasmIdx = WASM_PARAM_INDEX[configIdx];
      if (wasmIdx !== undefined && this._worklet && this.isInitialized) {
        this._worklet.port.postMessage({ type: 'setParam', index: wasmIdx, value });
      }
    }
  }

  get(param: string): number | undefined {
    return (this.config as Record<string, number | undefined>)[param];
  }

  setPreset(name: string): void {
    const preset = AEOLUS_PRESETS[name];
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

export class AeolusSynthImpl extends AeolusSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<AeolusConfig>): void {
    const prev = (this as any).config as Record<string, number | undefined>;
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number' && value !== prev[key]) {
        this.set(key, value);
      }
    }
  }
}
