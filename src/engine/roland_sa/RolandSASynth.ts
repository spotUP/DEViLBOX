
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { loadRolandSAROMs } from '@engine/mame/MAMEROMLoader';

/**
 * Roland SA Parameter IDs (matching C++ enum)
 */
const RolandSAParam = {
  VOLUME: 0,
  PRESET: 1,
  ATTACK_SPEED: 2,
  RELEASE_SPEED: 3,
  WAVE_HIGH: 4,
  WAVE_LOOP: 5,
} as const;

/**
 * Roland SA Presets
 */
export const RolandSAPreset = {
  PIANO_1: 0,
  PIANO_2: 1,
  E_PIANO: 2,
  ORGAN: 3,
  STRINGS: 4,
  CHOIR: 5,
  HARPSICHORD: 6,
  VIBES: 7,
} as const;

/**
 * Roland SA Sound Generator - Silicon-Accurate 16-Voice Sample Player (WASM)
 *
 * Silicon-accurate emulation of the gate arrays found in the Roland CPU-B
 * board of SA-synthesis digital pianos. Reverse engineered from silicon images.
 *   - IC19 R06-0001 (Fujitsu MB60VH142) - Envelope controller
 *   - IC9  R06-0002 (Fujitsu MB60V141)  - Phase accumulator
 *   - IC8  R06-0003 (Fujitsu MB61V125)  - Sample mixer/interpolator
 *
 * Features:
 * - 16 voices x 10 parts = 160 concurrent sample parts
 * - 3 wave ROMs (IC5, IC6, IC7) - 128KB each = 384KB total
 * - Silicon-accurate phase accumulator (24-bit) and envelope (28-bit)
 * - Exponential volume processing matching original gate array logic
 * - 8 presets: Piano 1/2, E.Piano, Organ, Strings, Choir, Harpsichord, Vibes
 * - MIDI-controlled, 16-voice polyphony
 *
 * Used in: Roland HP-3000S, HP-2000, KR-33, and other SA-synthesis pianos
 * Original MAME source: src/devices/sound/roland_sa.cpp
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class RolandSASynth extends MAMEBaseSynth {
  readonly name = 'RolandSASynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'RolandSA';
  protected readonly workletFile = 'RolandSA.worklet.js';
  protected readonly processorName = 'rolandsa-processor';

  constructor() {
    super();
    this.initSynth();
  }

  /**
   * Override initialize to load ROMs before worklet initialization
   */
  protected async initialize(): Promise<void> {
    try {
      // Load wave ROM data (3x 128KB)
      const romData = await loadRolandSAROMs();

      // Call parent initialize first to set up worklet
      await super.initialize();

      // Split combined ROM into 3 parts (IC5, IC6, IC7)
      const ic5 = romData.slice(0, 128 * 1024);
      const ic6 = romData.slice(128 * 1024, 256 * 1024);
      const ic7 = romData.slice(256 * 1024, 384 * 1024);

      // Load ROMs using the dedicated method
      this.loadROMs(ic5, ic6, ic7);

      console.log('[RolandSA] ROMs loaded successfully');
    } catch (error) {
      console.error('[RolandSA] ROM loading failed:', error);
      console.error('Place ROM files in /public/roms/roland_sa/ - see /public/roms/README.md');
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
   * Load a single wave ROM (IC5, IC6, or IC7)
   * @param romId ROM index: 0=IC5, 1=IC6, 2=IC7
   * @param data ROM data (Uint8Array, 128KB each)
   */
  loadROM(romId: number, data: Uint8Array): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'loadROM',
      romId,
      data: data.buffer,
      size: data.length,
    }, [data.buffer.slice(0)]);
  }

  /**
   * Load all 3 wave ROMs at once
   * @param ic5 IC5 ROM data (128KB)
   * @param ic6 IC6 ROM data (128KB)
   * @param ic7 IC7 ROM data (128KB)
   */
  loadROMs(ic5: Uint8Array, ic6: Uint8Array, ic7: Uint8Array): void {
    this.loadROM(0, ic5);
    this.loadROM(1, ic6);
    this.loadROM(2, ic7);
  }

  // ===========================================================================
  // RolandSA-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Load a preset (0-7). Use RolandSAPreset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

  /** Set envelope attack speed (0-127) */
  setAttackSpeed(speed: number): void {
    this.setParameterById(RolandSAParam.ATTACK_SPEED, speed);
  }

  /** Set envelope release speed (0-127) */
  setReleaseSpeed(speed: number): void {
    this.setParameterById(RolandSAParam.RELEASE_SPEED, speed);
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
      volume: RolandSAParam.VOLUME,
      preset: RolandSAParam.PRESET,
      attack_speed: RolandSAParam.ATTACK_SPEED,
      release_speed: RolandSAParam.RELEASE_SPEED,
      wave_high: RolandSAParam.WAVE_HIGH,
      wave_loop: RolandSAParam.WAVE_LOOP,
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

export { RolandSAParam };

export default RolandSASynth;
