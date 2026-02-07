import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * ASC Parameter IDs (matching C++ enum)
 */
const ASCParam = {
  VOLUME: 0,
  WAVEFORM: 1,
  ATTACK: 2,
  DECAY: 3,
  SUSTAIN: 4,
  RELEASE: 5,
  STEREO_WIDTH: 6,
  DETUNE: 7,
} as const;

/**
 * ASC Presets (wavetable voice programs)
 */
export const ASCPreset = {
  SINE_PAD: 0,       // Smooth, sustained sine pad
  TRIANGLE_LEAD: 1,  // Snappy triangle lead
  SAW_BASS: 2,       // Punchy sawtooth bass
  SQUARE_RETRO: 3,   // 8-bit retro square
  PULSE_NASAL: 4,    // Thin nasal pulse
  ORGAN: 5,          // Sustained organ tone
  PIANO: 6,          // Percussive piano-like
  STRINGS: 7,        // Slow attack strings
} as const;

/**
 * ASC (Apple Sound Chip) - 4-Voice Wavetable Synthesizer (WASM)
 *
 * 512-sample wavetable synthesis with 9.15 fixed-point phase accumulator.
 * Compiled to WebAssembly for authentic late-80s Macintosh sound.
 *
 * The ASC (344S0063) was used in Macintosh SE, II, LC, and Classic computers
 * (1987-1993). It has two modes: FIFO (for streaming audio from CPU) and
 * wavetable (for autonomous 4-voice synthesis). We implement the wavetable
 * mode with extended 8-voice polyphony and ADSR envelopes.
 *
 * Features:
 * - 8-voice polyphony (extended from original 4)
 * - 512-sample, 8-bit wavetables (matching ASC hardware)
 * - 9.15 fixed-point phase accumulator with linear interpolation
 * - 8 preset wavetables: sine, triangle, saw, square, pulse, organ, piano, strings
 * - ADSR envelope (original relied on CPU-driven volume)
 * - Stereo panning with configurable width
 * - Optional detune for chorus effect
 * - 22257 Hz native sample rate (Mac standard), resampled to output rate
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, wavetable, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class ASCSynth extends MAMEBaseSynth {
  readonly name = 'ASCSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'ASC';
  protected readonly workletFile = 'ASC.worklet.js';
  protected readonly processorName = 'asc-processor';

  // ASC-specific state

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

    // ASC uses 9.15 fixed-point phase increment
    // We send frequency directly and let worklet calculate
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

    // Convert 0-255 to stereo width (-1 to 1)
    const width = ((pan - 128) / 128) * 0.5;

    this.workletNode.port.postMessage({
      type: 'setPanning',
      width,
    });
  }

  protected writeWavetableSelect(index: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setWaveform',
      value: index,
    });
  }

  // ===========================================================================
  // ASC-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Load a preset (0-7). Use ASCPreset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  /** Set waveform (0-7: sine, triangle, saw, square, pulse, organ, piano, strings) */
  setWaveform(index: number): void {
    this.writeWavetableSelect(index);
  }

  /** Set attack rate (0.0001-0.1) */
  setAttack(rate: number): void {
    this.setParameterById(ASCParam.ATTACK, rate);
  }

  /** Set decay rate (0.0001-0.1) */
  setDecay(rate: number): void {
    this.setParameterById(ASCParam.DECAY, rate);
  }

  /** Set sustain level (0-1) */
  setSustain(level: number): void {
    this.setParameterById(ASCParam.SUSTAIN, level);
  }

  /** Set release rate (0.0001-0.1) */
  setRelease(rate: number): void {
    this.setParameterById(ASCParam.RELEASE, rate);
  }

  /** Set stereo width (0-1) */
  setStereoWidth(width: number): void {
    this.setParameterById(ASCParam.STEREO_WIDTH, width);
  }

  /** Set detune amount (0-1, affects alternate voices for chorus) */
  setDetune(amount: number): void {
    this.setParameterById(ASCParam.DETUNE, amount);
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
      volume: ASCParam.VOLUME,
      waveform: ASCParam.WAVEFORM,
      attack: ASCParam.ATTACK,
      decay: ASCParam.DECAY,
      sustain: ASCParam.SUSTAIN,
      release: ASCParam.RELEASE,
      stereo_width: ASCParam.STEREO_WIDTH,
      detune: ASCParam.DETUNE,
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

export default ASCSynth;
