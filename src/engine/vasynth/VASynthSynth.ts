import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { freqToVASynth } from '@engine/mame/MAMEPitchUtils';

/**
 * VASynth Parameter IDs (matching C++ enum)
 */
const VASynthParam = {
  VOLUME: 0,
  OSC1_WAVE: 1,
  OSC2_WAVE: 2,
  OSC_MIX: 3,
  OSC2_DETUNE: 4,
  FILTER_CUTOFF: 5,
  FILTER_RES: 6,
  FILTER_ENV_DEPTH: 7,
} as const;

/**
 * VASynth Presets
 */
export const VASynthPreset = {
  BASS: 0,      // Deep saw bass with filter sweep
  LEAD: 1,      // Bright square lead
  PAD: 2,       // Lush detuned pad
  BRASS: 3,     // Punchy brass stab
  STRINGS: 4,   // Slow evolving strings
  PLUCK: 5,     // Short percussive pluck
  KEYS: 6,      // Electric piano style
  FX: 7,        // Resonant sweep
} as const;

/**
 * VASynth Waveforms
 */
export const VASynthWaveform = {
  SAW: 0,
  SQUARE: 1,
  TRIANGLE: 2,
  SINE: 3,
  PULSE: 4,
} as const;

/**
 * VASynth - Virtual Analog Subtractive Synthesizer (WASM)
 *
 * Combines MAME Virtual Analog building blocks (va_eg, va_vca, va_vcf)
 * into a complete subtractive synthesizer. Compiled to WebAssembly for
 * authentic analog-style synthesis with real-time filter modulation.
 *
 * Signal chain: OSC1 + OSC2 → 4th-order resonant LPF → VCA → Output
 *
 * The 4th-order lowpass filter uses Zavalishin's TPT (Topology Preserving
 * Transform) discretization with Oberheim variation, producing authentic
 * analog-style resonance with tanh() saturation.
 *
 * Features:
 * - 2 oscillators per voice (saw, square, triangle, sine, pulse)
 * - Oscillator mix and detune controls
 * - 4th-order resonant lowpass filter (TPT ladder, self-oscillation above res=4)
 * - tanh() saturation for analog warmth
 * - 2 RC envelopes per voice (amplitude + filter cutoff modulation)
 * - Filter envelope depth control
 * - 8 presets: Bass, Lead, Pad, Brass, Strings, Pluck, Keys, FX
 * - 8-voice polyphony, MIDI-controlled
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class VASynthSynth extends MAMEBaseSynth {
  readonly name = 'VASynthSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'VASynth';
  protected readonly workletFile = 'VASynth.worklet.js';
  protected readonly processorName = 'vasynth-processor';

  constructor() {
    super();
    this.initSynth();
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
    });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    const vaFreq = freqToVASynth(freq);

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq: vaFreq,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setVolume',
      value: volume,
    });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
    });
  }

  // ===========================================================================
  // VASynth-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Load a preset (0-7). Use VASynthPreset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  /** Set oscillator 1 waveform (0-4). Use VASynthWaveform constants. */
  setOsc1Wave(waveform: number): void {
    this.setParameterById(VASynthParam.OSC1_WAVE, waveform);
  }

  /** Set oscillator 2 waveform (0-4). Use VASynthWaveform constants. */
  setOsc2Wave(waveform: number): void {
    this.setParameterById(VASynthParam.OSC2_WAVE, waveform);
  }

  /** Set oscillator mix (0 = OSC1 only, 1 = OSC2 only) */
  setOscMix(mix: number): void {
    this.setParameterById(VASynthParam.OSC_MIX, mix);
  }

  /** Set oscillator 2 detune in semitones (-12 to +12) */
  setOsc2Detune(semitones: number): void {
    this.setParameterById(VASynthParam.OSC2_DETUNE, semitones);
  }

  /** Set filter cutoff frequency in Hz (20-20000) */
  setFilterCutoff(hz: number): void {
    this.setParameterById(VASynthParam.FILTER_CUTOFF, hz);
  }

  /** Set filter resonance (0-4.5, self-oscillation above 4) */
  setFilterResonance(resonance: number): void {
    this.setParameterById(VASynthParam.FILTER_RES, resonance);
  }

  /** Set filter envelope depth (0-1) */
  setFilterEnvDepth(depth: number): void {
    this.setParameterById(VASynthParam.FILTER_ENV_DEPTH, depth);
  }

  // ===========================================================================
  // MIDI CC and pitch bend
  // ===========================================================================

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  // ===========================================================================
  // Parameter Interface
  // ===========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      volume: VASynthParam.VOLUME,
      osc1_wave: VASynthParam.OSC1_WAVE,
      osc2_wave: VASynthParam.OSC2_WAVE,
      osc_mix: VASynthParam.OSC_MIX,
      osc2_detune: VASynthParam.OSC2_DETUNE,
      filter_cutoff: VASynthParam.FILTER_CUTOFF,
      filter_res: VASynthParam.FILTER_RES,
      filter_env_depth: VASynthParam.FILTER_ENV_DEPTH,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

export default VASynthSynth;
