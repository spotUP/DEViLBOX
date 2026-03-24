import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * CMI Parameter IDs — must match C++ enum in mame-wasm/cmi/CMISynth.cpp
 */
const CMIParam = {
  VOLUME: 0,
  FILTER_CUTOFF: 1,
  ENVELOPE_RATE: 2,
  WAVE_SELECT: 3,
  ATTACK_TIME: 4,
  RELEASE_TIME: 5,
  ENV_MODE: 6,
  FILTER_TRACK: 7,
} as const;

/**
 * CMISynth — Fairlight CMI IIx Channel Card (CMI01A) Emulation
 *
 * DSP extracted 1:1 from MAME's cmi01a.cpp with behavioral models of
 * the PIA6821 and PTM6840 peripherals for authentic hardware timing.
 *
 * Hardware architecture (per voice):
 * - 16KB wave RAM, 8-bit unsigned PCM (0x80 = center)
 * - Two cascaded SSM2045 2nd-order lowpass filters
 *   fc = 6410 * pow(1.02162, fval - 256) where fval = (octave << 5) + flt_latch
 * - Hardware envelope: 8-bit up/down counter with 6-bit divider chain
 * - PTM6840 timer drives envelope clock, PIA6821 mediates control signals
 *
 * Famous users: Peter Gabriel, Kate Bush, Herbie Hancock, Art of Noise
 */
export class CMISynth extends MAMEBaseSynth {
  readonly name = 'CMISynth';

  protected readonly chipName = 'CMI';
  protected readonly workletFile = 'CMI.worklet.js';
  protected readonly processorName = 'cmi-processor';

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
      note: this.currentNote,
    });
  }

  protected writeFrequency(_freq: number): void {
    // Frequency is set via noteOn — CMI converts MIDI note to pitch/octave registers internally
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById(CMIParam.VOLUME, Math.round(volume * 255));
  }

  protected writePanning(_pan: number): void {
    // CMI01A is mono per channel — panning handled at mixer level
  }

  // ===========================================================================
  // CMI-Specific Methods
  // ===========================================================================

  /**
   * Load 8-bit unsigned PCM sample data into a specific voice's wave RAM.
   * @param voiceIndex Voice index (0-15, CMI01A has up to 16 polyphonic voices)
   * @param data 8-bit PCM sample data (unsigned, 0x80 = center)
   */
  loadVoiceSample(voiceIndex: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.workletNode.port.postMessage({
      type: 'loadSample',
      voice: Math.max(0, Math.min(15, voiceIndex)),
      data: buf,
    }, [buf]);
  }

  /**
   * Load 8-bit unsigned PCM sample into ALL voices' wave RAM.
   */
  loadSampleAll(data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.workletNode.port.postMessage({
      type: 'loadSample',
      voice: -1,
      data: buf,
    }, [buf]);
  }

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
      'volume': CMIParam.VOLUME,
      'filter_cutoff': CMIParam.FILTER_CUTOFF,
      'cutoff': CMIParam.FILTER_CUTOFF,
      'envelope_rate': CMIParam.ENVELOPE_RATE,
      'wave_select': CMIParam.WAVE_SELECT,
      'attack': CMIParam.ATTACK_TIME,
      'attack_time': CMIParam.ATTACK_TIME,
      'release': CMIParam.RELEASE_TIME,
      'release_time': CMIParam.RELEASE_TIME,
      'env_mode': CMIParam.ENV_MODE,
      'filter_track': CMIParam.FILTER_TRACK,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(CMIParam.VOLUME, Math.round(val * 255));
  }
}

export { CMIParam };

export default CMISynth;
