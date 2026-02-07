import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * AICA Parameter IDs (matching C++ enum)
 */
const AICAParam = {
  MASTER_VOLUME: 0
} as const;

/**
 * AICA Sample Format
 */
const AICASampleFormat = {
  PCM16: 0,
  PCM8: 1,
  ADPCM: 2
} as const;

/**
 * AICA Synthesizer - Sega Dreamcast Sound Processor (WASM)
 *
 * Based on MAME's AICA emulator by ElSemi and R. Belmont
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The AICA (Audio and Interactive Controller Architecture) is used in:
 * - Sega Dreamcast (1998)
 * - Sega NAOMI arcade board
 *
 * Features:
 * - 64 programmable slots (voices)
 * - PCM playback (8-bit, 16-bit, and ADPCM)
 * - ADSR envelope
 * - Pitch LFO and Amplitude LFO
 * - On-board DSP for effects
 * - 2MB sample RAM
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, duty, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class AICASynth extends MAMEBaseSynth {
  readonly name = 'AICASynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'AICA';
  protected readonly workletFile = 'AICA.worklet.js';
  protected readonly processorName = 'aica-processor';

  // AICA-specific state
  private currentSlot: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  /**
   * Write key-on to AICA
   */
  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
      slot: this.currentSlot,
    });
  }

  /**
   * Write key-off to AICA
   */
  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
      slot: this.currentSlot,
    });
  }

  /**
   * Write frequency to AICA
   */
  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    // AICA uses sample rate ratio for pitch
    // OCT + FNS register format
    // For simplicity, send frequency and let worklet calculate
    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq,
      slot: this.currentSlot,
    });
  }

  /**
   * Write volume to AICA (0-1 normalized)
   */
  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    // AICA volume is 0-255 (0 = max, 255 = min)
    // Invert and scale
    const aicaVol = Math.round((1 - volume) * 255);

    this.workletNode.port.postMessage({
      type: 'setVolume',
      volume: aicaVol,
      slot: this.currentSlot,
    });
  }

  /**
   * Write panning to AICA (0-255, 128 = center)
   */
  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    // AICA panning: 0 = left, 31 = right, 16 = center
    const aicaPan = Math.round((pan / 255) * 31);

    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan: aicaPan,
      slot: this.currentSlot,
    });
  }

  // ===========================================================================
  // AICA-Specific Methods
  // ===========================================================================

  /**
   * Select which slot/voice to control
   */
  setSlot(slot: number): void {
    this.currentSlot = Math.max(0, Math.min(63, slot));
  }

  /**
   * Load sample data into AICA RAM
   * @param offset Offset in RAM (0-2097151)
   * @param data Sample data (Uint8Array)
   */
  loadSample(offset: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadSample',
      offset,
      data: data.buffer,
      size: data.length
    }, [data.buffer.slice(0)]);
  }

  /**
   * Configure a slot for sample playback
   * @param format 0=PCM16, 1=PCM8, 2=ADPCM
   */
  configureSlot(slot: number, sampleAddr: number, loopStart: number, loopEnd: number, loop: boolean, format: number = 0): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'configureSlot',
      slot,
      sampleAddr,
      loopStart,
      loopEnd,
      loop,
      format
    });
  }

  /**
   * Set envelope parameters for a slot
   */
  setEnvelope(slot: number, attack: number, decay1: number, decay2: number, release: number, sustainLevel: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setEnvelope',
      slot,
      attack,
      decay1,
      decay2,
      release,
      sustainLevel,
    });
  }

  /**
   * Set LFO parameters
   */
  setLFO(slot: number, pitchDepth: number, ampDepth: number, rate: number, waveform: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setLFO',
      slot,
      pitchDepth,
      ampDepth,
      rate,
      waveform,
    });
  }

  // ===========================================================================
  // Parameter Interface
  // ===========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value
    });
  }

  setParam(param: string, value: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'setParam', args: [param, value] });
      return;
    }
    const paramMap: Record<string, number> = {
      'master_volume': AICAParam.MASTER_VOLUME,
      'volume': AICAParam.MASTER_VOLUME
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(AICAParam.MASTER_VOLUME, val);
  }
}

// Export sample format constants
export { AICASampleFormat };

export default AICASynth;
