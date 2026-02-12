
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadICS2115ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * ICS2115 Parameter IDs
 */
const ICS2115Param = {
  MASTER_VOLUME: 0,
  ACTIVE_OSCILLATORS: 1
} as const;

/**
 * ICS2115 WaveFront Synthesizer (WASM)
 *
 * Based on MAME's ics2115 by Alex Marshall, nimitz, austere
 * 32-voice wavetable synthesizer
 *
 * Used in many arcade games:
 * - Raiden II / DX, Raiden Fighters series
 * - Seibu Kaihatsu arcade games (1993+)
 * - Various arcade boards
 *
 * Features:
 * - 32 independent voices
 * - 16-bit, 8-bit, and u-law compressed sample formats
 * - Volume envelope with attack/decay/release
 * - Oscillator envelope with loop control
 * - Per-voice panning with log2 pan law
 * - Bidirectional looping
 * - Linear sample interpolation
 * - Slow attack ramp for click reduction
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class ICS2115Synth extends MAMEBaseSynth {
  readonly name = 'ICS2115Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'ICS2115';
  protected readonly workletFile = 'ICS2115.worklet.js';
  protected readonly processorName = 'ics2115-processor';

  // ICS2115-specific state
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
      // Load wavetable ROM data
      const romData = await loadICS2115ROMs();

      // Call parent initialize first to set up worklet
      await super.initialize();

      // Load ROMs into the synth
      this.loadROM(0, romData);

      this.romLoaded = true;
      console.log('[ICS2115] ROM loaded successfully');
    } catch (error) {
      console.error('[ICS2115] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/ics2115/ - see /public/roms/README.md');
      // Continue anyway - synth will initialize but be silent without wavetables
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
  // ICS2115-Specific Methods
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
   * @param data Sample data (Uint8Array)
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
   * Write to ICS2115 register
   * @param voice Voice number (0-31)
   * @param reg Register number
   * @param data 16-bit data value
   */
  writeRegister(voice: number, reg: number, data: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'writeRegister',
      voice,
      reg,
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
      'master_volume': ICS2115Param.MASTER_VOLUME,
      'volume': ICS2115Param.MASTER_VOLUME,
      'active_osc': ICS2115Param.ACTIVE_OSCILLATORS,
      'voices': ICS2115Param.ACTIVE_OSCILLATORS
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }
  }

  setMasterVolume(val: number): void {
    this.setParameterById(ICS2115Param.MASTER_VOLUME, val);
  }

  setActiveOscillators(count: number): void {
    this.setParameterById(ICS2115Param.ACTIVE_OSCILLATORS, count);
  }
}

// Export constants
export { ICS2115Param };

export default ICS2115Synth;
