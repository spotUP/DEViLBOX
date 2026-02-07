
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadTR707ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * TR-707 Parameter IDs (matching C++ enum)
 */
const TR707Param = {
  VOLUME: 0,
  BASS_LEVEL: 1,
  SNARE_LEVEL: 2,
  LOWTOM_LEVEL: 3,
  MIDTOM_LEVEL: 4,
  HITOM_LEVEL: 5,
  RIMSHOT_LEVEL: 6,
  HANDCLAP_LEVEL: 7,
  HIHAT_LEVEL: 8,
  CRASH_LEVEL: 9,
  RIDE_LEVEL: 10,
  ACCENT: 11,
  DECAY: 12,
} as const;

/**
 * TR-707 MIDI Drum Note Mapping (General MIDI compatible)
 */
export const TR707DrumMap = {
  BASS_1: 36,
  BASS_2: 35,
  SNARE_1: 38,
  SNARE_2: 40,
  LOW_TOM: 41,
  MID_TOM: 47,
  HI_TOM: 50,
  RIMSHOT: 37,
  COWBELL: 56,
  HANDCLAP: 39,
  TAMBOURINE: 54,
  CLOSED_HIHAT: 42,
  OPEN_HIHAT: 46,
  CRASH: 49,
  RIDE: 51,
} as const;

/**
 * TR-707 Presets (mix level configurations)
 */
export const TR707Preset = {
  STANDARD: 0,
  HEAVY_BASS: 1,
  BRIGHT: 2,
  SOFT: 3,
  LATIN: 4,
  ELECTRONIC: 5,
  JAZZ: 6,
  ROCK: 7,
} as const;

/**
 * TR-707 Drum Machine - 10-Voice PCM Synthesizer (WASM)
 *
 * Roland TR-707 drum machine with analog signal conditioning.
 * Compiled to WebAssembly with inlined DSP components from MAME.
 *
 * The TR-707 was Roland's first fully digital drum machine (1984), using
 * PCM samples of real drum sounds stored in ROM, processed through analog
 * RC envelope generators, bandpass filters, and a stereo mixer.
 *
 * Features:
 * - 10 voices: 8 multiplexed PCM + 2 independent cymbal
 * - 15 drum sounds with variations (bass 1/2, snare 1/2, rim/cowbell, etc.)
 * - RC exponential envelope generators per voice
 * - Bandpass and lowpass filter chain per voice
 * - Fixed stereo panning per voice
 * - Per-voice volume controls
 * - Accent control affecting envelope attack amplitude
 * - Open/closed hi-hat with separate decay rates
 * - General MIDI drum note mapping
 *
 * ROM format: [IC34+IC35 64KB voices | IC19 32KB crash | IC22 32KB ride]
 * Total: 128KB
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class TR707Synth extends MAMEBaseSynth {
  readonly name = 'TR707Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'TR707';
  protected readonly workletFile = 'TR707.worklet.js';
  protected readonly processorName = 'tr707-processor';

  constructor() {
    super();
    this.initSynth();
  }

  /**
   * Override initialize to load ROMs before worklet initialization
   */
  protected async initialize(): Promise<void> {
    try {
      // Load standard TR707 ROM (not expansion)
      const romData = await loadTR707ROMs(false);  // false = standard ROM

      // Call parent initialize first to set up worklet
      await super.initialize();

      // Load ROMs into the synth
      this.loadCombinedROM(romData);

      // Initialize all voice levels to default (0.8)
      for (let i = 0; i < 10; i++) {
        this.setParameterById(TR707Param.BASS_LEVEL + i, 0.8);
      }

      // Set master volume and accent
      this.setParameterById(TR707Param.VOLUME, 0.8);
      this.setParameterById(TR707Param.ACCENT, 0.5);
      this.setParameterById(TR707Param.DECAY, 0.5);

      console.log('[TR707] ROM loaded successfully and parameters initialized');
    } catch (error) {
      console.error('[TR707] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/tr707/ - see /public/roms/README.md');
      // Continue anyway - synth will work but be silent
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
    });
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setFrequency',
      freq,
    });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setVolume',
      value: volume,
    });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;

    this.workletNode.port.postMessage({
      type: 'setPanning',
      pan,
    });
  }

  // ===========================================================================
  // ROM loading
  // ===========================================================================

  /**
   * Load ROM data
   * @param offset ROM offset: 0=voices (64KB), 0x10000=crash (32KB), 0x18000=ride (32KB)
   *               Or pass offset=0 with all data combined (128KB)
   * @param data ROM data (Uint8Array)
   */
  loadROM(offset: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadROM',
      offset,
      data: data.buffer,
      size: data.length,
    }, [data.buffer.slice(0)]);
  }

  /**
   * Load all ROMs as a single combined blob (128KB)
   * Format: [IC34+IC35 64KB | IC19 32KB | IC22 32KB]
   */
  loadCombinedROM(data: Uint8Array): void {
    this.loadROM(0, data);
  }

  /**
   * Load individual ROMs
   * @param voices IC34+IC35 combined mux voice ROM (64KB)
   * @param crash IC19 crash cymbal ROM (32KB)
   * @param ride IC22 ride cymbal ROM (32KB)
   */
  loadROMs(voices: Uint8Array, crash: Uint8Array, ride: Uint8Array): void {
    this.loadROM(0, voices);
    this.loadROM(0x10000, crash);
    this.loadROM(0x18000, ride);
  }

  // ===========================================================================
  // TR707-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Load a preset (0-7). Use TR707Preset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  /** Set per-voice level (0-1) */
  setVoiceLevel(channel: number, level: number): void {
    this.setParameterById(TR707Param.BASS_LEVEL + channel, level);
  }

  /** Set accent amount (0-1) */
  setAccent(value: number): void {
    this.setParameterById(TR707Param.ACCENT, value);
  }

  /** Set decay scale (0.5=short, 1.0=normal, 2.0=long) */
  setDecay(value: number): void {
    this.setParameterById(TR707Param.DECAY, value);
  }

  // ===========================================================================
  // MIDI CC and pitch bend
  // ===========================================================================

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
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
      volume: TR707Param.VOLUME,
      bass: TR707Param.BASS_LEVEL,
      snare: TR707Param.SNARE_LEVEL,
      low_tom: TR707Param.LOWTOM_LEVEL,
      mid_tom: TR707Param.MIDTOM_LEVEL,
      hi_tom: TR707Param.HITOM_LEVEL,
      rimshot: TR707Param.RIMSHOT_LEVEL,
      handclap: TR707Param.HANDCLAP_LEVEL,
      hihat: TR707Param.HIHAT_LEVEL,
      crash: TR707Param.CRASH_LEVEL,
      ride: TR707Param.RIDE_LEVEL,
      accent: TR707Param.ACCENT,
      decay: TR707Param.DECAY,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

export { TR707Param };

export default TR707Synth;
