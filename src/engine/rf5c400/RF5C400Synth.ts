
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadRF5C400ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * RF5C400 Parameter IDs
 */
const RF5C400Param = {
  MASTER_VOLUME: 0,
  CLOCK: 1
} as const;

/**
 * RF5C400 Synthesizer - Ricoh 32-Voice PCM (WASM)
 *
 * Based on MAME's rf5c400 by Ville Linde
 * High-quality 32-voice PCM with ADSR envelopes
 *
 * Used in many arcade games:
 * - Konami Bemani series (beatmania, pop'n music, Guitar Freaks, etc.)
 * - Konami Firebeat games
 * - Various Konami and Namco arcade games
 *
 * Features:
 * - 32 independent voices
 * - 16-bit and 8-bit PCM sample formats
 * - ADSR envelope (Attack, Decay, Release phases)
 * - Per-voice volume with exponential curve
 * - Constant-power panning
 * - Sample looping with configurable loop points
 * - Resonant filter (cutoff + resonance)
 * - Effect sends for external chorus/reverb
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class RF5C400Synth extends MAMEBaseSynth {
  readonly name = 'RF5C400Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'RF5C400';
  protected readonly workletFile = 'RF5C400.worklet.js';
  protected readonly processorName = 'rf5c400-processor';

  // RF5C400-specific state
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
      const romData = await loadRF5C400ROMs();

      // Call parent initialize first to set up worklet
      await super.initialize();

      // Load ROMs into the synth
      this.loadROM(0, romData);

      this.romLoaded = true;
      console.log('[RF5C400] ROM loaded successfully');
    } catch (error) {
      console.error('[RF5C400] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/rf5c400/ - see /public/roms/README.md');
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
      value: volume,
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

  // ===========================================================================
  // RF5C400-Specific Methods
  // ===========================================================================

  /**
   * Select which voice to control (0-31)
   */
  setVoice(voice: number): void {
    this.currentVoice = Math.max(0, Math.min(31, voice));
  }

  /**
   * Load sample ROM data
   * @param offset Offset in ROM
   * @param data Sample data (Uint8Array, 16-bit little-endian samples)
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
   * Write to RF5C400 register
   * @param offset Register offset
   * @param data 16-bit data value
   */
  writeRegister(offset: number, data: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'writeRegister',
      offset,
      data
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
      'master_volume': RF5C400Param.MASTER_VOLUME,
      'volume': RF5C400Param.MASTER_VOLUME,
      'clock': RF5C400Param.CLOCK
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(RF5C400Param.MASTER_VOLUME, val);
  }

  setClock(clock: number): void {
    this.setParameterById(RF5C400Param.CLOCK, clock);
  }
}

// Export constants
export { RF5C400Param };

export default RF5C400Synth;
