import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { freqToC352 } from '@engine/mame/MAMEPitchUtils';
import { loadC352ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * C352 Parameter IDs (matching C++ enum)
 */
const C352Param = {
  MASTER_VOLUME: 0
} as const;

/**
 * C352 Voice Flags (matching C++ constants)
 */
const C352Flags = {
  BUSY: 0x8000,      // Channel is busy
  KEYON: 0x4000,     // Key on
  KEYOFF: 0x2000,    // Key off
  LOOPTRG: 0x1000,   // Loop trigger
  LOOPHIST: 0x0800,  // Loop history
  FM: 0x0400,        // Frequency modulation
  PHASERL: 0x0200,   // Rear left phase invert
  PHASEFL: 0x0100,   // Front left phase invert
  PHASEFR: 0x0080,   // Front/rear right phase invert
  LDIR: 0x0040,      // Loop direction
  LINK: 0x0020,      // Long format sample
  NOISE: 0x0010,     // Play noise
  MULAW: 0x0008,     // Mu-law encoding
  FILTER: 0x0004,    // Disable filter/interpolation
  REVLOOP: 0x0003,   // Loop backwards
  LOOP: 0x0002,      // Loop forward
  REVERSE: 0x0001    // Play backwards
} as const;

/**
 * C352 Synthesizer - Namco 32-Voice PCM Sound Chip (WASM)
 *
 * Based on MAME's C352 emulator by R. Belmont and superctr
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The C352 is a 32-voice PCM chip used in many Namco arcade games:
 * - Ridge Racer series
 * - Tekken series
 * - Time Crisis series
 * - Soul Calibur
 * - Ace Combat
 * - And many more System 11/12/22/23 games
 *
 * Features:
 * - 32 independent voices
 * - 8-bit linear PCM and 8-bit mu-law encoding
 * - 4-channel output (Front L/R, Rear L/R)
 * - Per-voice volume with ramping
 * - Phase inversion per channel
 * - Noise generator (LFSR)
 * - Bidirectional looping
 * - Sample interpolation
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Per-voice control
 * - Velocity scaling
 * - Oscilloscope support
 */
export class C352Synth extends MAMEBaseSynth {
  readonly name = 'C352Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'C352';
  protected readonly workletFile = 'C352.worklet.js';
  protected readonly processorName = 'c352-processor';

  // C352-specific state
  private currentVoice: number = 0;

  constructor() {
    super();
    this.initSynth();
  }

  /**
   * Override initialize to load ROMs before worklet initialization
   */
  protected async initialize(): Promise<void> {
    try {
      // Load sample ROM data
      const romData = await loadC352ROMs();

      // Call parent initialize first to set up worklet
      await super.initialize();

      // Load ROMs into the synth
      this.loadROM(0, romData);

      console.log('[C352] ROM loaded successfully');
    } catch (error) {
      console.error('[C352] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/c352/ - see /public/roms/README.md');
      // Continue anyway - synth will initialize but be silent without samples
    }
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
      voice: this.currentVoice,
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0,
      voice: this.currentVoice,
    });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    const freqReg = freqToC352(freq);

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq: freqReg,
      voice: this.currentVoice,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    // C352 volume is 0-255 per channel
    const vol = Math.round(volume * 255);

    this.workletNode.port.postMessage({
      type: 'setVolume',
      volume: vol,
      voice: this.currentVoice,
    });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    // C352 has separate L/R/Front/Rear volumes
    const left = Math.round(((255 - pan) / 255) * 255);
    const right = Math.round((pan / 255) * 255);

    this.workletNode.port.postMessage({
      type: 'setPanning',
      vol_f: (left << 8) | right,  // Front L/R
      vol_r: (left << 8) | right,  // Rear L/R (same for stereo)
      voice: this.currentVoice,
    });
  }

  // ===========================================================================
  // C352-Specific Methods
  // ===========================================================================

  /**
   * Select which voice to control (0-31)
   */
  setVoice(voice: number): void {
    this.currentVoice = Math.max(0, Math.min(31, voice));
  }

  /**
   * Load sample ROM data
   */
  loadROM(offset: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadROM',
      offset,
      data: data.buffer,
      size: data.length
    }, [data.buffer.slice(0)]);
  }

  /**
   * Configure a voice for sample playback
   */
  configureVoice(voice: number, bank: number, start: number, end: number,
                 loop: number, freq: number, flags: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'configureVoice',
      voice,
      bank,
      start,
      end,
      loop,
      freq,
      flags
    });
  }

  /**
   * Set voice volumes (direct register access)
   */
  setVoiceVolume(voice: number, vol_f: number, vol_r: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setVoiceVolume',
      voice,
      vol_f,
      vol_r
    });
  }

  /**
   * Key on a voice directly
   */
  keyOn(voice: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOn',
      voice
    });
  }

  /**
   * Key off a voice directly
   */
  keyOff(voice: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOff',
      voice
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
      'master_volume': C352Param.MASTER_VOLUME,
      'volume': C352Param.MASTER_VOLUME
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(C352Param.MASTER_VOLUME, val);
  }
}

// Export constants
export { C352Param, C352Flags };

export default C352Synth;
