
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * uPD931 Parameter IDs (matching C++ enum)
 */
const UPD931Param = {
  VOLUME: 0,
  WAVE_A: 1,
  WAVE_B: 2,
  MIRROR: 3,
  INVERT: 4,
  MODE_A: 5,
  MODE_B: 6,
  KEY_SCALING: 7,
} as const;

/**
 * uPD931 Presets (Casio keyboard voice programs)
 */
export const UPD931Preset = {
  ORGAN: 0,       // Warm dual-wave organ tone
  PIANO: 1,       // Bright attack crossfading to warm body
  STRINGS: 2,     // Slow attack, shimmer with mirror mode
  BRASS: 3,       // Bright with harmonic accent
  REED: 4,        // Nasal character with invert mode
  BELL: 5,        // Instant attack, long decay, inharmonic
  BASS: 6,        // Deep fundamental
  SYNTH_LEAD: 7,  // Retrigger mandolin effect
} as const;

/**
 * uPD931 Cycle Modes (controls which cycles a waveform plays)
 */
export const UPD931CycleMode = {
  ALWAYS: 0,       // All 4 cycles (0xF)
  ALTERNATING: 1,  // On, off, on, off (0x5)
  ONCE: 2,         // 1 of 4 cycles (0x1)
  TWICE: 3,        // 2 of 4 cycles (0x3)
} as const;

/**
 * uPD931 (NEC/Casio) - Dual Waveform Keyboard Synthesizer (WASM)
 *
 * Step-based waveform accumulation synthesis from Casio keyboards (1981).
 * Compiled to WebAssembly for authentic early Casio keyboard sound.
 *
 * The uPD931 creates sound using two programmable 16-sample waveform tables
 * (Wave A and Wave B) that drive a step accumulator. Each table position
 * contains a 4-bit value that maps to a step size (+8 to -8). The accumulator
 * adds these steps to create complex cumulative waveforms, producing the
 * warm, characterful sound of early 1980s Casio keyboards.
 *
 * Features:
 * - 8-voice polyphony (8 independent dual-oscillator voices)
 * - Dual waveform tables (Wave A + Wave B) with step accumulation
 * - Mirror mode: play waveform backwards on alternate cycles
 * - Invert mode: negate steps on alternate cycles
 * - Cycle masking: 4 modes controlling which cycles produce output
 * - 5-stage envelope: Attack1, Attack2, Decay1, Decay2, Release
 * - Attack2 crossfade: Wave A fades in while Wave B fades out
 * - Key scaling: waveform narrowing based on octave
 * - Retrigger: mandolin effect re-attacks during decay
 * - Sustain and reverb (extended decay tail)
 *
 * Used in: Casio CT-8000, Casio MT-65 (1981)
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class UPD931Synth extends MAMEBaseSynth {
  readonly name = 'UPD931Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'UPD931';
  protected readonly workletFile = 'UPD931.worklet.js';
  protected readonly processorName = 'upd931-processor';

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
    this.workletNode.port.postMessage({ type: 'noteOff', note: 0 });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq,
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
  // UPD931-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Load a preset (0-7). Use UPD931Preset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  /** Set Wave A pattern index (0-7, selects from preset waveform tables) */
  setWaveA(index: number): void {
    this.setParameterById(UPD931Param.WAVE_A, index);
  }

  /** Set Wave B pattern index (0-7, selects from preset waveform tables) */
  setWaveB(index: number): void {
    this.setParameterById(UPD931Param.WAVE_B, index);
  }

  /** Enable/disable mirror mode (plays waveform backwards on alternate cycles) */
  setMirror(enabled: boolean): void {
    this.setParameterById(UPD931Param.MIRROR, enabled ? 1 : 0);
  }

  /** Enable/disable invert mode (negates steps on alternate cycles) */
  setInvert(enabled: boolean): void {
    this.setParameterById(UPD931Param.INVERT, enabled ? 1 : 0);
  }

  /** Set cycle mode for Wave A (0-3). Use UPD931CycleMode constants. */
  setModeA(mode: number): void {
    this.setParameterById(UPD931Param.MODE_A, mode);
  }

  /** Set cycle mode for Wave B (0-3). Use UPD931CycleMode constants. */
  setModeB(mode: number): void {
    this.setParameterById(UPD931Param.MODE_B, mode);
  }

  /** Enable/disable key scaling (waveform narrowing based on octave) */
  setKeyScaling(enabled: boolean): void {
    this.setParameterById(UPD931Param.KEY_SCALING, enabled ? 1 : 0);
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
      volume: UPD931Param.VOLUME,
      wave_a: UPD931Param.WAVE_A,
      wave_b: UPD931Param.WAVE_B,
      mirror: UPD931Param.MIRROR,
      invert: UPD931Param.INVERT,
      mode_a: UPD931Param.MODE_A,
      mode_b: UPD931Param.MODE_B,
      key_scaling: UPD931Param.KEY_SCALING,
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

export default UPD931Synth;
