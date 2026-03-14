import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * CMI Parameter IDs (matching C++ enum in CMI WASM bridge)
 */
const CMIParam = {
  MASTER_VOLUME: 0,
  VOICE_COUNT: 1,
  SAMPLE_RATE: 2,
  WAVEFORM: 3,
} as const;

/**
 * CMISynth - Fairlight CMI IIx 8-Voice Sampling Synthesizer (WASM)
 *
 * Based on MAME's Fairlight CMI IIx emulator.
 * The Fairlight CMI IIx (1982) is a landmark sampling synthesizer:
 *
 * Hardware facts:
 * - 8 independent voices, each driven by its own Z80 CPU at 4 MHz
 * - 8-bit PCM samples stored in onboard RAM
 * - Real-time additive synthesis ("Page R" real-time composer mode)
 * - Famous for its orchestral sample library (strings, brass, woodwinds)
 * - Used extensively in 1980s pop records by Peter Gabriel, Kate Bush,
 *   Stevie Wonder, Herbie Hancock, Harold Faltermeyer, and many others
 *
 * WASM status:
 * - CMI chip is defined in the MAME source as `cmi01a_device` and `cmi_sound_device`
 * - WASM binary must be compiled from the MAME CMI source and placed at:
 *     public/mame/CMI.wasm + public/mame/CMI.js
 *   with a corresponding processor at:
 *     public/mame/CMI.worklet.js
 * - Until the WASM is compiled, this class will fail gracefully (logs an error)
 *   and produce no audio.
 *
 * Architecture:
 * - Extends MAMEBaseSynth for macro system, effects, and voice management
 * - 8 voices (one per CMI channel)
 * - 8-bit PCM playback with pitch control
 * - Sample ROM loaded into WASM memory via loadSample()
 */
export class CMISynth extends MAMEBaseSynth {
  readonly name = 'CMISynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'CMI';
  protected readonly workletFile = 'CMI.worklet.js';
  protected readonly processorName = 'cmi-processor';

  // CMI-specific state
  private currentVoice: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  /**
   * Write key-on to CMI voice
   */
  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
      voice: this.currentVoice,
    });
  }

  /**
   * Write key-off to CMI voice
   */
  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: this.currentNote,
      voice: this.currentVoice,
    });
  }

  /**
   * Write frequency to CMI voice
   */
  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq,
      voice: this.currentVoice,
    });
  }

  /**
   * Write volume to CMI voice (0-1 normalized)
   * CMI volume is 8-bit (0-255)
   */
  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setVolume',
      value: Math.round(volume * 255),
      voice: this.currentVoice,
    });
  }

  /**
   * Write panning to CMI voice (0-255, 128 = center)
   */
  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
      voice: this.currentVoice,
    });
  }

  // ===========================================================================
  // CMI-Specific Methods
  // ===========================================================================

  /**
   * Select which voice to control (0-7)
   * The CMI IIx has 8 voices.
   */
  setVoice(voice: number): void {
    this.currentVoice = Math.max(0, Math.min(7, voice));
  }

  /**
   * Load sample data into CMI voice RAM.
   * The CMI stores 8-bit unsigned PCM samples.
   *
   * @param voiceIndex Voice index (0-7)
   * @param data 8-bit PCM sample data (unsigned, 0x80 = center)
   */
  loadVoiceSample(voiceIndex: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    const clampedVoice = Math.max(0, Math.min(7, voiceIndex));
    this.workletNode.port.postMessage({
      type: 'loadSample',
      voice: clampedVoice,
      offset: 0,
      data: data.buffer.slice(0),
      size: data.length,
    }, [data.buffer.slice(0)]);
  }

  /**
   * Write to a CMI register directly (low-level access).
   *
   * @param offset Register offset
   * @param value 8-bit value
   */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
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
      'master_volume': CMIParam.MASTER_VOLUME,
      'volume': CMIParam.MASTER_VOLUME,
      'voice_count': CMIParam.VOICE_COUNT,
      'sample_rate': CMIParam.SAMPLE_RATE,
      'waveform': CMIParam.WAVEFORM,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(CMIParam.MASTER_VOLUME, val);
  }
}

// Export constants
export { CMIParam };

export default CMISynth;
