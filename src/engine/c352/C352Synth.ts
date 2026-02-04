import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

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
 */
export class C352Synth extends Tone.ToneAudioNode {
  readonly name = 'C352Synth';
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
      await C352Synth.ensureInitialized(context);
      if (this._disposed) return;
      this.createNode();
    } catch (err) {
      console.error('[C352] Initialization failed:', err);
    }
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (this.isWorkletLoaded) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!this.isWorkletLoaded) {
        try {
          await context.audioWorklet.addModule(`${baseUrl}mame/C352.worklet.js`);
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

    // Get the rawContext from Tone.js (standardized-audio-context)
    const toneContext = this.context as any;
    const rawContext = toneContext.rawContext || toneContext._context;

    this.workletNode = toneCreateAudioWorkletNode(rawContext, 'c352-processor', {
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: rawContext.sampleRate
      }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        console.log('[C352] WASM node ready');
      }
    };

    this.workletNode.port.postMessage({
      type: 'init',
      sampleRate: rawContext.sampleRate
    });

    // Connect worklet to Tone.js output - use the input property which is the native GainNode
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
   * Configure a voice for sample playback
   * @param voice Voice number (0-31)
   * @param bank Sample bank
   * @param start Sample start offset
   * @param end Sample end offset
   * @param loop Loop point offset
   * @param freq Frequency/pitch value
   * @param flags Voice flags
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
   * Set voice volumes
   * @param voice Voice number (0-31)
   * @param vol_f Front volume (left << 8 | right)
   * @param vol_r Rear volume (left << 8 | right)
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
   * Key on a voice
   */
  keyOn(voice: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOn',
      voice
    });
  }

  /**
   * Key off a voice
   */
  keyOff(voice: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'keyOff',
      voice
    });
  }

  triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this.workletNode || this._disposed) return;

    const midiNote = typeof note === 'string'
      ? Tone.Frequency(note).toMidi()
      : Math.round(12 * Math.log2(note / 440) + 69);

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: Math.floor(velocity * 127)
    });
  }

  triggerRelease(_time?: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: 0
    });
  }

  releaseAll(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'allNotesOff' });
  }

  triggerAttackRelease(note: string | number, duration: string | number, time?: number, velocity?: number): void {
    if (this._disposed) return;
    this.triggerAttack(note, time, velocity || 1);

    const d = Tone.Time(duration).toSeconds();
    setTimeout(() => {
      if (!this._disposed) {
        this.triggerRelease();
      }
    }, d * 1000);
  }

  private setParameterById(paramId: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({
      type: 'setParameter',
      paramId,
      value
    });
  }

  setParam(param: string, value: number): void {
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

// Export constants
export { C352Param, C352Flags };

export default C352Synth;
