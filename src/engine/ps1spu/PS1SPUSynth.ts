import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';

/**
 * PS1SPUSynth - PlayStation 1 SPU 24-Voice ADPCM Sampler (WASM)
 *
 * Based on MAME's Sony CXD2922BQ SPU emulator (spu.cpp).
 * The PlayStation 1 SPU (1994) is a 24-voice ADPCM sampler:
 *
 * Hardware facts:
 * - 24 voices, 4-bit ADPCM encoded samples in 512KB SPU RAM
 * - 16-byte ADPCM blocks decode to 28 samples each
 * - ADSR envelope per voice (attack/decay/sustain/release)
 * - Pitch register 0x1000 = 44100 Hz base frequency
 * - Hardware reverb unit (not emulated in this WASM port)
 *
 * WASM status:
 * - WASM binary must be compiled from ps1spu-wasm/PS1SPUEngine.c and placed at:
 *     public/mame/PS1SPU.wasm + public/mame/PS1SPU.js
 * - Until the WASM is compiled, this class will fail gracefully and produce no audio.
 */
export class PS1SPUSynth extends MAMEBaseSynth {
  readonly name = 'PS1SPUSynth';

  protected readonly chipName = 'PS1SPU';
  protected readonly workletFile = 'PS1SPU.worklet.js';
  protected readonly processorName = 'ps1spu-processor';

  private currentVoice: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
      voice: this.currentVoice,
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: this.currentNote,
      voice: this.currentVoice,
    });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq,
      voice: this.currentVoice,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setVolume',
      value: Math.round(volume * 255),
      voice: this.currentVoice,
    });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
      voice: this.currentVoice,
    });
  }

  setVoice(voice: number): void {
    this.currentVoice = Math.max(0, Math.min(23, voice));
  }

  /**
   * Load PS-ADPCM sample data into a SPU voice slot.
   * Data should be raw PS-ADPCM blocks (16 bytes each, 28 samples per block).
   * @param voiceIndex Voice index (0-23)
   * @param data PS-ADPCM encoded sample data
   */
  loadVoiceSample(voiceIndex: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    const clampedVoice = Math.max(0, Math.min(23, voiceIndex));
    this.workletNode.port.postMessage({
      type: 'loadSample',
      voice: clampedVoice,
      data: data.buffer.slice(0),
      size: data.length,
    }, [data.buffer.slice(0)]);
  }

  private static readonly PARAM_IDS: Record<string, number> = {
    adsr_attack: 0,
    adsr_decay: 1,
    adsr_sustain: 2,
    adsr_release: 3,
  };

  override setParam(param: string, value: number): void {
    const id = PS1SPUSynth.PARAM_IDS[param];
    if (id !== undefined) {
      this.workletNode?.port.postMessage({ type: 'setParam', paramId: id, value });
    }
  }
}

export default PS1SPUSynth;
