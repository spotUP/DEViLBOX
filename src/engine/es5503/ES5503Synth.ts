import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { freqToES5503 } from '@engine/mame/MAMEPitchUtils';
import { loadES5503ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * ES5503 Parameter IDs (matching C++ enum)
 */
const ES5503Param = {
  WAVEFORM: 0,
  WAVE_SIZE: 1,
  RESOLUTION: 2,
  OSC_MODE: 3,
  VOLUME: 4,
  NUM_OSCILLATORS: 5,
  ATTACK_TIME: 6,
  RELEASE_TIME: 7,
} as const;

/**
 * Built-in waveform indices
 */
export const ES5503Waveform = {
  SINE: 0,
  SAWTOOTH: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  NOISE: 4,
  PULSE_25: 5,
  PULSE_12: 6,
  ORGAN: 7,
} as const;

/**
 * Wave table size options (number of samples)
 */
export const ES5503WaveSize = {
  SIZE_256: 0,
  SIZE_512: 1,
  SIZE_1024: 2,
  SIZE_2048: 3,
  SIZE_4096: 4,
  SIZE_8192: 5,
  SIZE_16384: 6,
  SIZE_32768: 7,
} as const;

/**
 * Oscillator modes
 */
export const ES5503OscMode = {
  FREE_RUN: 0,   // Loop continuously
  ONE_SHOT: 1,   // Play once and stop
  SYNC_AM: 2,    // Sync/AM with partner oscillator
  SWAP: 3,       // Switch to partner when done
} as const;

/**
 * ES5503 Synthesizer - Ensoniq DOC 32-Voice Wavetable (WASM)
 *
 * Based on MAME's ES5503 emulator v2.4 by R. Belmont
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The ES5503 (1986) was designed by Bob Yannes (creator of the C64 SID chip).
 * It's a 32-voice wavetable synthesizer used in:
 * - Apple IIgs (main sound chip)
 * - Ensoniq Mirage (first affordable pro sampler)
 * - Ensoniq ESQ-1/SQ-80 synthesizers
 *
 * Features:
 * - 32 independent oscillators with wavetable playback
 * - 128KB wave memory with 8 built-in waveforms
 * - Variable wave table sizes (256 to 32768 samples)
 * - 4 oscillator modes (Free-run, One-shot, Sync/AM, Swap)
 * - Per-oscillator volume (8-bit)
 * - Paired oscillator interactions for sync and AM
 * - Custom wave data loading for sample-based synthesis
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, wavetable, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Per-voice control
 * - Velocity scaling
 * - Oscilloscope support
 */
export class ES5503Synth extends MAMEBaseSynth {
  readonly name = 'ES5503Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'ES5503';
  protected readonly workletFile = 'ES5503.worklet.js';
  protected readonly processorName = 'es5503-processor';

  // ES5503-specific state
  private currentOsc: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  protected async initialize(): Promise<void> {
    try {
      // Load Ensoniq Mirage wavetable ROM data
      const romData = await loadES5503ROMs();

      // Call parent initialize first to set up worklet
      await super.initialize();

      // Load custom wavetables into wave RAM (pages 8+)
      this.loadWaveData(romData, 2048);  // Start at page 8 (offset 2048)

      this.romLoaded = true;
      console.log('[ES5503] Mirage wavetable ROM loaded successfully');
    } catch (error) {
      console.error('[ES5503] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/es5503/ - see /public/roms/README.md');
      // Continue anyway - synth works with 8 built-in waveforms
    }
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  /**
   * Write key-on to ES5503
   */
  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
      osc: this.currentOsc,
    });
  }

  /**
   * Write key-off to ES5503
   */
  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
      osc: this.currentOsc,
    });
  }

  /**
   * Write frequency to ES5503 using accumulator rate
   */
  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    const accRate = freqToES5503(freq);

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq: accRate,
      osc: this.currentOsc,
    });
  }

  /**
   * Write volume to ES5503 (0-1 normalized)
   */
  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    // ES5503 volume is 0-255
    const vol = Math.round(volume * 255);

    this.workletNode.port.postMessage({
      type: 'setVolume',
      volume: vol,
      osc: this.currentOsc,
    });
  }

  /**
   * Write panning to ES5503 (0-255, 128 = center)
   */
  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    // ES5503 has per-channel output routing
    // Map pan to channel assignment (0-7)
    const channel = Math.round((pan / 255) * 7);

    this.workletNode.port.postMessage({
      type: 'setPanning',
      channel,
      osc: this.currentOsc,
    });
  }

  /**
   * Write wavetable select
   */
  protected writeWavetableSelect(index: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setWaveform',
      value: index,
      osc: this.currentOsc,
    });
  }

  // ===========================================================================
  // ES5503-Specific Methods
  // ===========================================================================

  /**
   * Select which oscillator to control
   */
  setOscillator(osc: number): void {
    this.currentOsc = Math.max(0, Math.min(31, osc));
  }

  /** Select built-in waveform (0-7). Use ES5503Waveform constants. */
  setWaveform(index: number): void {
    this.writeWavetableSelect(index);
  }

  /** Set wave table size (0-7). Use ES5503WaveSize constants. */
  setWaveSize(index: number): void {
    this.sendMessage('setWaveSize', index);
  }

  /** Set resolution (0-7, affects frequency precision) */
  setResolution(index: number): void {
    this.sendMessage('setResolution', index);
  }

  /** Set oscillator mode (0-3). Use ES5503OscMode constants. */
  setOscMode(mode: number): void {
    this.sendMessage('setOscMode', mode);
  }

  /** Set attack time in seconds */
  setAttackTime(seconds: number): void {
    this.sendMessage('setAttackTime', seconds);
  }

  /** Set release time in seconds */
  setReleaseTime(seconds: number): void {
    this.sendMessage('setReleaseTime', seconds);
  }

  /** Set output amplitude (0-1) */
  setAmplitude(amp: number): void {
    this.sendMessage('setAmplitude', amp);
  }

  /** Set number of enabled oscillators (1-32). More oscillators = lower per-oscillator sample rate. */
  setNumOscillators(num: number): void {
    this.sendMessage('setNumOscillators', num);
  }

  // ===========================================================================
  // Wave data loading
  // ===========================================================================

  /**
   * Load custom wave data into the ES5503's wave memory.
   * Data should be Uint8Array of unsigned 8-bit samples (0x80 = center).
   * Note: 0x00 is reserved as the end-of-sample marker.
   *
   * @param data - Unsigned 8-bit sample data
   * @param offset - Byte offset in wave memory (0-131071)
   */
  loadWaveData(data: Uint8Array, offset: number = 0): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadWaveData',
      waveData: data.buffer,
      offset,
    });
  }

  /**
   * Load wave data into a specific page (256-byte boundary).
   * Pages 0-7 contain built-in waveforms by default.
   * Use pages 8+ for custom wave data.
   */
  loadWavePage(data: Uint8Array, page: number): void {
    this.loadWaveData(data.slice(0, 256), page * 256);
  }

  // ===========================================================================
  // Register-level access (for advanced/hardware-accurate use)
  // ===========================================================================

  /** Write a value to an ES5503 register */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
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

  /** Select preset waveform via program change */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
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
      waveform: ES5503Param.WAVEFORM,
      wave_size: ES5503Param.WAVE_SIZE,
      resolution: ES5503Param.RESOLUTION,
      osc_mode: ES5503Param.OSC_MODE,
      volume: ES5503Param.VOLUME,
      num_oscillators: ES5503Param.NUM_OSCILLATORS,
      attack_time: ES5503Param.ATTACK_TIME,
      release_time: ES5503Param.RELEASE_TIME,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

export default ES5503Synth;
