/**
 * RaffoSynth.ts - Raffo Minimoog clone WASM engine for DEViLBOX
 *
 * Features:
 * - Monophonic with key stack (legato)
 * - 4 oscillators (saw/tri/square/pulse) with independent range/tuning
 * - 2nd-order IIR filter with resonance
 * - Dual ADSR envelopes (amp + filter)
 * - Pitch glide (portamento)
 * - 32 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const RaffoParam = {
  VOLUME: 0, WAVE0: 1, WAVE1: 2, WAVE2: 3, WAVE3: 4,
  RANGE0: 5, RANGE1: 6, RANGE2: 7, RANGE3: 8,
  VOL0: 9, VOL1: 10, VOL2: 11, VOL3: 12,
  ATTACK: 13, DECAY: 14, SUSTAIN: 15, RELEASE: 16,
  FILTER_CUTOFF: 17, FILTER_ATTACK: 18, FILTER_DECAY: 19, FILTER_SUSTAIN: 20,
  GLIDE: 21, OSC_BUTTON0: 22, OSC_BUTTON1: 23, OSC_BUTTON2: 24, OSC_BUTTON3: 25,
  FILTER_RESONANCE: 26, TUNING0: 27, TUNING1: 28, TUNING2: 29, TUNING3: 30,
  FILTER_RELEASE: 31,
} as const;

export const RAFFO_PARAM_NAMES: Record<number, string> = {
  0: 'Volume', 1: 'Wave Osc1', 2: 'Wave Osc2', 3: 'Wave Osc3', 4: 'Wave Osc4',
  5: 'Range Osc1', 6: 'Range Osc2', 7: 'Range Osc3', 8: 'Range Osc4',
  9: 'Vol Osc1', 10: 'Vol Osc2', 11: 'Vol Osc3', 12: 'Vol Osc4',
  13: 'Attack', 14: 'Decay', 15: 'Sustain', 16: 'Release',
  17: 'Filter Cutoff', 18: 'Filter Attack', 19: 'Filter Decay', 20: 'Filter Sustain',
  21: 'Glide', 22: 'Osc1 On', 23: 'Osc2 On', 24: 'Osc3 On', 25: 'Osc4 On',
  26: 'Filter Resonance', 27: 'Tune Osc1', 28: 'Tune Osc2', 29: 'Tune Osc3', 30: 'Tune Osc4',
  31: 'Filter Release',
};

export interface RaffoSynthConfig {
  volume?: number;          // 0-10
  wave0?: number;           // 0-4 (saw/tri/square/pulse)
  wave1?: number;
  wave2?: number;
  wave3?: number;
  range0?: number;          // 1-6 (32'/16'/8'/4'/2'/1')
  range1?: number;
  range2?: number;
  range3?: number;
  vol0?: number;            // 0-10
  vol1?: number;
  vol2?: number;
  vol3?: number;
  attack?: number;          // 10-1000 ms
  decay?: number;           // 0-1000 ms
  sustain?: number;         // 0-1
  release?: number;         // 0-1
  filterCutoff?: number;    // 500-10000 Hz
  filterAttack?: number;    // 0-1000 ms
  filterDecay?: number;     // 0-1000 ms
  filterSustain?: number;   // 0-1
  glide?: number;           // 0-10
  oscButton0?: number;      // 0-2 (off/on)
  oscButton1?: number;
  oscButton2?: number;
  oscButton3?: number;
  filterResonance?: number; // 0-10
  tuning0?: number;         // -12 to 12 semitones
  tuning1?: number;
  tuning2?: number;
  tuning3?: number;
  filterRelease?: number;   // 0-1
}

export const DEFAULT_RAFFO: RaffoSynthConfig = {
  volume: 7, wave0: 2, wave1: 2, wave2: 0, wave3: 3,
  range0: 2, range1: 2, range2: 1, range3: 2,
  vol0: 7, vol1: 5, vol2: 4, vol3: 7,
  attack: 10, decay: 200, sustain: 0.8, release: 0.4,
  filterCutoff: 3000, filterAttack: 200, filterDecay: 400, filterSustain: 0.7,
  glide: 1, oscButton0: 1, oscButton1: 1, oscButton2: 1, oscButton3: 0,
  filterResonance: 3, tuning0: 0, tuning1: -0.02, tuning2: 0.02, tuning3: 0,
  filterRelease: 0.5,
};

export const RAFFO_PRESETS: Record<string, RaffoSynthConfig> = {
  'Classic Minimoog': { ...DEFAULT_RAFFO },
  'Fat Bass': {
    ...DEFAULT_RAFFO, volume: 8, wave0: 0, wave1: 0, wave2: 0, wave3: 0,
    range0: 1, range1: 2, range2: 2, range3: 3,
    vol0: 8, vol1: 6, vol2: 5, vol3: 0, oscButton3: 0,
    filterCutoff: 1500, filterResonance: 5, attack: 10, decay: 300, sustain: 0.6,
  },
  'Screaming Lead': {
    ...DEFAULT_RAFFO, volume: 8, wave0: 2, wave1: 2, wave2: 2, wave3: 2,
    range0: 3, range1: 3, range2: 4, range3: 4,
    filterCutoff: 5000, filterResonance: 7, glide: 3,
    oscButton3: 1, tuning1: 0.1, tuning2: -0.1,
  },
  'Mellow Pad': {
    ...DEFAULT_RAFFO, volume: 6, wave0: 1, wave1: 1, wave2: 0, wave3: 0,
    range0: 2, range1: 3, range2: 2, range3: 3,
    attack: 500, decay: 500, sustain: 0.9, release: 0.8,
    filterCutoff: 2000, filterAttack: 400, filterDecay: 500, filterSustain: 0.8,
    filterResonance: 2, glide: 2,
  },
  'Portamento Lead': {
    ...DEFAULT_RAFFO, volume: 7, wave0: 2, wave1: 0, wave2: 0, wave3: 0,
    range0: 3, range1: 3, range2: 4, range3: 3,
    vol0: 8, vol1: 5, vol2: 3, vol3: 0, oscButton3: 0,
    filterCutoff: 4000, filterResonance: 5, glide: 6,
    attack: 20, decay: 400, sustain: 0.7,
  },
  'Filter Sweep': {
    ...DEFAULT_RAFFO, volume: 7, wave0: 0, wave1: 0, wave2: 0, wave3: 0,
    range0: 2, range1: 2, range2: 3, range3: 3,
    filterCutoff: 800, filterResonance: 8,
    filterAttack: 600, filterDecay: 800, filterSustain: 0.3,
    attack: 50, decay: 600, sustain: 0.8, release: 0.6,
  },
  'Growl Bass': {
    ...DEFAULT_RAFFO, volume: 9, wave0: 0, wave1: 0, wave2: 2, wave3: 0,
    range0: 1, range1: 2, range2: 2, range3: 1,
    vol0: 8, vol1: 7, vol2: 5, vol3: 0, oscButton3: 0,
    filterCutoff: 1200, filterResonance: 6,
    filterAttack: 10, filterDecay: 250, filterSustain: 0.2,
    attack: 10, decay: 200, sustain: 0.5,
  },
  'Whistle': {
    ...DEFAULT_RAFFO, volume: 5, wave0: 0, wave1: 0, wave2: 0, wave3: 0,
    range0: 5, range1: 5, range2: 6, range3: 6,
    vol0: 8, vol1: 4, vol2: 0, vol3: 0, oscButton1: 1, oscButton2: 0, oscButton3: 0,
    filterCutoff: 6000, filterResonance: 8,
    attack: 80, decay: 300, sustain: 0.9, release: 0.4,
    glide: 4,
  },
  'Sci-Fi Effect': {
    ...DEFAULT_RAFFO, volume: 6, wave0: 2, wave1: 0, wave2: 1, wave3: 0,
    range0: 4, range1: 5, range2: 3, range3: 6,
    vol0: 7, vol1: 5, vol2: 6, vol3: 0, oscButton3: 0,
    filterCutoff: 2500, filterResonance: 9,
    filterAttack: 300, filterDecay: 700, filterSustain: 0.1,
    attack: 30, decay: 800, sustain: 0.3, release: 0.7,
    tuning1: 7, tuning2: -5,
  },
  'Drone': {
    ...DEFAULT_RAFFO, volume: 6, wave0: 0, wave1: 0, wave2: 0, wave3: 0,
    range0: 1, range1: 2, range2: 1, range3: 3,
    vol0: 7, vol1: 7, vol2: 6, vol3: 5, oscButton3: 1,
    filterCutoff: 1800, filterResonance: 3,
    attack: 800, decay: 500, sustain: 1.0, release: 0.9,
    filterAttack: 600, filterDecay: 500, filterSustain: 0.9,
    tuning1: 0.03, tuning2: -0.03, tuning3: 0.05,
  },
  'Taurus Pedal': {
    ...DEFAULT_RAFFO, volume: 9, wave0: 0, wave1: 0, wave2: 0, wave3: 0,
    range0: 1, range1: 1, range2: 2, range3: 2,
    vol0: 9, vol1: 7, vol2: 4, vol3: 0, oscButton3: 0,
    filterCutoff: 1000, filterResonance: 4,
    attack: 15, decay: 350, sustain: 0.7, release: 0.3,
    tuning1: -0.04, tuning2: 0.03,
  },
  'Lucky Man Lead': {
    ...DEFAULT_RAFFO, volume: 7, wave0: 0, wave1: 0, wave2: 0, wave3: 0,
    range0: 3, range1: 3, range2: 4, range3: 4,
    vol0: 8, vol1: 6, vol2: 4, vol3: 0, oscButton3: 0,
    filterCutoff: 3500, filterResonance: 6, glide: 5,
    attack: 30, decay: 500, sustain: 0.8, release: 0.5,
    filterAttack: 20, filterDecay: 400, filterSustain: 0.6,
  },
  'Funky Mono': {
    ...DEFAULT_RAFFO, volume: 8, wave0: 2, wave1: 0, wave2: 2, wave3: 0,
    range0: 3, range1: 2, range2: 3, range3: 2,
    vol0: 8, vol1: 6, vol2: 5, vol3: 0, oscButton3: 0,
    filterCutoff: 2200, filterResonance: 6,
    filterAttack: 10, filterDecay: 200, filterSustain: 0.2,
    attack: 10, decay: 200, sustain: 0.5, release: 0.2,
  },
  'Brass Mono': {
    ...DEFAULT_RAFFO, volume: 7, wave0: 0, wave1: 0, wave2: 0, wave3: 0,
    range0: 3, range1: 3, range2: 2, range3: 3,
    vol0: 8, vol1: 6, vol2: 5, vol3: 0, oscButton3: 0,
    filterCutoff: 1800, filterResonance: 2,
    filterAttack: 50, filterDecay: 300, filterSustain: 0.5,
    attack: 40, decay: 300, sustain: 0.8, release: 0.3,
  },
  'Sync Buzz': {
    ...DEFAULT_RAFFO, volume: 7, wave0: 0, wave1: 2, wave2: 0, wave3: 0,
    range0: 3, range1: 4, range2: 5, range3: 3,
    vol0: 8, vol1: 6, vol2: 4, vol3: 0, oscButton3: 0,
    filterCutoff: 3000, filterResonance: 5,
    filterAttack: 10, filterDecay: 300, filterSustain: 0.3,
    attack: 10, decay: 350, sustain: 0.6, release: 0.3,
    tuning1: 5, tuning2: -7,
  },
};

const CONFIG_KEYS: (keyof RaffoSynthConfig)[] = [
  'volume', 'wave0', 'wave1', 'wave2', 'wave3',
  'range0', 'range1', 'range2', 'range3',
  'vol0', 'vol1', 'vol2', 'vol3',
  'attack', 'decay', 'sustain', 'release',
  'filterCutoff', 'filterAttack', 'filterDecay', 'filterSustain',
  'glide', 'oscButton0', 'oscButton1', 'oscButton2', 'oscButton3',
  'filterResonance', 'tuning0', 'tuning1', 'tuning2', 'tuning3',
  'filterRelease',
];

export class RaffoSynthEngine implements DevilboxSynth {
  readonly name = 'RaffoSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: RaffoSynthConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<RaffoSynthConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_RAFFO, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!RaffoSynthEngine.isWorkletLoaded) {
        if (!RaffoSynthEngine.workletLoadPromise) {
          RaffoSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}raffo/RaffoSynth.worklet.js`
          );
        }
        await RaffoSynthEngine.workletLoadPromise;
        RaffoSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}raffo/RaffoSynth.wasm`),
        fetch(`${baseUrl}raffo/RaffoSynth.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load RaffoSynth.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load RaffoSynth.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}raffo/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      this._worklet = new AudioWorkletNode(rawContext, 'raffo-processor', {
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
          console.error('RaffoSynth error:', event.data.error);
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
      console.error('Failed to initialize RaffoSynth:', error);
      throw error;
    }
  }

  private applyConfig(config: RaffoSynthConfig): void {
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
    const index = CONFIG_KEYS.indexOf(param as keyof RaffoSynthConfig);
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
    const preset = RAFFO_PRESETS[name];
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
