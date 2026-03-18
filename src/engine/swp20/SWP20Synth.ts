import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadSWP20ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * SWP20Synth - Yamaha SWP20 AWM2 32-Voice ROMpler (WASM)
 *
 * Based on MAME's Yamaha SWP20 register stub (swp20.cpp) and SWP00/SWP30
 * family documentation (same AWM2 architecture).
 *
 * The SWP20 is an AWM2 streaming chip from the same family as SWP00/SWP30.
 * MAME's swp20.cpp has only an empty audio stub; this implementation
 * approximates the AWM2 playback algorithm based on register documentation
 * and SWP00 family knowledge.
 *
 * Hardware facts:
 * - 32 simultaneous AWM2 voices
 * - 16-bit and 8-bit sample formats
 * - Used in: Yamaha MU50/MU80 (XG sound modules)
 * - ROM streaming architecture identical to SWP00/SWP30 family
 *
 * ROM requirement:
 * - Load the SWP20 wave ROM image via loadRom()
 * - Without ROM, chip produces silence
 *
 * WASM status:
 * - WASM binary must be compiled from swp20-wasm/SWP20Engine.c and placed at:
 *     public/mame/SWP20.wasm + public/mame/SWP20.js
 * - Audio algorithm is approximated (MAME has no working implementation)
 */
export class SWP20Synth extends MAMEBaseSynth {
  readonly name = 'SWP20Synth';

  protected readonly chipName = 'SWP20';
  protected readonly workletFile = 'SWP20.worklet.js';
  protected readonly processorName = 'swp20-processor';

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
      const romData = await loadSWP20ROMs();
      await super.initialize();
      this.loadRom(romData);
      this.romLoaded = true;
      console.log('[SWP20] ROM loaded successfully');
    } catch {
      await super.initialize();
      console.log('[SWP20] No ROM found — place files in /public/roms/swp20/');
    }
  }

  /**
   * Load the SWP20 AWM2 wave ROM into WASM memory.
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
    format: 0,
  };

  override setParam(param: string, value: number): void {
    const id = SWP20Synth.PARAM_IDS[param];
    if (id !== undefined) {
      this.workletNode?.port.postMessage({ type: 'setParam', paramId: id, value });
    }
  }
}

export default SWP20Synth;
