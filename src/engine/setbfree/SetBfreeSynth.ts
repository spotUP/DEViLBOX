/**
 * SetBfreeSynth.ts - setBfree Hammond B3 organ WASM engine for DEViLBOX
 *
 * Features:
 * - 3 manuals: upper (9 drawbars), lower (9 drawbars), pedals (9 drawbars)
 * - Percussion section (enable, volume, decay, harmonic, gain)
 * - Vibrato/Chorus scanner (V1-V3, C1-C3)
 * - Leslie speaker simulation (horn/drum speeds, acceleration)
 * - Overdrive and reverb effects
 * - Key click, tuning, swell pedal
 * - 60 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { loadNativePatch, captureNativeState } from '@/engine/common/NativePatchLoader';
import { SETBFREE_NATIVE_FACTORY_PRESETS, SETBFREE_ALL_FACTORY_PRESETS } from './setbfreeNativePresets';
export { SETBFREE_NATIVE_FACTORY_PRESETS, SETBFREE_ALL_FACTORY_PRESETS };

export const SetBfreeParam = {
  // Upper manual drawbars (0-8)
  UPPER_16: 0, UPPER_513: 1, UPPER_8: 2, UPPER_4: 3, UPPER_223: 4,
  UPPER_2: 5, UPPER_135: 6, UPPER_113: 7, UPPER_1: 8,
  // Lower manual drawbars (9-17)
  LOWER_16: 9, LOWER_513: 10, LOWER_8: 11, LOWER_4: 12, LOWER_223: 13,
  LOWER_2: 14, LOWER_135: 15, LOWER_113: 16, LOWER_1: 17,
  // Pedal drawbars (18-26)
  PEDAL_16: 18, PEDAL_513: 19, PEDAL_8: 20, PEDAL_4: 21, PEDAL_223: 22,
  PEDAL_2: 23, PEDAL_135: 24, PEDAL_113: 25, PEDAL_1: 26,
  // Percussion (27-31)
  PERC_ENABLE: 27, PERC_VOLUME: 28, PERC_DECAY: 29, PERC_HARMONIC: 30, PERC_GAIN: 31,
  // Vibrato/Chorus (32-35)
  VIBRATO_TYPE: 32, VIBRATO_UPPER: 33, VIBRATO_LOWER: 34, VIBRATO_FREQ: 35,
  // Leslie (36-43)
  LESLIE_SPEED: 36, LESLIE_BRAKE: 37,
  HORN_SLOW_RPM: 38, HORN_FAST_RPM: 39, HORN_ACCEL: 40,
  DRUM_SLOW_RPM: 41, DRUM_FAST_RPM: 42, DRUM_ACCEL: 43,
  // Effects (44-47)
  OVERDRIVE_ENABLE: 44, OVERDRIVE_CHARACTER: 45, REVERB_MIX: 46, REVERB_WET: 47,
  // Global (48-52)
  VOLUME: 48, KEY_CLICK: 49, TUNING: 50, OUTPUT_LEVEL: 51, SWELL_PEDAL: 52,
} as const;

export const SETBFREE_PARAM_NAMES: Record<number, string> = {
  0: "Upper 16'", 1: "Upper 5⅓'", 2: "Upper 8'", 3: "Upper 4'", 4: "Upper 2⅔'",
  5: "Upper 2'", 6: "Upper 1⅗'", 7: "Upper 1⅓'", 8: "Upper 1'",
  9: "Lower 16'", 10: "Lower 5⅓'", 11: "Lower 8'", 12: "Lower 4'", 13: "Lower 2⅔'",
  14: "Lower 2'", 15: "Lower 1⅗'", 16: "Lower 1⅓'", 17: "Lower 1'",
  18: "Pedal 16'", 19: "Pedal 5⅓'", 20: "Pedal 8'", 21: "Pedal 4'", 22: "Pedal 2⅔'",
  23: "Pedal 2'", 24: "Pedal 1⅗'", 25: "Pedal 1⅓'", 26: "Pedal 1'",
  27: 'Perc Enable', 28: 'Perc Volume', 29: 'Perc Decay', 30: 'Perc Harmonic', 31: 'Perc Gain',
  32: 'Vibrato Type', 33: 'Vibrato Upper', 34: 'Vibrato Lower', 35: 'Vibrato Freq',
  36: 'Leslie Speed', 37: 'Leslie Brake',
  38: 'Horn Slow RPM', 39: 'Horn Fast RPM', 40: 'Horn Accel',
  41: 'Drum Slow RPM', 42: 'Drum Fast RPM', 43: 'Drum Accel',
  44: 'Overdrive Enable', 45: 'Overdrive Character', 46: 'Reverb Mix', 47: 'Reverb Wet',
  48: 'Volume', 49: 'Key Click', 50: 'Tuning', 51: 'Output Level', 52: 'Swell Pedal',
};

export interface SetBfreeConfig {
  // Upper manual drawbars (0-8 each)
  upper16?: number; upper513?: number; upper8?: number; upper4?: number; upper223?: number;
  upper2?: number; upper135?: number; upper113?: number; upper1?: number;
  // Lower manual drawbars (0-8 each)
  lower16?: number; lower513?: number; lower8?: number; lower4?: number; lower223?: number;
  lower2?: number; lower135?: number; lower113?: number; lower1?: number;
  // Pedal drawbars (0-8 each)
  pedal16?: number; pedal513?: number; pedal8?: number; pedal4?: number; pedal223?: number;
  pedal2?: number; pedal135?: number; pedal113?: number; pedal1?: number;
  // Percussion
  percEnable?: number;    // 0=off, 1=on
  percVolume?: number;    // 0=normal, 1=soft
  percDecay?: number;     // 0=slow, 1=fast
  percHarmonic?: number;  // 0=2nd, 1=3rd
  percGain?: number;      // 0-22
  // Vibrato/Chorus
  vibratoType?: number;   // 0-6: Off/V1/C1/V2/C2/V3/C3
  vibratoUpper?: number;  // 0-1
  vibratoLower?: number;  // 0-1
  vibratoFreq?: number;   // 4-22 Hz
  // Leslie
  leslieSpeed?: number;   // 0=stop, 1=slow, 2=fast
  leslieBrake?: number;   // 0-1
  hornSlowRpm?: number;   // 5-200
  hornFastRpm?: number;   // 100-900
  hornAccel?: number;     // 0.05-2.0 sec
  drumSlowRpm?: number;   // 5-100
  drumFastRpm?: number;   // 60-600
  drumAccel?: number;     // 0.5-10.0 sec
  // Effects
  overdriveEnable?: number;     // 0-1
  overdriveCharacter?: number;  // 0-127
  reverbMix?: number;           // 0-1
  reverbWet?: number;           // 0-1
  // Global
  volume?: number;        // 0-1
  keyClick?: number;      // 0-1
  tuning?: number;        // 220-880 Hz
  outputLevel?: number;   // 0-1
  swellPedal?: number;    // 0-1
}

export const DEFAULT_SETBFREE: SetBfreeConfig = {
  // Upper: classic 888000000
  upper16: 8, upper513: 8, upper8: 8, upper4: 0, upper223: 0,
  upper2: 0, upper135: 0, upper113: 0, upper1: 0,
  // Lower: mellow foundation
  lower16: 8, lower513: 4, lower8: 8, lower4: 0, lower223: 0,
  lower2: 0, lower135: 0, lower113: 0, lower1: 0,
  // Pedals: bass only
  pedal16: 8, pedal513: 0, pedal8: 4, pedal4: 0, pedal223: 0,
  pedal2: 0, pedal135: 0, pedal113: 0, pedal1: 0,
  // Percussion
  percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 0, percGain: 11,
  // Vibrato/Chorus
  vibratoType: 5, vibratoUpper: 1, vibratoLower: 0, vibratoFreq: 7,
  // Leslie
  leslieSpeed: 1, leslieBrake: 0,
  hornSlowRpm: 40, hornFastRpm: 400, hornAccel: 0.161,
  drumSlowRpm: 36, drumFastRpm: 357, drumAccel: 4.127,
  // Effects
  overdriveEnable: 0, overdriveCharacter: 0, reverbMix: 0.1, reverbWet: 0.1,
  // Global
  volume: 0.8, keyClick: 0.5, tuning: 440, outputLevel: 0.8, swellPedal: 1,
};

export const SETBFREE_PRESETS: Record<string, SetBfreeConfig> = {
  'Gospel Full': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 8, upper8: 8, upper4: 0, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 1, percGain: 14,
    leslieSpeed: 2, vibratoType: 5, vibratoUpper: 1,
  },
  'Jazz Combo': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 3, upper8: 8, upper4: 0, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 1, percDecay: 1, percHarmonic: 0, percGain: 8,
    vibratoType: 6, vibratoUpper: 1,
    leslieSpeed: 1, overdriveEnable: 0, reverbMix: 0.2, reverbWet: 0.15,
  },
  'Classic Rock': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 8, upper8: 8, upper4: 8, upper223: 8,
    upper2: 8, upper135: 8, upper113: 8, upper1: 8,
    percEnable: 0, percGain: 0,
    overdriveEnable: 1, overdriveCharacter: 64,
    leslieSpeed: 2, vibratoType: 5, vibratoUpper: 1,
  },
  'Ballad': {
    ...DEFAULT_SETBFREE,
    upper16: 0, upper513: 0, upper8: 8, upper4: 8, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 1, percDecay: 0, percHarmonic: 0, percGain: 6,
    vibratoType: 3, vibratoUpper: 1,
    leslieSpeed: 1, reverbMix: 0.5, reverbWet: 0.4,
  },
  'Jimmy Smith': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 8, upper8: 8, upper4: 0, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 0, percGain: 14,
    leslieSpeed: 2, vibratoType: 5, vibratoUpper: 1,
    overdriveEnable: 0, keyClick: 0.7,
  },
  'Blues': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 8, upper8: 6, upper4: 0, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 0, percGain: 12,
    leslieSpeed: 1, vibratoType: 5, vibratoUpper: 1,
    overdriveEnable: 1, overdriveCharacter: 40,
    keyClick: 0.5,
  },
  'Booker T Green Onions': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 8, upper8: 8, upper4: 8, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 0, percGain: 14,
    leslieSpeed: 1, vibratoType: 5, vibratoUpper: 1,
    overdriveEnable: 0, keyClick: 0.6,
  },
  'Keith Emerson': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 8, upper8: 8, upper4: 8, upper223: 8,
    upper2: 8, upper135: 8, upper113: 8, upper1: 8,
    percEnable: 0, percGain: 0,
    overdriveEnable: 1, overdriveCharacter: 100,
    leslieSpeed: 2, vibratoType: 5, vibratoUpper: 1,
    keyClick: 0.3,
  },
  'Percussive Click': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 0, upper8: 8, upper4: 0, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 1, percGain: 18,
    leslieSpeed: 0, vibratoType: 0,
    keyClick: 1.0,
  },
  'Theatre Organ': {
    ...DEFAULT_SETBFREE,
    upper16: 0, upper513: 0, upper8: 6, upper4: 0, upper223: 2,
    upper2: 0, upper135: 3, upper113: 0, upper1: 0,
    percEnable: 0, percGain: 0,
    leslieSpeed: 0, vibratoType: 3, vibratoUpper: 1,
    reverbMix: 0.6, reverbWet: 0.5,
  },
  'Cathedral': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 4, upper8: 8, upper4: 4, upper223: 2,
    upper2: 4, upper135: 2, upper113: 0, upper1: 0,
    percEnable: 0, percGain: 0,
    leslieSpeed: 0, vibratoType: 3, vibratoUpper: 1,
    reverbMix: 0.8, reverbWet: 0.7,
  },
  'Soul Jazz': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 4, upper8: 8, upper4: 0, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 1, percDecay: 0, percHarmonic: 0, percGain: 10,
    leslieSpeed: 1, vibratoType: 5, vibratoUpper: 1,
    overdriveEnable: 0, reverbMix: 0.3, reverbWet: 0.2,
  },
  'Reggae Skank': {
    ...DEFAULT_SETBFREE,
    upper16: 0, upper513: 0, upper8: 8, upper4: 8, upper223: 0,
    upper2: 8, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 1, percGain: 12,
    leslieSpeed: 0, vibratoType: 0,
    keyClick: 0.8,
  },
  'Whiter Shade': {
    ...DEFAULT_SETBFREE,
    upper16: 6, upper513: 8, upper8: 8, upper4: 6, upper223: 0,
    upper2: 0, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 0, percGain: 0,
    leslieSpeed: 1, vibratoType: 5, vibratoUpper: 1,
    reverbMix: 0.4, reverbWet: 0.35,
  },
  'Full Leslie': {
    ...DEFAULT_SETBFREE,
    upper16: 8, upper513: 6, upper8: 8, upper4: 4, upper223: 3,
    upper2: 2, upper135: 0, upper113: 0, upper1: 0,
    percEnable: 1, percVolume: 0, percDecay: 1, percHarmonic: 0, percGain: 12,
    leslieSpeed: 2, vibratoType: 5, vibratoUpper: 1,
    hornFastRpm: 700, drumFastRpm: 400,
    overdriveEnable: 0, reverbMix: 0.25, reverbWet: 0.2,
  },
};

// Native factory presets re-exported above from setbfreeNativePresets.ts

const CONFIG_KEYS: (keyof SetBfreeConfig)[] = [
  // Upper drawbars (0-8)
  'upper16', 'upper513', 'upper8', 'upper4', 'upper223',
  'upper2', 'upper135', 'upper113', 'upper1',
  // Lower drawbars (9-17)
  'lower16', 'lower513', 'lower8', 'lower4', 'lower223',
  'lower2', 'lower135', 'lower113', 'lower1',
  // Pedal drawbars (18-26)
  'pedal16', 'pedal513', 'pedal8', 'pedal4', 'pedal223',
  'pedal2', 'pedal135', 'pedal113', 'pedal1',
  // Percussion (27-31)
  'percEnable', 'percVolume', 'percDecay', 'percHarmonic', 'percGain',
  // Vibrato/Chorus (32-35)
  'vibratoType', 'vibratoUpper', 'vibratoLower', 'vibratoFreq',
  // Leslie (36-43)
  'leslieSpeed', 'leslieBrake',
  'hornSlowRpm', 'hornFastRpm', 'hornAccel',
  'drumSlowRpm', 'drumFastRpm', 'drumAccel',
  // Effects (44-47)
  'overdriveEnable', 'overdriveCharacter', 'reverbMix', 'reverbWet',
  // Global (48-52)
  'volume', 'keyClick', 'tuning', 'outputLevel', 'swellPedal',
];

/** Map CONFIG_KEYS index → WASM param index.
 *  WASM has 44 params (NUM_PARAMS). CONFIG_KEYS has 53 entries.
 *  9 TypeScript-only params (percGain, vibratoFreq, leslieBrake, horn/drum RPM/Accel,
 *  overdriveCharacter, reverbWet, tuning, outputLevel, swellPedal) have no WASM equivalent.
 */
const WASM_PARAM_INDEX: Record<number, number> = {
  // Drawbars 0-26: 1:1 match
  ...Object.fromEntries(Array.from({ length: 27 }, (_, i) => [i, i])),
  // Percussion: CONFIG 27-30 → WASM 27-30 (percGain at CONFIG 31 has no WASM equivalent)
  27: 27, 28: 28, 29: 29, 30: 30,
  // Vibrato: CONFIG 32-34 → WASM 31-33 (vibratoFreq at CONFIG 35 has no WASM equivalent)
  32: 31, 33: 32, 34: 33,
  // Leslie: CONFIG 36 → WASM 34 (leslieBrake, horn/drum RPM/Accel have no WASM equivalent)
  36: 34,
  // Overdrive: CONFIG 44 → WASM 35 (overdriveCharacter has no direct WASM equivalent)
  44: 35,
  // Reverb: CONFIG 46 → WASM 38
  46: 38,
  // Volume: CONFIG 48 → WASM 39
  48: 39,
  // Key click: CONFIG 49 → WASM 40
  49: 40,
};

export class SetBfreeSynthEngine implements DevilboxSynth {
  readonly name = 'SetBfreeSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: SetBfreeConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private pendingPatch: number[] | null = null;

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<SetBfreeConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_SETBFREE, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!SetBfreeSynthEngine.isWorkletLoaded) {
        if (!SetBfreeSynthEngine.workletLoadPromise) {
          SetBfreeSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}setbfree/SetBfree.worklet.js`
          );
        }
        await SetBfreeSynthEngine.workletLoadPromise;
        SetBfreeSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}setbfree/SetBfree.wasm`),
        fetch(`${baseUrl}setbfree/SetBfree.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load SetBfree.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load SetBfree.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}setbfree/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

      this._worklet = new AudioWorkletNode(rawContext, 'setbfree-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          if (this.pendingPatch) {
            void loadNativePatch(this._worklet!, this.pendingPatch).catch(() => {});
            this.pendingPatch = null;
          } else {
            this.sendConfig(this.config);
          }
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('SetBfree error:', event.data.error);
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
      console.error('Failed to initialize SetBfree:', error);
      throw error;
    }
  }

  private sendConfig(config: SetBfreeConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const value = config[CONFIG_KEYS[i]];
      const wasmIdx = WASM_PARAM_INDEX[i];
      if (value !== undefined && wasmIdx !== undefined) {
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
    const configIdx = CONFIG_KEYS.indexOf(param as keyof SetBfreeConfig);
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
    const preset = SETBFREE_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.sendConfig(this.config);
    }
  }

  /**
   * Load a native patch (complete engine state snapshot).
   * If not yet initialized, queues the patch for loading on ready.
   */
  loadPatch(values: number[]): void {
    if (this.isInitialized && this._worklet) {
      void loadNativePatch(this._worklet, values).catch(() => {});
    } else {
      this.pendingPatch = values;
    }
  }

  /**
   * Load a native preset by name from the SETBFREE_NATIVE_FACTORY_PRESETS map.
   */
  loadNativePreset(name: string): void {
    const preset = SETBFREE_NATIVE_FACTORY_PRESETS.find(p => p.name === name);
    if (preset) {
      // Apply via set() which maps CONFIG_KEYS → WASM indices correctly
      // (loadPatch sends raw indices which don't match WASM param ordering)
      for (let i = 0; i < Math.min(preset.values.length, CONFIG_KEYS.length); i++) {
        this.set(CONFIG_KEYS[i], preset.values[i]);
      }
    } else {
      console.warn(`[SetBfree] Native preset not found: ${name}`);
    }
  }

  /**
   * Capture the current complete engine state (for preset creation).
   */
  async getState(): Promise<number[] | null> {
    if (!this.isInitialized || !this._worklet) return null;
    try {
      const result = await captureNativeState(this._worklet);
      return result.values;
    } catch {
      return null;
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

/**
 * SetBfreeSynthImpl — alias used by CommunitySynthFactory.
 * Wraps the engine with init()/applyConfig() expected by the factory.
 */
export class SetBfreeSynthImpl extends SetBfreeSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<SetBfreeConfig>): void {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number') {
        this.set(key, value);
      }
    }
  }
}
