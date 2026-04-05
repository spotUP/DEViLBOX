/**
 * AMSynthSynth.ts - AMSynth (Analog Modelling Synthesizer) WASM engine for DEViLBOX
 *
 * Features:
 * - Dual oscillator subtractive synth (saw/square/tri/sine/noise)
 * - 12/24dB multi-mode filter (LP/HP/BP/BS/bypass)
 * - Dual ADSR envelopes (amp + filter)
 * - LFO with 7 waveforms, routable to pitch/filter/amp
 * - Ring modulation, oscillator sync
 * - Distortion, Freeverb reverb
 * - Portamento (poly/mono/legato modes)
 * - 41 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

/** Parameter indices matching AMSynth's controls.h kAmsynthParameter enum */
export const AMSynthParam = {
  AMP_ATTACK: 0,
  AMP_DECAY: 1,
  AMP_SUSTAIN: 2,
  AMP_RELEASE: 3,
  OSC1_WAVEFORM: 4,
  FILTER_ATTACK: 5,
  FILTER_DECAY: 6,
  FILTER_SUSTAIN: 7,
  FILTER_RELEASE: 8,
  FILTER_RESONANCE: 9,
  FILTER_ENV_AMOUNT: 10,
  FILTER_CUTOFF: 11,
  OSC2_DETUNE: 12,
  OSC2_WAVEFORM: 13,
  MASTER_VOL: 14,
  LFO_FREQ: 15,
  LFO_WAVEFORM: 16,
  OSC2_RANGE: 17,
  OSC_MIX: 18,
  FREQ_MOD_AMOUNT: 19,
  FILTER_MOD_AMOUNT: 20,
  AMP_MOD_AMOUNT: 21,
  OSC_MIX_MODE: 22,
  OSC1_PULSEWIDTH: 23,
  OSC2_PULSEWIDTH: 24,
  REVERB_ROOMSIZE: 25,
  REVERB_DAMP: 26,
  REVERB_WET: 27,
  REVERB_WIDTH: 28,
  DISTORTION_CRUNCH: 29,
  OSC2_SYNC: 30,
  PORTAMENTO_TIME: 31,
  KEYBOARD_MODE: 32,
  OSC2_PITCH: 33,
  FILTER_TYPE: 34,
  FILTER_SLOPE: 35,
  FREQ_MOD_OSC: 36,
  FILTER_KBD_TRACK: 37,
  FILTER_VEL_SENS: 38,
  AMP_VEL_SENS: 39,
  PORTAMENTO_MODE: 40,
} as const;

export const AMSYNTH_PARAM_NAMES: Record<number, string> = {
  0: 'Amp Attack', 1: 'Amp Decay', 2: 'Amp Sustain', 3: 'Amp Release',
  4: 'Osc1 Waveform', 5: 'Filter Attack', 6: 'Filter Decay', 7: 'Filter Sustain',
  8: 'Filter Release', 9: 'Filter Resonance', 10: 'Filter Env Amount', 11: 'Filter Cutoff',
  12: 'Osc2 Detune', 13: 'Osc2 Waveform', 14: 'Master Volume', 15: 'LFO Freq',
  16: 'LFO Waveform', 17: 'Osc2 Range', 18: 'Osc Mix', 19: 'Freq Mod Amount',
  20: 'Filter Mod Amount', 21: 'Amp Mod Amount', 22: 'Osc Mix Mode', 23: 'Osc1 Pulse Width',
  24: 'Osc2 Pulse Width', 25: 'Reverb Size', 26: 'Reverb Damp', 27: 'Reverb Wet',
  28: 'Reverb Width', 29: 'Distortion', 30: 'Osc2 Sync', 31: 'Portamento Time',
  32: 'Keyboard Mode', 33: 'Osc2 Pitch', 34: 'Filter Type', 35: 'Filter Slope',
  36: 'Freq Mod OSC', 37: 'Filter Kbd Track', 38: 'Filter Vel Sens', 39: 'Amp Vel Sens',
  40: 'Portamento Mode',
};

/** AMSynth uses real-value parameters, not 0-1 normalized */
export interface AMSynthConfig {
  ampAttack?: number;        // 0-2.5s
  ampDecay?: number;         // 0-2.5s
  ampSustain?: number;       // 0-1
  ampRelease?: number;       // 0-2.5s
  osc1Waveform?: number;     // 0-4 (sine/pulse/saw/noise/random)
  filterAttack?: number;     // 0-2.5s
  filterDecay?: number;      // 0-2.5s
  filterSustain?: number;    // 0-1
  filterRelease?: number;    // 0-2.5s
  filterResonance?: number;  // 0-0.97
  filterEnvAmount?: number;  // -16 to 16
  filterCutoff?: number;     // -0.5 to 1.5
  osc2Detune?: number;       // -1 to 1
  osc2Waveform?: number;     // 0-4
  masterVol?: number;        // 0-1
  lfoFreq?: number;          // 0-7.5 Hz
  lfoWaveform?: number;      // 0-6
  osc2Range?: number;        // -3 to 4
  oscMix?: number;           // -1 to 1
  freqModAmount?: number;    // 0-1.26
  filterModAmount?: number;  // -1 to 1
  ampModAmount?: number;     // -1 to 1
  oscMixMode?: number;       // 0-1 (mix/ringmod)
  osc1Pulsewidth?: number;   // 0-1
  osc2Pulsewidth?: number;   // 0-1
  reverbRoomsize?: number;   // 0-1
  reverbDamp?: number;       // 0-1
  reverbWet?: number;        // 0-1
  reverbWidth?: number;      // 0-1
  distortionCrunch?: number; // 0-0.9
  osc2Sync?: number;         // 0-1 (off/on)
  portamentoTime?: number;   // 0-1
  keyboardMode?: number;     // 0-2 (poly/mono/legato)
  osc2Pitch?: number;        // -12 to 12
  filterType?: number;       // 0-4 (LP/HP/BP/BS/bypass)
  filterSlope?: number;      // 0-1 (12dB/24dB)
  freqModOsc?: number;       // 0-2
  filterKbdTrack?: number;   // 0-1
  filterVelSens?: number;    // 0-1
  ampVelSens?: number;       // 0-1
  portamentoMode?: number;   // 0-1 (always/legato)
}

export const DEFAULT_AMSYNTH: AMSynthConfig = {
  ampAttack: 0.01,
  ampDecay: 0.5,
  ampSustain: 0.8,
  ampRelease: 0.3,
  osc1Waveform: 2,        // saw
  filterAttack: 0.01,
  filterDecay: 0.5,
  filterSustain: 0.8,
  filterRelease: 0.3,
  filterResonance: 0.3,
  filterEnvAmount: 4.0,
  filterCutoff: 0.8,
  osc2Detune: 0.0,
  osc2Waveform: 2,        // saw
  masterVol: 0.7,
  lfoFreq: 3.0,
  lfoWaveform: 0,          // sine
  osc2Range: 0,
  oscMix: 0.0,
  freqModAmount: 0.0,
  filterModAmount: 0.0,
  ampModAmount: 0.0,
  oscMixMode: 0,           // mix
  osc1Pulsewidth: 0.5,
  osc2Pulsewidth: 0.5,
  reverbRoomsize: 0.5,
  reverbDamp: 0.5,
  reverbWet: 0.0,
  reverbWidth: 0.5,
  distortionCrunch: 0.0,
  osc2Sync: 0,
  portamentoTime: 0.0,
  keyboardMode: 0,         // poly
  osc2Pitch: 0,
  filterType: 0,           // lowpass
  filterSlope: 1,          // 24dB
  freqModOsc: 0,
  filterKbdTrack: 0.5,
  filterVelSens: 0.5,
  ampVelSens: 0.5,
  portamentoMode: 0,
};

export const AMSYNTH_PRESETS: Record<string, AMSynthConfig> = {
  'Init': { ...DEFAULT_AMSYNTH },
  'Saw Bass': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.005, ampDecay: 0.4, ampSustain: 0.5, ampRelease: 0.08,
    filterCutoff: 0.2, filterResonance: 0.3, filterEnvAmount: 10.0,
    filterAttack: 0.005, filterDecay: 0.35, filterSustain: 0.1, filterRelease: 0.08,
    osc1Waveform: 2, osc2Waveform: 2, osc2Range: -1, oscMix: -0.2,
    keyboardMode: 1, portamentoTime: 0.05,
  },
  'Square Lead': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.01, ampDecay: 0.6, ampSustain: 0.8, ampRelease: 0.15,
    filterCutoff: 0.7, filterResonance: 0.3, filterEnvAmount: 4.0,
    filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.5, filterRelease: 0.15,
    osc1Waveform: 1, osc1Pulsewidth: 0.4, keyboardMode: 1,
  },
  'Sync Lead': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.01, ampDecay: 0.4, ampSustain: 0.75, ampRelease: 0.15,
    filterCutoff: 0.8, filterResonance: 0.25, filterEnvAmount: 5.0,
    filterAttack: 0.01, filterDecay: 0.25, filterSustain: 0.4, filterRelease: 0.15,
    osc1Waveform: 2, osc2Waveform: 2, osc2Sync: 1, osc2Detune: 0.3,
    keyboardMode: 1, distortionCrunch: 0.15,
  },
  'Resonant Sweep': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.3, ampDecay: 1.5, ampSustain: 0.6, ampRelease: 0.8,
    filterCutoff: 0.1, filterResonance: 0.8, filterEnvAmount: 12.0,
    filterAttack: 0.01, filterDecay: 1.2, filterSustain: 0.2, filterRelease: 0.6,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.08,
  },
  'Sub Bass': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.005, ampDecay: 0.2, ampSustain: 0.9, ampRelease: 0.1,
    filterCutoff: 0.15, filterResonance: 0.1, filterEnvAmount: 3.0,
    filterAttack: 0.005, filterDecay: 0.15, filterSustain: 0.3, filterRelease: 0.08,
    osc1Waveform: 0, osc2Waveform: 0, osc2Range: -1, oscMix: -0.5,
    keyboardMode: 1, filterSlope: 1,
  },
  'Fat Lead': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.01, ampDecay: 0.5, ampSustain: 0.8, ampRelease: 0.2,
    filterCutoff: 0.55, filterResonance: 0.5, filterEnvAmount: 6.0,
    filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.45, filterRelease: 0.2,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.12, oscMix: 0.0,
    keyboardMode: 1, distortionCrunch: 0.2,
  },
  'Ambient Pad': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 1.5, ampDecay: 2.0, ampSustain: 0.85, ampRelease: 2.5,
    filterCutoff: 0.4, filterResonance: 0.15, filterEnvAmount: 1.5,
    filterAttack: 1.0, filterDecay: 1.5, filterSustain: 0.8, filterRelease: 2.0,
    osc1Waveform: 2, osc2Waveform: 1, osc2Detune: 0.04, oscMix: 0.1,
    reverbWet: 0.5, reverbRoomsize: 0.8, reverbWidth: 0.9,
  },
  'Brass Stab': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.02, ampDecay: 0.25, ampSustain: 0.7, ampRelease: 0.12,
    filterCutoff: 0.25, filterResonance: 0.2, filterEnvAmount: 10.0,
    filterAttack: 0.02, filterDecay: 0.2, filterSustain: 0.3, filterRelease: 0.1,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.06, oscMix: 0.0,
    filterSlope: 1,
  },
  'PWM Strings': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.6, ampDecay: 0.8, ampSustain: 0.9, ampRelease: 1.0,
    filterCutoff: 0.55, filterResonance: 0.1, filterEnvAmount: 1.0,
    filterAttack: 0.4, filterDecay: 0.6, filterSustain: 0.7, filterRelease: 0.8,
    osc1Waveform: 1, osc1Pulsewidth: 0.3, osc2Waveform: 1, osc2Pulsewidth: 0.7,
    osc2Detune: 0.03, oscMix: 0.0,
    lfoFreq: 3.5, lfoWaveform: 0, filterModAmount: 0.15,
    reverbWet: 0.25,
  },
  'Acid Squelch': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.005, ampDecay: 0.2, ampSustain: 0.0, ampRelease: 0.05,
    filterCutoff: 0.05, filterResonance: 0.85, filterEnvAmount: 14.0,
    filterAttack: 0.005, filterDecay: 0.2, filterSustain: 0.0, filterRelease: 0.05,
    osc1Waveform: 2, keyboardMode: 1, portamentoTime: 0.08,
    filterSlope: 1, distortionCrunch: 0.1,
  },
  'Hoover Bass': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.01, ampDecay: 0.5, ampSustain: 0.7, ampRelease: 0.15,
    filterCutoff: 0.35, filterResonance: 0.3, filterEnvAmount: 7.0,
    filterAttack: 0.01, filterDecay: 0.4, filterSustain: 0.25, filterRelease: 0.1,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.15, osc2Range: -1,
    oscMix: -0.1, keyboardMode: 1, portamentoTime: 0.15,
    distortionCrunch: 0.25,
  },
  'Reese Bass': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.01, ampDecay: 0.6, ampSustain: 0.8, ampRelease: 0.2,
    filterCutoff: 0.2, filterResonance: 0.2, filterEnvAmount: 4.0,
    filterAttack: 0.01, filterDecay: 0.5, filterSustain: 0.3, filterRelease: 0.15,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.07, osc2Range: -1,
    oscMix: 0.0, keyboardMode: 1, filterSlope: 1,
  },
  'Pluck': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.002, ampDecay: 0.35, ampSustain: 0.0, ampRelease: 0.15,
    filterCutoff: 0.6, filterResonance: 0.25, filterEnvAmount: 8.0,
    filterAttack: 0.002, filterDecay: 0.3, filterSustain: 0.0, filterRelease: 0.1,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.02,
  },
  'Bell FM': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.002, ampDecay: 1.5, ampSustain: 0.0, ampRelease: 1.0,
    filterCutoff: 1.2, filterResonance: 0.05, filterEnvAmount: 0.0,
    osc1Waveform: 0, osc2Waveform: 0, osc2Pitch: 7,
    freqModAmount: 0.4, oscMix: -0.8,
  },
  'Warm Pad': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.8, ampDecay: 1.0, ampSustain: 0.9, ampRelease: 1.5,
    filterCutoff: 0.5, filterResonance: 0.2, filterEnvAmount: 2.0,
    filterAttack: 0.5, filterDecay: 0.8, filterSustain: 0.7, filterRelease: 1.2,
    osc2Detune: 0.05, oscMix: 0.0, reverbWet: 0.3,
  },
  'Fat Bass': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.01, ampDecay: 0.3, ampSustain: 0.6, ampRelease: 0.1,
    filterCutoff: 0.3, filterResonance: 0.4, filterEnvAmount: 8.0,
    filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.2, filterRelease: 0.1,
    osc1Waveform: 2, osc2Waveform: 0, osc2Range: -1, oscMix: -0.3,
    keyboardMode: 1, portamentoTime: 0.1,
  },
  'Screaming Lead': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.01, ampDecay: 0.5, ampSustain: 0.7, ampRelease: 0.2,
    filterCutoff: 0.6, filterResonance: 0.7, filterEnvAmount: 6.0,
    filterAttack: 0.01, filterDecay: 0.2, filterSustain: 0.4, filterRelease: 0.2,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.1, oscMix: 0.0,
    distortionCrunch: 0.3, keyboardMode: 1,
  },
  'Detuned Saws': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.3, ampDecay: 0.8, ampSustain: 0.85, ampRelease: 0.6,
    filterCutoff: 0.6, filterResonance: 0.1, filterEnvAmount: 1.5,
    filterAttack: 0.2, filterDecay: 0.5, filterSustain: 0.6, filterRelease: 0.5,
    osc1Waveform: 2, osc2Waveform: 2, osc2Detune: 0.18, oscMix: 0.0,
    reverbWet: 0.2,
  },
  'Noise Sweep': {
    ...DEFAULT_AMSYNTH,
    ampAttack: 0.1, ampDecay: 2.0, ampSustain: 0.0, ampRelease: 0.5,
    filterCutoff: 0.05, filterResonance: 0.7, filterEnvAmount: 14.0,
    filterAttack: 0.05, filterDecay: 1.8, filterSustain: 0.0, filterRelease: 0.3,
    osc1Waveform: 3, osc2Waveform: 3, oscMix: 0.0,
    filterSlope: 1,
  },
};

const CONFIG_KEYS: (keyof AMSynthConfig)[] = [
  'ampAttack', 'ampDecay', 'ampSustain', 'ampRelease', 'osc1Waveform',
  'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease',
  'filterResonance', 'filterEnvAmount', 'filterCutoff',
  'osc2Detune', 'osc2Waveform', 'masterVol', 'lfoFreq', 'lfoWaveform',
  'osc2Range', 'oscMix', 'freqModAmount', 'filterModAmount', 'ampModAmount',
  'oscMixMode', 'osc1Pulsewidth', 'osc2Pulsewidth',
  'reverbRoomsize', 'reverbDamp', 'reverbWet', 'reverbWidth',
  'distortionCrunch', 'osc2Sync', 'portamentoTime', 'keyboardMode',
  'osc2Pitch', 'filterType', 'filterSlope', 'freqModOsc',
  'filterKbdTrack', 'filterVelSens', 'ampVelSens', 'portamentoMode',
];

export class AMSynthSynth implements DevilboxSynth {
  readonly name = 'AMSynthSynth';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: AMSynthConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private _currentNote = -1;

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  private _initPromise: Promise<void>;

  constructor(config: Partial<AMSynthConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_AMSYNTH, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!AMSynthSynth.isWorkletLoaded) {
        if (!AMSynthSynth.workletLoadPromise) {
          AMSynthSynth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}amsynth/AMSynth.worklet.js`
          );
        }
        await AMSynthSynth.workletLoadPromise;
        AMSynthSynth.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}amsynth/AMSynth.wasm`),
        fetch(`${baseUrl}amsynth/AMSynth.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load AMSynth.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load AMSynth.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}amsynth/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

      this._worklet = new AudioWorkletNode(rawContext, 'amsynth-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          console.log('[AMSynth] Worklet ready');
          this.isInitialized = true;
          this.applyConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'audioLevel') {
          console.log('[AMSynth] 🔊 WASM producing audio! peak:', event.data.peak);
        } else if (event.data.type === 'error') {
          console.error('[AMSynth] Worklet error:', event.data.error);
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
      console.error('Failed to initialize AMSynthSynth:', error);
      throw error;
    }
  }

  applyConfig(config: AMSynthConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const key = CONFIG_KEYS[i];
      const value = config[key];
      if (value !== undefined && value !== this.config[key]) {
        this.config[key] = value;
        this._worklet.port.postMessage({ type: 'setParam', index: i, value });
      }
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.round((velocity ?? 0.8) * 127);
    this._currentNote = note;

    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }

    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  // AMSynth is monophonic — always release the current note
  triggerRelease(_time?: number): this {
    if (!this._worklet || !this.isInitialized) {
      // Clear pending notes to prevent stuck notes when noteOff arrives before init
      this.pendingNotes = [];
      return this;
    }
    if (this._currentNote >= 0) {
      this._worklet.port.postMessage({ type: 'noteOff', note: this._currentNote });
      this._currentNote = -1;
    }
    return this;
  }

  set(param: string, value: number): void {
    const index = CONFIG_KEYS.indexOf(param as keyof AMSynthConfig);
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
    const preset = AMSYNTH_PRESETS[name];
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
