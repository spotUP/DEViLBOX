/**
 * ZynAddSubFXSynth.ts - ZynAddSubFX WASM engine for DEViLBOX
 *
 * Features:
 * - ADDsynth: 4 voices with waveform, volume, detune
 * - SUBsynth: subtractive synthesis with harmonics
 * - PADsynth: pad synthesis with bandwidth control
 * - Global filter with ADSR envelope
 * - Amp envelope (ADSR)
 * - Effects: reverb, chorus, distortion, EQ
 * - ~70 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const ZynAddSubFXParam = {
  // ADDsynth (0-19)
  ADD_ENABLE: 0, ADD_VOLUME: 1, ADD_PANNING: 2, ADD_DETUNE: 3, ADD_OCTAVE: 4,
  ADD_V1_WAVE: 5, ADD_V1_VOLUME: 6, ADD_V1_DETUNE: 7,
  ADD_V2_WAVE: 8, ADD_V2_VOLUME: 9, ADD_V2_DETUNE: 10, ADD_V2_OCTAVE: 11,
  ADD_V3_WAVE: 12, ADD_V3_VOLUME: 13, ADD_V3_DETUNE: 14, ADD_V3_OCTAVE: 15,
  ADD_V4_WAVE: 16, ADD_V4_VOLUME: 17, ADD_V4_DETUNE: 18, ADD_V4_OCTAVE: 19,
  // SUBsynth (20-34)
  SUB_ENABLE: 20, SUB_VOLUME: 21, SUB_PANNING: 22, SUB_OCTAVE: 23, SUB_DETUNE: 24,
  SUB_BANDWIDTH: 25, SUB_BANDWIDTH_SCALE: 26,
  SUB_NUM_HARMONICS: 27, SUB_MAG_TYPE: 28,
  SUB_HARM_1: 29, SUB_HARM_2: 30, SUB_HARM_3: 31, SUB_HARM_4: 32, SUB_HARM_5: 33, SUB_HARM_6: 34,
  // PADsynth (35-44)
  PAD_ENABLE: 35, PAD_VOLUME: 36, PAD_PANNING: 37,
  PAD_BANDWIDTH: 38, PAD_BANDWIDTH_SCALE: 39,
  PAD_PROFILE_WIDTH: 40, PAD_PROFILE_STRETCH: 41,
  PAD_OCTAVE: 42, PAD_DETUNE: 43, PAD_QUALITY: 44,
  // Global filter (45-54)
  FILTER_TYPE: 45, FILTER_CUTOFF: 46, FILTER_RESONANCE: 47,
  FILTER_ENV_AMOUNT: 48, FILTER_VELOCITY: 49,
  FILTER_ATTACK: 50, FILTER_DECAY: 51, FILTER_SUSTAIN: 52, FILTER_RELEASE: 53,
  FILTER_KEY_TRACK: 54,
  // Amp envelope (55-58)
  AMP_ATTACK: 55, AMP_DECAY: 56, AMP_SUSTAIN: 57, AMP_RELEASE: 58,
  // Effects (59-69)
  REVERB_WET: 59, REVERB_SIZE: 60, REVERB_DAMP: 61,
  CHORUS_WET: 62, CHORUS_RATE: 63, CHORUS_DEPTH: 64,
  DISTORTION_WET: 65, DISTORTION_DRIVE: 66, DISTORTION_TYPE: 67,
  EQ_LOW: 68, EQ_HIGH: 69,
} as const;

export const ZYNADDSUBFX_PARAM_NAMES: Record<number, string> = {
  0: 'ADD Enable', 1: 'ADD Volume', 2: 'ADD Pan', 3: 'ADD Detune', 4: 'ADD Octave',
  5: 'V1 Wave', 6: 'V1 Volume', 7: 'V1 Detune',
  8: 'V2 Wave', 9: 'V2 Volume', 10: 'V2 Detune', 11: 'V2 Octave',
  12: 'V3 Wave', 13: 'V3 Volume', 14: 'V3 Detune', 15: 'V3 Octave',
  16: 'V4 Wave', 17: 'V4 Volume', 18: 'V4 Detune', 19: 'V4 Octave',
  20: 'SUB Enable', 21: 'SUB Volume', 22: 'SUB Pan', 23: 'SUB Octave', 24: 'SUB Detune',
  25: 'SUB Bandwidth', 26: 'SUB BW Scale',
  27: 'SUB Harmonics', 28: 'SUB Mag Type',
  29: 'Harm 1', 30: 'Harm 2', 31: 'Harm 3', 32: 'Harm 4', 33: 'Harm 5', 34: 'Harm 6',
  35: 'PAD Enable', 36: 'PAD Volume', 37: 'PAD Pan',
  38: 'PAD Bandwidth', 39: 'PAD BW Scale',
  40: 'PAD Profile W', 41: 'PAD Stretch',
  42: 'PAD Octave', 43: 'PAD Detune', 44: 'PAD Quality',
  45: 'Filter Type', 46: 'Cutoff', 47: 'Resonance',
  48: 'Filt Env', 49: 'Filt Vel',
  50: 'Filt Atk', 51: 'Filt Dec', 52: 'Filt Sus', 53: 'Filt Rel',
  54: 'Key Track',
  55: 'Amp Atk', 56: 'Amp Dec', 57: 'Amp Sus', 58: 'Amp Rel',
  59: 'Reverb', 60: 'Rev Size', 61: 'Rev Damp',
  62: 'Chorus', 63: 'Chr Rate', 64: 'Chr Depth',
  65: 'Distort', 66: 'Drive', 67: 'Dist Type',
  68: 'EQ Low', 69: 'EQ High',
};

export interface ZynAddSubFXConfig {
  // ADDsynth
  addEnable?: number;       // 0/1
  addVolume?: number;       // 0-1
  addPanning?: number;      // -1 to 1
  addDetune?: number;       // -1 to 1
  addOctave?: number;       // -4 to 4
  addVoice1Wave?: number;   // 0-6: sine/tri/saw/square/noise/voice/chirp
  addVoice1Volume?: number; // 0-1
  addVoice1Detune?: number; // -1 to 1
  addVoice2Wave?: number;
  addVoice2Volume?: number;
  addVoice2Detune?: number;
  addVoice2Octave?: number; // -4 to 4
  addVoice3Wave?: number;
  addVoice3Volume?: number;
  addVoice3Detune?: number;
  addVoice3Octave?: number;
  addVoice4Wave?: number;
  addVoice4Volume?: number;
  addVoice4Detune?: number;
  addVoice4Octave?: number;
  // SUBsynth
  subEnable?: number;           // 0/1
  subVolume?: number;           // 0-1
  subPanning?: number;          // -1 to 1
  subOctave?: number;           // -4 to 4
  subDetune?: number;           // -1 to 1
  subBandwidth?: number;        // 0-1
  subBandwidthScale?: number;   // 0-1
  subNumHarmonics?: number;     // 1-64
  subMagType?: number;          // 0-3: linear/dB/-40dB/-60dB
  subHarmonic1?: number;        // 0-1
  subHarmonic2?: number;
  subHarmonic3?: number;
  subHarmonic4?: number;
  subHarmonic5?: number;
  subHarmonic6?: number;
  // PADsynth
  padEnable?: number;           // 0/1
  padVolume?: number;           // 0-1
  padPanning?: number;          // -1 to 1
  padBandwidth?: number;        // 0-1
  padBandwidthScale?: number;   // 0-1
  padProfileWidth?: number;     // 0-1
  padProfileStretch?: number;   // 0-1
  padOctave?: number;           // -4 to 4
  padDetune?: number;           // -1 to 1
  padQuality?: number;          // 0-3
  // Global filter
  filterType?: number;          // 0-5: LP/HP/BP/Notch/Peak/LShelf
  filterCutoff?: number;        // 0-1
  filterResonance?: number;     // 0-1
  filterEnvAmount?: number;     // 0-1
  filterVelocity?: number;      // 0-1
  filterAttack?: number;        // 0-1
  filterDecay?: number;         // 0-1
  filterSustain?: number;       // 0-1
  filterRelease?: number;       // 0-1
  filterKeyTrack?: number;      // 0-1
  // Amp envelope
  ampAttack?: number;           // 0-1
  ampDecay?: number;            // 0-1
  ampSustain?: number;          // 0-1
  ampRelease?: number;          // 0-1
  // Effects
  reverbWet?: number;           // 0-1
  reverbSize?: number;          // 0-1
  reverbDamp?: number;          // 0-1
  chorusWet?: number;           // 0-1
  chorusRate?: number;          // 0-1
  chorusDepth?: number;         // 0-1
  distortionWet?: number;       // 0-1
  distortionDrive?: number;     // 0-1
  distortionType?: number;      // 0-4
  eqLow?: number;               // 0-1
  eqHigh?: number;              // 0-1
}

export const DEFAULT_ZYNADDSUBFX: ZynAddSubFXConfig = {
  // ADDsynth: on, single sine voice
  addEnable: 1, addVolume: 0.8, addPanning: 0, addDetune: 0, addOctave: 0,
  addVoice1Wave: 0, addVoice1Volume: 1.0, addVoice1Detune: 0,
  addVoice2Wave: 0, addVoice2Volume: 0, addVoice2Detune: 0, addVoice2Octave: 0,
  addVoice3Wave: 0, addVoice3Volume: 0, addVoice3Detune: 0, addVoice3Octave: 0,
  addVoice4Wave: 0, addVoice4Volume: 0, addVoice4Detune: 0, addVoice4Octave: 0,
  // SUBsynth: off
  subEnable: 0, subVolume: 0.8, subPanning: 0, subOctave: 0, subDetune: 0,
  subBandwidth: 0.5, subBandwidthScale: 0.5,
  subNumHarmonics: 8, subMagType: 0,
  subHarmonic1: 1.0, subHarmonic2: 0.5, subHarmonic3: 0.3, subHarmonic4: 0.2, subHarmonic5: 0.1, subHarmonic6: 0.05,
  // PADsynth: off
  padEnable: 0, padVolume: 0.8, padPanning: 0,
  padBandwidth: 0.5, padBandwidthScale: 0.5,
  padProfileWidth: 0.5, padProfileStretch: 0.5,
  padOctave: 0, padDetune: 0, padQuality: 1,
  // Global filter: LP, open
  filterType: 0, filterCutoff: 0.8, filterResonance: 0.2,
  filterEnvAmount: 0, filterVelocity: 0.5,
  filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.7, filterRelease: 0.3,
  filterKeyTrack: 0.5,
  // Amp envelope
  ampAttack: 0.01, ampDecay: 0.1, ampSustain: 1.0, ampRelease: 0.5,
  // Effects: all dry
  reverbWet: 0, reverbSize: 0.5, reverbDamp: 0.5,
  chorusWet: 0, chorusRate: 0.3, chorusDepth: 0.3,
  distortionWet: 0, distortionDrive: 0.3, distortionType: 0,
  eqLow: 0.5, eqHigh: 0.5,
};

/**
 * XML preset files extracted from ZynAddSubFX instrument banks.
 * These are loaded natively by ZynAddSubFX's own XML parser — no parameter mapping needed.
 * Maps display name → filename in public/zynaddsubfx/presets/
 */
export const ZYNADDSUBFX_XML_PRESETS: Record<string, string> = {
  // ADDsynth
  'Saw Lead': 'saw-lead.xml',
  'Bass 1': 'bass-1.xml',
  'Analog Bass': 'bass-analog.xml',
  'Organ': 'organ-1.xml',
  'FM Trumpet': 'brass-fm.xml',
  'Plucked': 'plucked-1.xml',
  'Strings': 'strings-saw.xml',
  'Flute': 'flute.xml',
  'Choir': 'choir.xml',
  'Arpeggio': 'arpeggio.xml',
  'Space Synth': 'space-synth.xml',
  'Analog Pad': 'analog-pad.xml',
  // SUBsynth
  'Sine Pad': 'sine-pad.xml',
  'Wind': 'wind.xml',
  'Sub Noise': 'sub-noise.xml',
  // ADD+SUB combos
  'Voiced Saw': 'voiced-saw.xml',
  'Extreme': 'extreme.xml',
  // PADsynth
  'PAD Ronzio': 'pad-ronzio.xml',
  'PAD Asteroide': 'pad-asteroide.xml',
  'PAD Beep': 'pad-beep.xml',
};

/**
 * Legacy flat presets kept for backward compatibility and as the "Init" default.
 * New presets should use XML (ZYNADDSUBFX_XML_PRESETS).
 */
export const ZYNADDSUBFX_PRESETS: Record<string, ZynAddSubFXConfig> = {
  'Init': { ...DEFAULT_ZYNADDSUBFX },
};

const CONFIG_KEYS: (keyof ZynAddSubFXConfig)[] = [
  // ADDsynth (0-19)
  'addEnable', 'addVolume', 'addPanning', 'addDetune', 'addOctave',
  'addVoice1Wave', 'addVoice1Volume', 'addVoice1Detune',
  'addVoice2Wave', 'addVoice2Volume', 'addVoice2Detune', 'addVoice2Octave',
  'addVoice3Wave', 'addVoice3Volume', 'addVoice3Detune', 'addVoice3Octave',
  'addVoice4Wave', 'addVoice4Volume', 'addVoice4Detune', 'addVoice4Octave',
  // SUBsynth (20-34)
  'subEnable', 'subVolume', 'subPanning', 'subOctave', 'subDetune',
  'subBandwidth', 'subBandwidthScale',
  'subNumHarmonics', 'subMagType',
  'subHarmonic1', 'subHarmonic2', 'subHarmonic3', 'subHarmonic4', 'subHarmonic5', 'subHarmonic6',
  // PADsynth (35-44)
  'padEnable', 'padVolume', 'padPanning',
  'padBandwidth', 'padBandwidthScale',
  'padProfileWidth', 'padProfileStretch',
  'padOctave', 'padDetune', 'padQuality',
  // Global filter (45-54)
  'filterType', 'filterCutoff', 'filterResonance',
  'filterEnvAmount', 'filterVelocity',
  'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease',
  'filterKeyTrack',
  // Amp envelope (55-58)
  'ampAttack', 'ampDecay', 'ampSustain', 'ampRelease',
  // Effects (59-69)
  'reverbWet', 'reverbSize', 'reverbDamp',
  'chorusWet', 'chorusRate', 'chorusDepth',
  'distortionWet', 'distortionDrive', 'distortionType',
  'eqLow', 'eqHigh',
];

export class ZynAddSubFXSynthEngine implements DevilboxSynth {
  readonly name = 'ZynAddSubFXSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: ZynAddSubFXConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<ZynAddSubFXConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_ZYNADDSUBFX, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!ZynAddSubFXSynthEngine.isWorkletLoaded) {
        if (!ZynAddSubFXSynthEngine.workletLoadPromise) {
          ZynAddSubFXSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}zynaddsubfx/ZynAddSubFX.worklet.js`
          );
        }
        await ZynAddSubFXSynthEngine.workletLoadPromise;
        ZynAddSubFXSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}zynaddsubfx/ZynAddSubFX.wasm`),
        fetch(`${baseUrl}zynaddsubfx/ZynAddSubFX.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load ZynAddSubFX.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load ZynAddSubFX.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}zynaddsubfx/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)')
        // Stub filesystem syscalls to return errors instead of aborting (FILESYSTEM=0)
        .replace(/function ___syscall_openat\([^)]*\)\s*\{[\s\S]*?abort\([\s\S]*?\);\s*\}/,
          'function ___syscall_openat(dirfd, path, flags, varargs) { return -44; }')
        // Stub _fd_write (printf/fprintf): HEAPU8 is null in worklet context.
        // Must return non-zero (WASI errno) so musl's stdio gives up instead of looping.
        // Returning 8 = WASI_ERRNO_BADF makes writev return -1, breaking the loop.
        .replace(/_fd_write\s*=\s*\(fd,iov,iovcnt,pnum\)\s*=>\s*\{[\s\S]*?HEAPU32\[pnum>>\d+\]\s*=\s*num;return\s+0\s*\}/,
          '_fd_write=(fd,iov,iovcnt,pnum)=>{return 8}');

      this._worklet = new AudioWorkletNode(rawContext, 'zynaddsubfx-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          if (this.pendingXmlPreset) {
            const presetName = this.pendingXmlPreset;
            this.pendingXmlPreset = null;
            this.loadPresetXML(presetName);
          } else {
            this.sendConfig(this.config);
          }
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'presetError') {
          console.error('[ZynAddSubFX] Preset load error:', event.data.error);
        } else if (event.data.type === 'error') {
          console.error('[ZynAddSubFX] error:', event.data.error);
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
      console.error('Failed to initialize ZynAddSubFX:', error);
      throw error;
    }
  }

  private sendConfig(config: ZynAddSubFXConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    // Auto-enable voices 1-3 when their volume > 0
    // Voice 0 is always enabled by default in zasfx_create
    const voiceEnables = [
      { vol: config.addVoice2Volume, bridgeIdx: 130 }, // P_ADDV1_ENABLE
      { vol: config.addVoice3Volume, bridgeIdx: 140 }, // P_ADDV2_ENABLE
      { vol: config.addVoice4Volume, bridgeIdx: 150 }, // P_ADDV3_ENABLE
    ];
    for (const ve of voiceEnables) {
      this._worklet.port.postMessage({
        type: 'setParamRaw', index: ve.bridgeIdx, value: ((ve.vol ?? 0) > 0) ? 127 : 0
      });
    }
    // Ensure amp envelope forced release is enabled (without this, noteOff may be ignored)
    // P_AMPENV_FORCED_RELEASE = 86, value > 63 = enabled
    this._worklet.port.postMessage({ type: 'setParamRaw', index: 86, value: 127 });
    // Send all config params
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const value = config[CONFIG_KEYS[i]];
      if (value !== undefined) {
        this._worklet.port.postMessage({ type: 'setParam', index: i, value });
      }
    }
    // Trigger applyparameters if PADsynth is enabled (rebuilds wavetables)
    if (config.padEnable) {
      this._worklet.port.postMessage({ type: 'setParamRaw', index: 200, value: 0 });
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
      // Clear pending notes that haven't played yet — avoids stuck notes
      // when noteOff arrives before WASM init completes
      if (frequency !== undefined) {
        const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
        this.pendingNotes = this.pendingNotes.filter(p => p.note !== note);
      } else {
        this.pendingNotes = [];
      }
      return this;
    }
    // Always use allNotesOff — individual noteOff has note-matching issues in the WASM bridge
    this._worklet.port.postMessage({ type: 'allNotesOff' });
    return this;
  }

  set(param: string, value: number): void {
    const index = CONFIG_KEYS.indexOf(param as keyof ZynAddSubFXConfig);
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

  // Cache of fetched XML preset data
  private static xmlCache: Map<string, string> = new Map();
  private pendingXmlPreset: string | null = null;

  private async loadPresetXML(name: string): Promise<void> {
    const filename = ZYNADDSUBFX_XML_PRESETS[name];
    if (!filename) return;

    let xml = ZynAddSubFXSynthEngine.xmlCache.get(filename);
    if (!xml) {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const resp = await fetch(`${baseUrl}zynaddsubfx/presets/${filename}`);
      if (!resp.ok) {
        console.error(`[ZynAddSubFX] Failed to fetch preset ${filename}: ${resp.status}`);
        return;
      }
      xml = await resp.text();
      ZynAddSubFXSynthEngine.xmlCache.set(filename, xml);
    }

    if (this._worklet && this.isInitialized) {
      // Encode XML to UTF-8 in main thread (TextEncoder not available in AudioWorklet)
      const xmlBytes = new TextEncoder().encode(xml);
      this._worklet.port.postMessage({ type: 'loadPresetXML', xmlBytes, name }, [xmlBytes.buffer]);
      this.pendingXmlPreset = null;
    } else {
      // pendingXmlPreset already set in setPreset()
    }
  }

  setPreset(name: string): void {
    // Try XML preset first (native ZynAddSubFX format)
    if (ZYNADDSUBFX_XML_PRESETS[name]) {
      this.pendingXmlPreset = name;
      this.loadPresetXML(name);
      return;
    }
    // Fall back to flat config preset
    const preset = ZYNADDSUBFX_PRESETS[name];
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

export class ZynAddSubFXSynthImpl extends ZynAddSubFXSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<ZynAddSubFXConfig>): void {
    // Only send params that actually changed — avoids flooding the worklet
    // and overwriting WASM state with stale defaults (same pattern as MoniqueSynth)
    const prev = (this as any).config as Record<string, number | undefined>;
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number' && value !== prev[key]) {
        this.set(key, value);
      }
    }
  }
}
