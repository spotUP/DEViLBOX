import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadRolandGPROMs } from '@engine/mame/MAMEROMLoader';

/**
 * RolandGPSynth - Roland TC6116 PCM 28-Channel Chip (WASM)
 *
 * Based on MAME's Roland GP skeleton (roland_gp.cpp) and roland_gp.h register map.
 * The TC6116 is the PCM chip at the heart of the Roland SC-88 and JV/XP series.
 *
 * Hardware facts:
 * - 28 PCM channels with dual volume envelopes and a filter envelope
 * - Dual volume envelopes (vol1/vol2) with independent speed controls
 * - Filter envelope with cutoff ramping
 * - One-pole lowpass filter per channel
 * - Ping-pong (alternate) loop mode
 * - Reverse playback mode
 * - Used in: Roland SC-88, SC-88Pro, JV-series, XP-series synthesizers
 *
 * ROM requirement:
 * - Load the Roland wave ROM image via loadRom()
 * - Without ROM, chip produces silence
 *
 * WASM status:
 * - WASM binary must be compiled from rolandgp-wasm/RolandGPEngine.c and placed at:
 *     public/mame/RolandGP.wasm + public/mame/RolandGP.js
 * - MAME has only a non-functional skeleton; audio algorithm is based on register docs
 */
export class RolandGPSynth extends MAMEBaseSynth {
  readonly name = 'RolandGPSynth';

  protected readonly chipName = 'RolandGP';
  protected readonly workletFile = 'RolandGP.worklet.js';
  protected readonly processorName = 'rolandgp-processor';

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
    this.currentVoice = Math.max(0, Math.min(27, voice));
  }

  protected async initialize(): Promise<void> {
    try {
      const romData = await loadRolandGPROMs();
      await super.initialize();
      this.loadRom(romData);
      this.romLoaded = true;
      console.log('[RolandGP] ROM loaded successfully');
    } catch {
      await super.initialize();
      console.log('[RolandGP] No ROM found — place files in /public/roms/rolandgp/');
    }
  }

  /**
   * Load the Roland wave ROM into WASM memory.
   * @param data ROM image as Uint8Array (16-bit signed LE samples)
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
    vol1_speed: 0,
    vol2_speed: 1,
    cutoff_speed: 2,
    alt_loop: 3,
    reverse: 4,
    cutoff_tv: 5,
  };

  override setParam(param: string, value: number): void {
    const id = RolandGPSynth.PARAM_IDS[param];
    if (id !== undefined) {
      this.workletNode?.port.postMessage({ type: 'setParam', paramId: id, value });
    }
  }
}

export default RolandGPSynth;
