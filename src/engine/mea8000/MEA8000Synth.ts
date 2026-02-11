
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type MEA8000Frame, phonemesToMEA8000Frames } from '@engine/speech/mea8000PhonemeMap';

/**
 * MEA8000 Parameter IDs (matching C++ enum)
 */
const MEA8000Param = {
  VOLUME: 0,
  NOISE_MODE: 1,
  F1_INDEX: 2,
  F2_INDEX: 3,
  F3_INDEX: 4,
  BW_INDEX: 5,
  AMPLITUDE: 6,
  STEREO_WIDTH: 7,
  INTERP_TIME: 8,
} as const;

/**
 * Vowel presets
 */
export const MEA8000Preset = {
  AH: 0,   // "father"
  EE: 1,   // "meet"
  IH: 2,   // "bit"
  OH: 3,   // "boat"
  OO: 4,   // "boot"
  AE: 5,   // "bat"
  UH: 6,   // "but"
  ER: 7,   // "bird"
} as const;

/**
 * Bandwidth settings
 */
export const MEA8000Bandwidth = {
  WIDE: 0,     // 726 Hz
  MEDIUM: 1,   // 309 Hz
  NARROW: 2,   // 125 Hz
  VERY_NARROW: 3, // 50 Hz
} as const;

/**
 * MEA8000 (Philips/Signetics) - 4-Formant Speech Synthesizer (WASM)
 *
 * Based on MAME emulator by Antoine Mine
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The MEA 8000 is a vocoder-style speech synthesis chip that generates
 * sound by passing an excitation signal (sawtooth or noise) through
 * a cascade of 4 second-order digital filters with programmable
 * frequency and bandwidth.
 *
 * Features:
 * - 4-voice polyphony (4 independent MEA8000 engines)
 * - 4 cascade formant filters (F1-F4)
 * - Sawtooth or noise excitation
 * - 8 vowel presets (AH, EE, IH, OH, OO, AE, UH, ER)
 * - Real-time F1/F2/F3 control with smooth interpolation
 * - 4 bandwidth settings (wide to very narrow)
 * - Internal 8kHz processing rate (authentic)
 *
 * Used in: Thomson MO5/TO7, Amstrad CPC, Oric (French speech extensions)
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class MEA8000Synth extends MAMEBaseSynth {
  readonly name = 'MEA8000Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'MEA8000';
  protected readonly workletFile = 'MEA8000.worklet.js';
  protected readonly processorName = 'mea8000-processor';

  private _speechSequencer: SpeechSequencer<MEA8000Frame> | null = null;

  constructor() {
    super();
    this.initSynth();
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
    this.workletNode.port.postMessage({ type: 'noteOff', note: this.currentNote });
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
  // MEA8000-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set formant frequencies by table indices.
   * f1: 0-31 (150-1047 Hz), f2: 0-31 (440-3400 Hz), f3: 0-7 (1179-3400 Hz) */
  setFormants(f1: number, f2: number, f3: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFormants', f1, f2, f3 });
  }

  /** Set noise mode (true=noise excitation, false=sawtooth voiced) */
  setNoiseMode(noise: boolean): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setNoiseMode', value: noise });
  }

  /** Set filter bandwidth (0-3, use MEA8000Bandwidth constants) */
  setBandwidth(bwIndex: number): void {
    this.setParameterById(MEA8000Param.BW_INDEX, bwIndex);
  }

  /** Set interpolation time multiplier (0.1-10.0) */
  setInterpTime(value: number): void {
    this.setParameterById(MEA8000Param.INTERP_TIME, value);
  }

  /** Write a register value (0=F1, 1=F2, 2=F3, 3=BW) */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  // ===========================================================================
  // Text-to-Speech
  // ===========================================================================

  /** Speak English text using SAM's reciter and MEA8000 formant mapping */
  speakText(text: string): void {
    this.stopSpeaking();

    const phonemeStr = textToPhonemes(text);
    if (!phonemeStr) return;

    const tokens = parsePhonemeString(phonemeStr);
    const frames = phonemesToMEA8000Frames(tokens);
    if (frames.length === 0) return;

    const speechFrames: SpeechFrame<MEA8000Frame>[] = frames.map(f => ({
      data: f,
      durationMs: f.durationMs,
    }));

    // Activate a voice so WASM processes parameter changes
    this.writeKeyOn(60, 0.8);

    this._speechSequencer = new SpeechSequencer<MEA8000Frame>(
      (frame) => {
        this.setFormants(frame.f1, frame.f2, frame.f3);
        this.setNoiseMode(frame.noise);
        this.setBandwidth(frame.bw);
      },
      () => {
        this._speechSequencer = null;
        this.writeKeyOff();
      }
    );
    this._speechSequencer.speak(speechFrames);
  }

  /** Stop current text-to-speech playback */
  stopSpeaking(): void {
    const wasSpeaking = this._speechSequencer !== null;
    if (this._speechSequencer) {
      this._speechSequencer.stop();
      this._speechSequencer = null;
    }
    if (wasSpeaking) this.writeKeyOff();
  }

  /** Whether text-to-speech is currently playing */
  get isSpeaking(): boolean {
    return this._speechSequencer?.isSpeaking ?? false;
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

  /** Load a vowel preset (0-7). Use MEA8000Preset constants. */
  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
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
      volume: MEA8000Param.VOLUME,
      noise_mode: MEA8000Param.NOISE_MODE,
      f1_index: MEA8000Param.F1_INDEX,
      f2_index: MEA8000Param.F2_INDEX,
      f3_index: MEA8000Param.F3_INDEX,
      bw_index: MEA8000Param.BW_INDEX,
      amplitude: MEA8000Param.AMPLITUDE,
      stereo_width: MEA8000Param.STEREO_WIDTH,
      interp_time: MEA8000Param.INTERP_TIME,
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

export default MEA8000Synth;
