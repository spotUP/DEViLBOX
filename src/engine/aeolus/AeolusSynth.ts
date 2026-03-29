/**
 * AeolusSynth.ts — Aeolus pipe organ WASM engine for DEViLBOX
 *
 * Features:
 * - 3 divisions: Great (7 stops), Swell (4 stops), Pedal (3 stops)
 * - 14 organ stops with authentic additive synthesis
 * - Tremulant (speed, depth, on/off)
 * - Reverb (amount, delay, decay times for bass/mid/treble)
 * - 11 historical temperaments (Pythagorean through Equal)
 * - Ambisonic spatial processing (azimuth, width, direct/reflect)
 * - 32 parameters total
 *
 * Based on Aeolus by Fons Adriaensen (GPL v3)
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

// Parameter indices matching the C bridge (aeolus_bridge.cpp)
export const AeolusParam = {
  // Stops (0-13)
  STOP_GREAT_PRINCIPAL_8: 0,
  STOP_GREAT_OCTAVE_4: 1,
  STOP_GREAT_FIFTEENTH_2: 2,
  STOP_GREAT_MIXTURE: 3,
  STOP_GREAT_FLUTE_8: 4,
  STOP_GREAT_BOURDON_16: 5,
  STOP_GREAT_TRUMPET_8: 6,
  STOP_SWELL_GEDACKT_8: 7,
  STOP_SWELL_SALICIONAL_8: 8,
  STOP_SWELL_VOIX_CELESTE: 9,
  STOP_SWELL_OBOE_8: 10,
  STOP_PEDAL_SUBBASS_16: 11,
  STOP_PEDAL_PRINCIPAL_8: 12,
  STOP_PEDAL_TROMPETE_8: 13,
  // Division expression (14-16)
  GREAT_EXPRESSION: 14,
  SWELL_EXPRESSION: 15,
  PEDAL_EXPRESSION: 16,
  // Tremulant (17-19)
  TREM_SPEED: 17,
  TREM_DEPTH: 18,
  TREM_ENABLE: 19,
  // Reverb (20-24)
  REVERB_AMOUNT: 20,
  REVERB_DELAY: 21,
  REVERB_TIME: 22,
  REVERB_BASS_TIME: 23,
  REVERB_TREBLE_TIME: 24,
  // Global (25-31)
  MASTER_VOLUME: 25,
  TUNING: 26,
  TEMPERAMENT: 27,
  AZIMUTH: 28,
  STEREO_WIDTH: 29,
  DIRECT_LEVEL: 30,
  REFLECT_LEVEL: 31,
} as const;

export const AEOLUS_PARAM_NAMES: Record<number, string> = {
  0: "Great: Principal 8'",
  1: "Great: Octave 4'",
  2: "Great: Fifteenth 2'",
  3: 'Great: Mixture III',
  4: "Great: Flute 8'",
  5: "Great: Bourdon 16'",
  6: "Great: Trumpet 8'",
  7: "Swell: Gedackt 8'",
  8: "Swell: Salicional 8'",
  9: "Swell: Voix Celeste 8'",
  10: "Swell: Oboe 8'",
  11: "Pedal: Subbass 16'",
  12: "Pedal: Principalbass 8'",
  13: "Pedal: Trompete 8'",
  14: 'Great Expression',
  15: 'Swell Expression',
  16: 'Pedal Expression',
  17: 'Tremulant Speed',
  18: 'Tremulant Depth',
  19: 'Tremulant On/Off',
  20: 'Reverb Amount',
  21: 'Reverb Delay',
  22: 'Reverb Time',
  23: 'Reverb Bass Time',
  24: 'Reverb Treble Time',
  25: 'Master Volume',
  26: 'Tuning (A4 Hz)',
  27: 'Temperament',
  28: 'Azimuth',
  29: 'Stereo Width',
  30: 'Direct Level',
  31: 'Reflection Level',
};

export interface AeolusConfig {
  // Stop on/off (0 or 1)
  greatPrincipal8?: number;
  greatOctave4?: number;
  greatFifteenth2?: number;
  greatMixture?: number;
  greatFlute8?: number;
  greatBourdon16?: number;
  greatTrumpet8?: number;
  swellGedackt8?: number;
  swellSalicional8?: number;
  swellVoixCeleste?: number;
  swellOboe8?: number;
  pedalSubbass16?: number;
  pedalPrincipal8?: number;
  pedalTrompete8?: number;
  // Division expression (0-1)
  greatExpression?: number;
  swellExpression?: number;
  pedalExpression?: number;
  // Tremulant
  tremSpeed?: number;   // 0-1 (2-8 Hz)
  tremDepth?: number;   // 0-1 (0-0.6)
  tremEnable?: number;  // 0/1
  // Reverb (0-1)
  reverbAmount?: number;
  reverbDelay?: number;
  reverbTime?: number;
  reverbBassTime?: number;
  reverbTrebleTime?: number;
  // Global
  volume?: number;       // 0-1
  tuning?: number;       // 0-1 (392-494 Hz)
  temperament?: number;  // 0-1 (11 scales)
  azimuth?: number;      // 0-1
  stereoWidth?: number;  // 0-1
  directLevel?: number;  // 0-1
  reflectLevel?: number; // 0-1
}

export const DEFAULT_AEOLUS: AeolusConfig = {
  // Default stops: Principal 8' + Subbass 16'
  greatPrincipal8: 1,
  greatOctave4: 0,
  greatFifteenth2: 0,
  greatMixture: 0,
  greatFlute8: 0,
  greatBourdon16: 0,
  greatTrumpet8: 0,
  swellGedackt8: 0,
  swellSalicional8: 0,
  swellVoixCeleste: 0,
  swellOboe8: 0,
  pedalSubbass16: 1,
  pedalPrincipal8: 0,
  pedalTrompete8: 0,
  greatExpression: 1,
  swellExpression: 1,
  pedalExpression: 1,
  tremSpeed: 0.33,
  tremDepth: 0.5,
  tremEnable: 0,
  reverbAmount: 0.32,
  reverbDelay: 0.29,
  reverbTime: 0.33,
  reverbBassTime: 0.29,
  reverbTrebleTime: 0.33,
  volume: 0.35,
  tuning: 0.47,      // ~440 Hz
  temperament: 0.5,   // Equal temperament
  azimuth: 0.5,
  stereoWidth: 0.8,
  directLevel: 0.56,
  reflectLevel: 0.25,
};

export const AEOLUS_PRESETS: Record<string, AeolusConfig> = {
  'Full Organ': {
    ...DEFAULT_AEOLUS,
    greatPrincipal8: 1, greatOctave4: 1, greatFifteenth2: 1, greatMixture: 1,
    greatFlute8: 1, greatBourdon16: 1, greatTrumpet8: 1,
    swellGedackt8: 1, swellSalicional8: 1, swellVoixCeleste: 1, swellOboe8: 1,
    pedalSubbass16: 1, pedalPrincipal8: 1, pedalTrompete8: 1,
    tremEnable: 0,
  },
  'Soft Registration': {
    ...DEFAULT_AEOLUS,
    greatPrincipal8: 1, greatFlute8: 1,
    swellGedackt8: 1,
    pedalSubbass16: 1,
    greatExpression: 0.5, swellExpression: 0.3,
  },
  'Baroque': {
    ...DEFAULT_AEOLUS,
    greatPrincipal8: 1, greatOctave4: 1, greatFifteenth2: 1, greatMixture: 1,
    pedalSubbass16: 1, pedalPrincipal8: 1,
    tremEnable: 0,
    temperament: 0.1,  // Pythagorean
  },
  'Romantic': {
    ...DEFAULT_AEOLUS,
    greatPrincipal8: 1, greatFlute8: 1, greatBourdon16: 1,
    swellSalicional8: 1, swellVoixCeleste: 1, swellOboe8: 1,
    pedalSubbass16: 1,
    tremEnable: 1, tremSpeed: 0.5, tremDepth: 0.4,
    reverbAmount: 0.5, reverbTime: 0.6,
  },
  'Reed Chorus': {
    ...DEFAULT_AEOLUS,
    greatTrumpet8: 1, greatPrincipal8: 1, greatOctave4: 1,
    swellOboe8: 1,
    pedalTrompete8: 1, pedalPrincipal8: 1,
  },
};

// Maps config key names to WASM parameter indices
const CONFIG_KEY_TO_PARAM: Record<string, number> = {
  greatPrincipal8: 0,
  greatOctave4: 1,
  greatFifteenth2: 2,
  greatMixture: 3,
  greatFlute8: 4,
  greatBourdon16: 5,
  greatTrumpet8: 6,
  swellGedackt8: 7,
  swellSalicional8: 8,
  swellVoixCeleste: 9,
  swellOboe8: 10,
  pedalSubbass16: 11,
  pedalPrincipal8: 12,
  pedalTrompete8: 13,
  greatExpression: 14,
  swellExpression: 15,
  pedalExpression: 16,
  tremSpeed: 17,
  tremDepth: 18,
  tremEnable: 19,
  reverbAmount: 20,
  reverbDelay: 21,
  reverbTime: 22,
  reverbBassTime: 23,
  reverbTrebleTime: 24,
  volume: 25,
  tuning: 26,
  temperament: 27,
  azimuth: 28,
  stereoWidth: 29,
  directLevel: 30,
  reflectLevel: 31,
};

export class AeolusSynthEngine implements DevilboxSynth {
  readonly name = 'AeolusSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: AeolusConfig;
  private isInitialized = false;
  private pendingMessages: Array<Record<string, unknown>> = [];

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
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      this._worklet = new AudioWorkletNode(rawContext, 'aeolus-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          this.sendConfig(this.config);
          for (const msg of this.pendingMessages) {
            this._worklet!.port.postMessage(msg);
          }
          this.pendingMessages = [];
        } else if (event.data.type === 'error') {
          console.error('Aeolus worklet error:', event.data.message);
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
    for (const [key, value] of Object.entries(config)) {
      const param = CONFIG_KEY_TO_PARAM[key];
      if (param !== undefined && typeof value === 'number') {
        this.postMsg({ type: 'setParam', param, value });
      }
    }
  }

  private postMsg(msg: Record<string, unknown>): void {
    if (this._worklet && this.isInitialized) {
      this._worklet.port.postMessage(msg);
    } else {
      this.pendingMessages.push(msg);
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string'
      ? noteToMidi(frequency)
      : (frequency < 128 ? frequency : Math.round(12 * Math.log2(frequency / 440) + 69));
    const vel = Math.round((velocity ?? 0.8) * 127);
    this.postMsg({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (frequency !== undefined) {
      const note = typeof frequency === 'string'
        ? noteToMidi(frequency)
        : (frequency < 128 ? frequency : Math.round(12 * Math.log2(frequency / 440) + 69));
      this.postMsg({ type: 'noteOff', note });
    } else {
      this.postMsg({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const idx = CONFIG_KEY_TO_PARAM[param];
    if (idx !== undefined) {
      (this.config as Record<string, number>)[param] = value;
      this.postMsg({ type: 'setParam', param: idx, value });
    }
  }

  get(param: string): number | undefined {
    return (this.config as Record<string, number | undefined>)[param];
  }

  getAutomatableParams(): Array<{ id: string; name: string; min: number; max: number; section?: string }> {
    const params: Array<{ id: string; name: string; min: number; max: number; section?: string }> = [];
    for (const [key, paramIdx] of Object.entries(CONFIG_KEY_TO_PARAM)) {
      const name = AEOLUS_PARAM_NAMES[paramIdx] || key;
      let section: string | undefined;
      if (paramIdx <= 6) section = 'Great Stops';
      else if (paramIdx <= 10) section = 'Swell Stops';
      else if (paramIdx <= 13) section = 'Pedal Stops';
      else if (paramIdx <= 16) section = 'Expression';
      else if (paramIdx <= 19) section = 'Tremulant';
      else if (paramIdx <= 24) section = 'Reverb';
      else section = 'Global';
      params.push({ id: key, name, min: 0, max: 1, section });
    }
    return params;
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
    this.output.disconnect();
    this.isInitialized = false;
  }
}

export class AeolusSynthImpl extends AeolusSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<AeolusConfig>): void {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number') {
        this.set(key, value);
      }
    }
  }
}
