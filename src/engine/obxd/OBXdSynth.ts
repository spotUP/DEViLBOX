/**
 * OBXdSynth.ts - Oberheim OB-X Synthesizer wrapper for DEViLBOX
 * Provides a Tone.js compatible interface to the OB-Xd WASM engine
 *
 * Features:
 * - 8-voice polyphonic analog-modeled synthesis
 * - Dual oscillators with sync and ring mod
 * - Classic Oberheim filter emulation
 * - Comprehensive modulation with LFO and envelopes
 */

import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';

/**
 * OB-Xd Parameter IDs (matches C++ enum)
 * Using as const object for erasableSyntaxOnly compatibility
 */
export const OBXdParam = {
  // Oscillator 1
  OSC1_WAVEFORM: 0,
  OSC1_OCTAVE: 1,
  OSC1_DETUNE: 2,
  OSC1_PW: 3,
  OSC1_LEVEL: 4,

  // Oscillator 2
  OSC2_WAVEFORM: 5,
  OSC2_OCTAVE: 6,
  OSC2_DETUNE: 7,
  OSC2_PW: 8,
  OSC2_LEVEL: 9,

  // Oscillator Mix
  OSC_MIX: 10,
  OSC_SYNC: 11,
  OSC_XOR: 12,

  // Filter
  FILTER_CUTOFF: 13,
  FILTER_RESONANCE: 14,
  FILTER_TYPE: 15,
  FILTER_ENV_AMOUNT: 16,
  FILTER_KEY_TRACK: 17,
  FILTER_VELOCITY: 18,

  // Filter Envelope
  FILTER_ATTACK: 19,
  FILTER_DECAY: 20,
  FILTER_SUSTAIN: 21,
  FILTER_RELEASE: 22,

  // Amp Envelope
  AMP_ATTACK: 23,
  AMP_DECAY: 24,
  AMP_SUSTAIN: 25,
  AMP_RELEASE: 26,

  // LFO
  LFO_RATE: 27,
  LFO_WAVEFORM: 28,
  LFO_DELAY: 29,
  LFO_OSC_AMOUNT: 30,
  LFO_FILTER_AMOUNT: 31,
  LFO_AMP_AMOUNT: 32,
  LFO_PW_AMOUNT: 33,

  // Global
  MASTER_VOLUME: 34,
  VOICES: 35,
  UNISON: 36,
  UNISON_DETUNE: 37,
  PORTAMENTO: 38,
  PAN_SPREAD: 39,
  VELOCITY_SENSITIVITY: 40,

  // Extended
  NOISE_LEVEL: 41,
  SUB_OSC_LEVEL: 42,
  SUB_OSC_OCTAVE: 43,
  DRIFT: 44,
} as const;
export type OBXdParamType = (typeof OBXdParam)[keyof typeof OBXdParam];

/**
 * Waveform types
 */
export const OBXdWaveform = {
  SAW: 0,
  PULSE: 1,
  TRIANGLE: 2,
  NOISE: 3,
} as const;
export type OBXdWaveformType = (typeof OBXdWaveform)[keyof typeof OBXdWaveform];

/**
 * LFO waveform types
 */
export const OBXdLFOWave = {
  SINE: 0,
  TRIANGLE: 1,
  SAW: 2,
  SQUARE: 3,
  SAMPLE_HOLD: 4,
} as const;
export type OBXdLFOWaveType = (typeof OBXdLFOWave)[keyof typeof OBXdLFOWave];

/**
 * Configuration interface for OB-Xd synth
 */
export interface OBXdConfig {
  // Oscillator 1
  osc1Waveform?: OBXdWaveformType;
  osc1Octave?: number;      // -2 to +2
  osc1Detune?: number;      // -1 to +1 semitones
  osc1PulseWidth?: number;  // 0-1
  osc1Level?: number;       // 0-1

  // Oscillator 2
  osc2Waveform?: OBXdWaveformType;
  osc2Octave?: number;
  osc2Detune?: number;
  osc2PulseWidth?: number;
  osc2Level?: number;

  // Oscillator options
  oscSync?: boolean;
  oscXor?: boolean;         // Ring mod

  // Filter
  filterCutoff?: number;    // 0-1 (maps to 20-20000 Hz)
  filterResonance?: number; // 0-1
  filterType?: number;      // 0=LP24, 1=LP12, 2=HP, 3=BP, 4=Notch
  filterEnvAmount?: number; // 0-1
  filterKeyTrack?: number;  // 0-1
  filterVelocity?: number;  // 0-1

  // Filter envelope
  filterAttack?: number;    // 0-1 (seconds-ish)
  filterDecay?: number;
  filterSustain?: number;
  filterRelease?: number;

  // Amp envelope
  ampAttack?: number;
  ampDecay?: number;
  ampSustain?: number;
  ampRelease?: number;

  // LFO
  lfoRate?: number;         // 0-1 (maps to 0.1-20 Hz)
  lfoWaveform?: OBXdLFOWaveType;
  lfoDelay?: number;        // 0-1
  lfoOscAmount?: number;
  lfoFilterAmount?: number;
  lfoAmpAmount?: number;    // 0-1
  lfoPwAmount?: number;

  // Global
  masterVolume?: number;
  voices?: number;          // 1-8
  unison?: boolean;
  unisonDetune?: number;    // 0-1
  portamento?: number;      // 0-1 (glide time)
  velocitySensitivity?: number;
  panSpread?: number;

  // Extended
  noiseLevel?: number;      // 0-1
  subOscLevel?: number;     // 0-1
  subOscOctave?: number;    // -1 or -2
  drift?: number;           // 0-1 (analog drift)
}

/**
 * Classic OB-X style presets
 */
export const OBXD_PRESETS: Record<string, Partial<OBXdConfig>> = {
  'Classic Brass': {
    osc1Waveform: OBXdWaveform.SAW,
    osc2Waveform: OBXdWaveform.SAW,
    osc2Detune: 0.05,
    osc1Level: 1,
    osc2Level: 0.8,
    filterCutoff: 0.4,
    filterResonance: 0.2,
    filterEnvAmount: 0.6,
    filterAttack: 0.1,
    filterDecay: 0.3,
    filterSustain: 0.4,
    filterRelease: 0.2,
    ampAttack: 0.05,
    ampDecay: 0.1,
    ampSustain: 0.8,
    ampRelease: 0.3,
  },
  'Fat Lead': {
    osc1Waveform: OBXdWaveform.SAW,
    osc2Waveform: OBXdWaveform.SAW,
    osc2Octave: -1,
    osc2Detune: 0.1,
    osc1Level: 1,
    osc2Level: 1,
    filterCutoff: 0.6,
    filterResonance: 0.4,
    filterEnvAmount: 0.3,
    lfoRate: 0.3,
    lfoOscAmount: 0.1,
  },
  'Pulse Pad': {
    osc1Waveform: OBXdWaveform.PULSE,
    osc2Waveform: OBXdWaveform.PULSE,
    osc1PulseWidth: 0.3,
    osc2PulseWidth: 0.7,
    osc2Detune: 0.02,
    filterCutoff: 0.3,
    filterResonance: 0.1,
    filterEnvAmount: 0.2,
    ampAttack: 0.5,
    ampDecay: 0.5,
    ampSustain: 0.7,
    ampRelease: 1.0,
    lfoRate: 0.15,
    lfoPwAmount: 0.3,
  },
  'Sync Lead': {
    osc1Waveform: OBXdWaveform.SAW,
    osc2Waveform: OBXdWaveform.SAW,
    osc2Octave: 1,
    oscSync: true,
    filterCutoff: 0.5,
    filterResonance: 0.3,
    filterEnvAmount: 0.5,
  },
  'Init': {
    osc1Waveform: OBXdWaveform.SAW,
    osc1Level: 1,
    osc2Level: 0,
    filterCutoff: 0.7,
    filterResonance: 0.3,
    ampAttack: 0.01,
    ampDecay: 0.2,
    ampSustain: 0.7,
    ampRelease: 0.3,
  },
};

/**
 * OBXdSynth - Oberheim OB-X Synthesizer
 */
export class OBXdSynth extends Tone.ToneAudioNode {
  readonly name = 'OBXdSynth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private _worklet: AudioWorkletNode | null = null;
  private config: OBXdConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  // Static initialization tracking
  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  private _initPromise: Promise<void>;

  constructor(config: Partial<OBXdConfig> = {}) {
    super();
    this.output = new Tone.Gain(1);

    // Apply defaults
    this.config = {
      osc1Waveform: OBXdWaveform.SAW,
      osc1Octave: 0,
      osc1Level: 1,
      osc1PulseWidth: 0.5,
      osc2Waveform: OBXdWaveform.SAW,
      osc2Octave: 0,
      osc2Detune: 0.1,
      osc2Level: 0.7,
      osc2PulseWidth: 0.5,
      filterCutoff: 0.7,
      filterResonance: 0.3,
      filterEnvAmount: 0.5,
      filterAttack: 0.01,
      filterDecay: 0.3,
      filterSustain: 0.3,
      filterRelease: 0.3,
      ampAttack: 0.01,
      ampDecay: 0.2,
      ampSustain: 0.7,
      ampRelease: 0.3,
      lfoRate: 0.2,
      lfoWaveform: OBXdLFOWave.SINE,
      masterVolume: 0.7,
      velocitySensitivity: 0.5,
      panSpread: 0.3,
      ...config,
    };

    // Start initialization and store promise for ensureInitialized()
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Initialize the WASM engine and AudioWorklet
   */
  private async initialize(): Promise<void> {
    try {
      // Get native AudioContext from Tone.js context
      const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module (once per session)
      if (!OBXdSynth.isWorkletLoaded) {
        if (!OBXdSynth.workletLoadPromise) {
          OBXdSynth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}obxd/OBXd.worklet.js`
          );
        }
        await OBXdSynth.workletLoadPromise;
        OBXdSynth.isWorkletLoaded = true;
      }

      // Fetch WASM binary and JS code in parallel
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}obxd/OBXd.wasm`),
        fetch(`${baseUrl}obxd/OBXd.js`)
      ]);

      if (!wasmResponse.ok) {
        throw new Error(`Failed to load OBXd.wasm: ${wasmResponse.status}`);
      }
      if (!jsResponse.ok) {
        throw new Error(`Failed to load OBXd.js: ${jsResponse.status}`);
      }

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      // Preprocess JS code for AudioWorklet new Function() compatibility:
      // 1. Replace import.meta.url (not available in Function constructor scope)
      // 2. Remove ES module export statement (invalid syntax in Function body)
      // 3. Strip Node.js-specific dynamic import block (fails in worklet context)
      const jsCode = jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}obxd/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      // Create worklet node using Tone.js's createAudioWorkletNode (standardized-audio-context)
      this._worklet = toneCreateAudioWorkletNode(rawContext, 'obxd-processor');

      // Set up message handler
      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;

          // Apply initial config
          this.applyConfig(this.config);

          // Process pending notes
          for (const { note, velocity } of this.pendingNotes) {
            this.triggerAttack(note, undefined, velocity / 127);
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('OBXd error:', event.data.error);
        }
      };

      // Initialize WASM engine with binary and JS code
      this._worklet.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode
      });

      // Connect worklet to Tone.js output - use the input property which is the native GainNode
      const targetNode = this.output.input as AudioNode;
      this._worklet.connect(targetNode);

      // CRITICAL: Connect through silent keepalive to destination to force process() calls
      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch (_e) { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize OBXdSynth:', error);
      throw error;
    }
  }

  /**
   * Apply configuration to the synth
   */
  private applyConfig(config: OBXdConfig): void {
    if (!this._worklet || !this.isInitialized) return;

    // Map config properties to parameter IDs
    const paramMapping: Array<[keyof OBXdConfig, OBXdParamType]> = [
      // Oscillator 1
      ['osc1Waveform', OBXdParam.OSC1_WAVEFORM],
      ['osc1Octave', OBXdParam.OSC1_OCTAVE],
      ['osc1Detune', OBXdParam.OSC1_DETUNE],
      ['osc1PulseWidth', OBXdParam.OSC1_PW],
      ['osc1Level', OBXdParam.OSC1_LEVEL],
      // Oscillator 2
      ['osc2Waveform', OBXdParam.OSC2_WAVEFORM],
      ['osc2Octave', OBXdParam.OSC2_OCTAVE],
      ['osc2Detune', OBXdParam.OSC2_DETUNE],
      ['osc2PulseWidth', OBXdParam.OSC2_PW],
      ['osc2Level', OBXdParam.OSC2_LEVEL],
      // Filter
      ['filterCutoff', OBXdParam.FILTER_CUTOFF],
      ['filterResonance', OBXdParam.FILTER_RESONANCE],
      ['filterType', OBXdParam.FILTER_TYPE],
      ['filterEnvAmount', OBXdParam.FILTER_ENV_AMOUNT],
      ['filterKeyTrack', OBXdParam.FILTER_KEY_TRACK],
      ['filterVelocity', OBXdParam.FILTER_VELOCITY],
      // Filter Envelope
      ['filterAttack', OBXdParam.FILTER_ATTACK],
      ['filterDecay', OBXdParam.FILTER_DECAY],
      ['filterSustain', OBXdParam.FILTER_SUSTAIN],
      ['filterRelease', OBXdParam.FILTER_RELEASE],
      // Amp Envelope
      ['ampAttack', OBXdParam.AMP_ATTACK],
      ['ampDecay', OBXdParam.AMP_DECAY],
      ['ampSustain', OBXdParam.AMP_SUSTAIN],
      ['ampRelease', OBXdParam.AMP_RELEASE],
      // LFO
      ['lfoRate', OBXdParam.LFO_RATE],
      ['lfoWaveform', OBXdParam.LFO_WAVEFORM],
      ['lfoDelay', OBXdParam.LFO_DELAY],
      ['lfoOscAmount', OBXdParam.LFO_OSC_AMOUNT],
      ['lfoFilterAmount', OBXdParam.LFO_FILTER_AMOUNT],
      ['lfoAmpAmount', OBXdParam.LFO_AMP_AMOUNT],
      ['lfoPwAmount', OBXdParam.LFO_PW_AMOUNT],
      // Global
      ['masterVolume', OBXdParam.MASTER_VOLUME],
      ['voices', OBXdParam.VOICES],
      ['unisonDetune', OBXdParam.UNISON_DETUNE],
      ['portamento', OBXdParam.PORTAMENTO],
      ['velocitySensitivity', OBXdParam.VELOCITY_SENSITIVITY],
      ['panSpread', OBXdParam.PAN_SPREAD],
      // Extended
      ['noiseLevel', OBXdParam.NOISE_LEVEL],
      ['subOscLevel', OBXdParam.SUB_OSC_LEVEL],
      ['subOscOctave', OBXdParam.SUB_OSC_OCTAVE],
      ['drift', OBXdParam.DRIFT],
    ];

    for (const [key, paramId] of paramMapping) {
      const value = config[key];
      if (value !== undefined) {
        this.setParameter(paramId, value as number);
      }
    }

    // Handle boolean params
    if (config.oscSync !== undefined) {
      this.setParameter(OBXdParam.OSC_SYNC, config.oscSync ? 1 : 0);
    }
    if (config.oscXor !== undefined) {
      this.setParameter(OBXdParam.OSC_XOR, config.oscXor ? 1 : 0);
    }
    if (config.unison !== undefined) {
      this.setParameter(OBXdParam.UNISON, config.unison ? 1 : 0);
    }
  }

  /**
   * Set a parameter value
   */
  setParameter(paramId: OBXdParamType | number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'parameter',
      paramId,
      value,
    });
  }

  /**
   * Load a preset by name
   */
  loadPreset(name: keyof typeof OBXD_PRESETS): void {
    const preset = OBXD_PRESETS[name];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig(this.config);
    }
  }

  /**
   * Set filter cutoff (0-1)
   */
  setCutoff(value: number): void {
    this.config.filterCutoff = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.FILTER_CUTOFF, this.config.filterCutoff);
  }

  /**
   * Set filter resonance (0-1)
   */
  setResonance(value: number): void {
    this.config.filterResonance = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.FILTER_RESONANCE, this.config.filterResonance);
  }

  /**
   * Set filter envelope amount (0-1)
   */
  setFilterEnvAmount(value: number): void {
    this.config.filterEnvAmount = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.FILTER_ENV_AMOUNT, this.config.filterEnvAmount);
  }

  /**
   * Set oscillator 1 waveform
   */
  setOsc1Waveform(waveform: OBXdWaveformType): void {
    this.config.osc1Waveform = waveform;
    this.setParameter(OBXdParam.OSC1_WAVEFORM, waveform);
  }

  /**
   * Set oscillator 2 waveform
   */
  setOsc2Waveform(waveform: OBXdWaveformType): void {
    this.config.osc2Waveform = waveform;
    this.setParameter(OBXdParam.OSC2_WAVEFORM, waveform);
  }

  /**
   * Set oscillator 2 detune (-1 to +1)
   */
  setOsc2Detune(value: number): void {
    this.config.osc2Detune = Math.max(-1, Math.min(1, value));
    this.setParameter(OBXdParam.OSC2_DETUNE, this.config.osc2Detune);
  }

  /**
   * Set LFO rate (0-1)
   */
  setLfoRate(value: number): void {
    this.config.lfoRate = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.LFO_RATE, this.config.lfoRate);
  }

  /**
   * Set LFO to oscillator modulation amount (0-1)
   */
  setLfoOscAmount(value: number): void {
    this.config.lfoOscAmount = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.LFO_OSC_AMOUNT, this.config.lfoOscAmount);
  }

  /**
   * Set LFO to filter modulation amount (0-1)
   */
  setLfoFilterAmount(value: number): void {
    this.config.lfoFilterAmount = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.LFO_FILTER_AMOUNT, this.config.lfoFilterAmount);
  }

  /**
   * Set portamento/glide time (0-1)
   */
  setPortamento(value: number): void {
    this.config.portamento = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.PORTAMENTO, this.config.portamento);
  }

  /**
   * Set unison mode
   */
  setUnison(enabled: boolean): void {
    this.config.unison = enabled;
    this.setParameter(OBXdParam.UNISON, enabled ? 1 : 0);
  }

  /**
   * Set unison detune (0-1)
   */
  setUnisonDetune(value: number): void {
    this.config.unisonDetune = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.UNISON_DETUNE, this.config.unisonDetune);
  }

  /**
   * Set master volume (0-1)
   */
  setVolume(value: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.MASTER_VOLUME, this.config.masterVolume);
  }

  /**
   * Trigger a note
   */
  triggerAttack(
    frequency: number | string,
    _time?: number,
    velocity = 1
  ): this {
    const midiNote =
      typeof frequency === 'string'
        ? Tone.Frequency(frequency).toMidi()
        : Tone.Frequency(frequency, 'hz').toMidi();

    const vel = Math.round(velocity * 127);

    if (!this.isInitialized) {
      this.pendingNotes.push({ note: midiNote, velocity: vel });
      return this;
    }

    this._worklet?.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: vel,
    });

    return this;
  }

  /**
   * Release a note
   */
  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet) return this;

    if (frequency !== undefined) {
      const midiNote =
        typeof frequency === 'string'
          ? Tone.Frequency(frequency).toMidi()
          : Tone.Frequency(frequency, 'hz').toMidi();

      this._worklet.port.postMessage({
        type: 'noteOff',
        note: midiNote,
      });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }

    return this;
  }

  /**
   * Send MIDI Control Change
   */
  controlChange(cc: number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'controlChange',
      cc,
      value,
    });
  }

  /**
   * Send pitch bend (0-16383, 8192 = center)
   */
  pitchBend(value: number): void {
    this._worklet?.port.postMessage({
      type: 'pitchBend',
      value,
    });
  }

  /**
   * Clean up resources
   */
  dispose(): this {
    this._worklet?.port.postMessage({ type: 'allNotesOff' });
    this._worklet?.disconnect();
    this._worklet = null;
    this.output.dispose();
    return this;
  }
}

export default OBXdSynth;
