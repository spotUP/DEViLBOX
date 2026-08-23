
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * MSM5232 Parameter IDs (matching the C++ enum in mame-wasm/msm5232)
 */
const MSM5232Param = {
  VOLUME: 0,
  FEET_MIX: 1,      // 0=all feet, 1=8'+16', 2=8' only, 3=16' only
  ATTACK_RATE: 2,   // 0-7
  DECAY_RATE: 3,    // 0-15
  NOISE_ENABLE: 4,  // 0/1
  STEREO_WIDTH: 5,  // 0.0-1.0
  REVERB: 6,
  ARM_MODE: 7,      // 0=normal decay, 1=sustain until key off
} as const;

/**
 * MSM5232 (OKI 8-Channel Tone Generator) - WASM
 *
 * Based on the MAME emulator by Jarek Burczynski / Hiromitsu Shioya,
 * compiled to WebAssembly via Emscripten.
 *
 * Two groups of four voices; each voice mixes 2', 4', 8' and 16' square-wave
 * organ feet through the chip's hardware envelope (attack/decay rates, ARM
 * sustain mode). The organ voice of Taito arcade boards (Equites, Gyakuten!!
 * Puzzle Bancho) and several Toshiba home keyboards.
 *
 * Extends MAMEBaseSynth for macros, tracker effects, velocity scaling and
 * oscilloscope support.
 */
export class MSM5232Synth extends MAMEBaseSynth {
  readonly name = 'MSM5232Synth';

  protected readonly chipName = 'MSM5232';
  protected readonly workletFile = 'MSM5232.worklet.js';
  protected readonly processorName = 'msm5232-processor';

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
    this.workletNode.port.postMessage({ type: 'noteOff', note: this.currentNote });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFrequency', freq });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setVolume', value: volume });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setPanning', pan });
  }

  // ===========================================================================
  // MSM5232-Specific Methods
  // ===========================================================================

  /** Set the organ feet mix (0=all, 1=8'+16', 2=8' only, 3=16' only) */
  setFeetMix(mix: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFeetMix', value: mix });
  }

  /** Write a raw chip register */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  /** Load a registration preset */
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
      volume: MSM5232Param.VOLUME,
      feet_mix: MSM5232Param.FEET_MIX,
      attack_rate: MSM5232Param.ATTACK_RATE,
      decay_rate: MSM5232Param.DECAY_RATE,
      noise_enable: MSM5232Param.NOISE_ENABLE,
      stereo_width: MSM5232Param.STEREO_WIDTH,
      reverb: MSM5232Param.REVERB,
      arm_mode: MSM5232Param.ARM_MODE,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }
}

export default MSM5232Synth;
