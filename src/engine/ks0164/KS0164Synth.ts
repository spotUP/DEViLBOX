import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadKS0164ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * KS0164Synth - Samsung KS0164 32-Voice Wavetable ROM Sampler (WASM)
 *
 * Based on MAME's Samsung KS0164 emulator (ks0164.cpp).
 * The KS0164 is a 64-voice wavetable GM synthesizer used in various
 * OEM sound cards and consumer electronics in the mid-1990s.
 *
 * Hardware facts:
 * - 64 internal voices (32 exposed in this WASM port)
 * - 16-bit or 8-bit sample playback from ROM
 * - 8-bit samples decoded via 256-entry lookup table
 * - Volume ramping per voice
 * - Embedded 68000 CPU for GM patch management (stripped in this port)
 * - Used in: Yamaha XG OEM cards, Samsung Sound Pro
 *
 * ROM requirement:
 * - Load the KS0164 ROM image via loadRom()
 * - Without ROM, chip produces silence
 *
 * WASM status:
 * - WASM binary must be compiled from ks0164-wasm/KS0164Engine.c and placed at:
 *     public/mame/KS0164.wasm + public/mame/KS0164.js
 */
export class KS0164Synth extends MAMEBaseSynth {
  readonly name = 'KS0164Synth';

  protected readonly chipName = 'KS0164';
  protected readonly workletFile = 'KS0164.worklet.js';
  protected readonly processorName = 'ks0164-processor';

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
    this.currentVoice = Math.max(0, Math.min(31, voice));
  }

  protected async initialize(): Promise<void> {
    try {
      const romData = await loadKS0164ROMs();
      await super.initialize();
      this.loadRom(romData);
      this.romLoaded = true;
      console.log('[KS0164] ROM loaded successfully');
    } catch {
      await super.initialize();
      console.log('[KS0164] No ROM found — place files in /public/roms/ks0164/');
    }
  }

  /**
   * Load the KS0164 ROM image into WASM memory.
   * @param data ROM image as Uint8Array
   */
  loadRom(data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadRom',
      data: data.buffer.slice(0),
      size: data.length,
    }, [data.buffer.slice(0)]);
  }

  private static readonly PARAM_IDS: Record<string, number> = {
    ramp_speed: 0,
  };

  override setParam(param: string, value: number): void {
    const id = KS0164Synth.PARAM_IDS[param];
    if (id !== undefined) {
      this.workletNode?.port.postMessage({ type: 'setParam', paramId: id, value });
    }
  }
}

export default KS0164Synth;
