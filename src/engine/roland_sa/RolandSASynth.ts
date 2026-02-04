import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

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
 */
export class RolandSASynth extends Tone.ToneAudioNode {
  readonly name = 'RolandSASynth';
  readonly input: undefined;
  readonly output: Tone.Gain;

  private workletNode: AudioWorkletNode | null = null;
  private static isWorkletLoaded: boolean = false;
  private static initializationPromise: Promise<void> | null = null;

  public config: Record<string, unknown> = {};
  public audioContext: AudioContext;
  private _disposed: boolean = false;

  constructor() {
    super();
    this.audioContext = getNativeContext(this.context);
    this.output = new Tone.Gain(1);
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const context = getNativeContext(this.context);
      await RolandSASynth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[RolandSA] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/RolandSA.worklet.js`);
        } catch (_e) {
          // Module might already be added
        }
        this.isWorkletLoaded = true;
      }
    })();

    return this.initializationPromise;
  }

  private createNode(): void {
    if (this._disposed) return;

    const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'rolandsa-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[RolandSA] WASM node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate,
    });

    const targetNode = this.output.input as AudioNode;
    this.workletNode.connect(targetNode);

    // CRITICAL: Connect through silent keepalive to destination to force process() calls
    try {
      const keepalive = rawContext.createGain();
      keepalive.gain.value = 0;
      this.workletNode.connect(keepalive);
      keepalive.connect(rawContext.destination);
    } catch (_e) { /* keepalive failed */ }
  }

  // ========================================================================
  // ROM loading
  // ========================================================================

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

  // ========================================================================
  // MIDI-style note interface
  // ========================================================================

  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this.workletNode || this._disposed) return;

    const midiNote =
      typeof note === 'string'
        ? Tone.Frequency(note).toMidi()
        : Math.round(12 * Math.log2(note / 440) + 69);

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: Math.floor(velocity * 127),
    });
  }

  triggerRelease(note?: string | number, _time?: number): void {
    if (!this.workletNode || this._disposed) return;
    if (note !== undefined) {
      const midiNote =
        typeof note === 'string'
          ? Tone.Frequency(note).toMidi()
          : Math.round(12 * Math.log2(note / 440) + 69);
      this.workletNode.port.postMessage({ type: 'noteOff', note: midiNote });
    } else {
      this.workletNode.port.postMessage({ type: 'allNotesOff' });
    }
  }

  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  triggerAttackRelease(
    note: string | number,
    duration: string | number,
    time?: number,
    velocity?: number
  ): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1);

    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
      if (!this._disposed) {
        this.triggerRelease(note);
      }
    }, d * 1000);
  }

  // ========================================================================
  // Parameter interface
  // ========================================================================

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setParameter', paramId, value });
  }

  setParam(param: string, value: number): void {
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

  // ========================================================================
  // Convenience setters
  // ========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Load a preset (0-7). Use RolandSAPreset constants. */
  loadPreset(program: number): void {
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

  // ========================================================================
  // MIDI CC and pitch bend
  // ========================================================================

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  // ========================================================================
  // Internal
  // ========================================================================

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }

  dispose(): this {
    this._disposed = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.output.dispose();
    super.dispose();
    return this;
  }
}

export { RolandSAParam };

export default RolandSASynth;
