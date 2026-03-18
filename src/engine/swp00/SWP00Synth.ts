import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadSWP00ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * SWP00Synth - Yamaha SWP00 AWM2 32-Voice ROMpler (WASM)
 *
 * Based on MAME's Yamaha SWP00 emulator (swp00.cpp).
 * The SWP00 is the AWM2 streaming chip used in the Yamaha MU50 (the smallest
 * XG module) and various Yamaha OEM products from the early 1990s.
 *
 * Hardware facts:
 * - 32 simultaneous AWM2 voices
 * - 16-bit, 8-bit, and proprietary DPCM sample formats
 * - Chamberlin state-variable lowpass filter per voice
 * - LFO with amplitude and frequency modulation
 * - ADSR envelope per voice
 * - MEG effects processor (reverb/chorus) — not emulated in this WASM port
 * - Used in: Yamaha MU50, various XG OEM cards
 *
 * ROM requirement:
 * - Load the SWP00 wave ROM image via loadRom()
 * - Without ROM, chip produces silence
 *
 * WASM status:
 * - WASM binary must be compiled from swp00-wasm/SWP00Engine.c and placed at:
 *     public/mame/SWP00.wasm + public/mame/SWP00.js
 */
export class SWP00Synth extends MAMEBaseSynth {
  readonly name = 'SWP00Synth';

  protected readonly chipName = 'SWP00';
  protected readonly workletFile = 'SWP00.worklet.js';
  protected readonly processorName = 'swp00-processor';

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
      const romData = await loadSWP00ROMs();
      await super.initialize();
      this.loadRom(romData);
      this.romLoaded = true;
      console.log('[SWP00] ROM loaded successfully');
    } catch {
      await super.initialize();
      console.log('[SWP00] No ROM found — place files in /public/roms/swp00/');
    }
  }

  /**
   * Load the SWP00 AWM2 wave ROM into WASM memory.
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
    filter_resonance: 1,
    lfo_rate: 2,
    lfo_amod: 3,
    lfo_fmod: 4,
    env_attack: 5,
    env_decay: 6,
    env_sustain: 7,
    env_release: 8,
  };

  override setParam(param: string, value: number): void {
    const id = SWP00Synth.PARAM_IDS[param];
    if (id !== undefined) {
      this.workletNode?.port.postMessage({ type: 'setParam', paramId: id, value });
    }
  }
}

export default SWP00Synth;
