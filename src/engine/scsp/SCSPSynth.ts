import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { freqToSCSP } from '@engine/mame/MAMEPitchUtils';

/**
 * SCSP Parameter IDs (matching C++ enum)
 */
const SCSPParam = {
  MASTER_VOLUME: 0
} as const;

/**
 * SCSP Synthesizer - Sega Saturn YMF292-F Sound Processor (WASM)
 *
 * Based on MAME's SCSP emulator by ElSemi and R. Belmont
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The SCSP (Saturn Custom Sound Processor) is used in:
 * - Sega Saturn (1994)
 * - Sega ST-V arcade board
 * - Various Sega Model 2/3 arcade games
 *
 * Features:
 * - 32 programmable slots (voices)
 * - PCM playback (8-bit or 16-bit) from RAM
 * - FM synthesis using wavetable as carrier
 * - ADSR envelope (Attack, Decay1, Decay2, Release)
 * - Pitch LFO and Amplitude LFO
 * - On-board DSP for effects
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, duty, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - FM operator control
 * - Oscilloscope support
 */
export class SCSPSynth extends MAMEBaseSynth {
  readonly name = 'SCSPSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'SCSP';
  protected readonly workletFile = 'SCSP.worklet.js';
  protected readonly processorName = 'scsp-processor';

  // SCSP-specific state
  private currentSlot: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  /**
   * Write key-on to SCSP
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
   * Write key-off to SCSP
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
   * Write frequency to SCSP using OCT+FNS
   */
  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    // Convert to SCSP's OCT + FNS format
    const pitch = freqToSCSP(freq);

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      oct: pitch.oct,
      fns: pitch.fns,
      slot: this.currentSlot,
    });
  }

  /**
   * Write volume to SCSP (0-1 normalized)
   */
  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    // SCSP TL: 0 = max, 255 = min (attenuation)
    const tl = Math.round((1 - volume) * 255);

    this.workletNode.port.postMessage({
      type: 'setVolume',
      tl,
      slot: this.currentSlot,
    });
  }

  /**
   * Write panning to SCSP (0-255, 128 = center)
   */
  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    // SCSP uses direct send levels to L/R
    // Pan 0 = full left, 255 = full right, 128 = center
    const leftLevel = Math.round(((255 - pan) / 255) * 31);
    const rightLevel = Math.round((pan / 255) * 31);

    this.workletNode.port.postMessage({
      type: 'setPanning',
      sdl: leftLevel,   // Send level left
      sdr: rightLevel,  // Send level right
      slot: this.currentSlot,
    });
  }

  // ===========================================================================
  // FM Operator Control (SCSP supports basic FM)
  // ===========================================================================

  /**
   * Set FM modulation input level
   */
  setFMLevel(slot: number, level: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setFMLevel',
      slot,
      level,
    });
  }

  /**
   * Set FM input slot
   */
  setFMInputSlot(slot: number, inputSlot: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setFMInputSlot',
      slot,
      inputSlot,
    });
  }

  // ===========================================================================
  // SCSP-Specific Methods
  // ===========================================================================

  /**
   * Select which slot/voice to control
   */
  setSlot(slot: number): void {
    this.currentSlot = Math.max(0, Math.min(31, slot));
  }

  /**
   * Load sample data into SCSP RAM
   * @param offset Offset in RAM (0-524287)
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
   * @param format 0=PCM16, 1=PCM8
   */
  configureSlot(slot: number, sampleAddr: number, loopStart: number, loopEnd: number, loop: boolean, format?: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'configureSlot',
      slot,
      sampleAddr,
      loopStart,
      loopEnd,
      loop,
      format: format ?? 0
    });
  }

  /**
   * Set envelope parameters
   */
  setEnvelope(slot: number, ar: number, d1r: number, d2r: number, rr: number, dl: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setEnvelope',
      slot,
      ar,
      d1r,
      d2r,
      rr,
      dl,
    });
  }

  /**
   * Set LFO parameters
   */
  setLFO(slot: number, plfos: number, alfos: number, freq: number, wave: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setLFO',
      slot,
      plfos,  // Pitch LFO sensitivity
      alfos,  // Amplitude LFO sensitivity
      freq,
      wave,
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
      'master_volume': SCSPParam.MASTER_VOLUME,
      'volume': SCSPParam.MASTER_VOLUME
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(SCSPParam.MASTER_VOLUME, val);
  }
}

export default SCSPSynth;
