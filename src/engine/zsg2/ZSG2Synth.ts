import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadZSG2ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * ZSG2Synth - ZOOM ZSG-2 48-Channel ROM Sampler (WASM)
 *
 * Based on MAME's ZSG-2 emulator (zsg2.cpp).
 * The ZOOM ZSG-2 is a 48-channel PCM chip used in ZOOM effects processors
 * (GFX-8, Studio 1201, etc.) and various arcade boards.
 *
 * Hardware facts:
 * - 48 simultaneous channels reading from ROM
 * - Proprietary 4-bit ADPCM: 32-bit blocks decode to 4 samples
 * - ~32552 Hz sample rate (from 25 MHz clock / 768)
 * - Per-channel IIR output filter with programmable cutoff
 * - Volume ramping (smooth transitions)
 * - Separate reverb/chorus send volumes per channel
 *
 * ROM requirement:
 * - Load the ZSG-2 ROM image via loadRom()
 * - Without ROM, chip produces silence
 *
 * WASM status:
 * - WASM binary must be compiled from zsg2-wasm/ZSG2Engine.c and placed at:
 *     public/mame/ZSG2.wasm + public/mame/ZSG2.js
 */
export class ZSG2Synth extends MAMEBaseSynth {
  readonly name = 'ZSG2Synth';

  protected readonly chipName = 'ZSG2';
  protected readonly workletFile = 'ZSG2.worklet.js';
  protected readonly processorName = 'zsg2-processor';

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
    this.currentVoice = Math.max(0, Math.min(47, voice));
  }

  protected async initialize(): Promise<void> {
    try {
      const romData = await loadZSG2ROMs();
      await super.initialize();
      this.loadRom(romData);
      this.romLoaded = true;
      console.log('[ZSG2] ROM loaded successfully');
    } catch {
      await super.initialize();
      console.log('[ZSG2] No ROM found — place files in /public/roms/zsg2/');
    }
  }

  /**
   * Load the ZSG-2 ROM image into WASM memory.
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
    filter_cutoff: 0,
  };

  override setParam(param: string, value: number): void {
    const id = ZSG2Synth.PARAM_IDS[param];
    if (id !== undefined) {
      this.workletNode?.port.postMessage({ type: 'setParam', paramId: id, value });
    }
  }
}

export default ZSG2Synth;
