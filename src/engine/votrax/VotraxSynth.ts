
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type VotraxFrame, phonemesToVotraxFrames } from '@engine/speech/votraxPhonemeMap';

/**
 * Votrax Parameter IDs (matching C++ enum)
 */
const VotraxParam = {
  VOLUME: 0,
  PHONEME: 1,
  INFLECTION: 2,
  F1_OVERRIDE: 3,
  F2_OVERRIDE: 4,
  F3_OVERRIDE: 5,
  STEREO_WIDTH: 6,
} as const;

// VotraxPhoneme is imported from votraxPhonemeMap to avoid circular dependencies
// Re-export for consumers that imported it from here
export { VotraxPhoneme } from '@engine/speech/votraxPhonemeMap';

/**
 * Votrax SC-01 Synthesizer - Formant Speech Synthesizer (WASM)
 *
 * Based on MAME emulator by Olivier Galibert
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The Votrax SC-01 is a formant speech synthesizer IC that generates
 * 64 phonemes through:
 * - Glottal pulse train (9-element waveform) for voiced sounds
 * - 15-bit LFSR white noise for unvoiced/fricative sounds
 * - 4 formant filters (F1-F4) using bilinear-transformed analog circuits
 * - Noise shaping filter
 * - Glottal closure amplitude modulation
 * - Parameter interpolation between phoneme transitions
 *
 * Features:
 * - 4-voice polyphony (extended from original single voice)
 * - 64 phonemes selectable in real-time
 * - MIDI pitch control with pitch bend
 * - Real-time formant override (F1, F2, F3)
 * - 2-bit inflection for subtle pitch variation
 * - Internal 40kHz processing rate (authentic)
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class VotraxSynth extends MAMEBaseSynth {
  readonly name = 'VotraxSynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'Votrax';
  protected readonly workletFile = 'Votrax.worklet.js';
  protected readonly processorName = 'votrax-processor';

  private _speechSequencer: SpeechSequencer<VotraxFrame> | null = null;

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
  // Votrax-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set phoneme (0-63). Use VotraxPhoneme constants. */
  setPhoneme(value: number): void {
    this.sendMessage('setPhoneme', value);
  }

  /** Set inflection (0-3) for subtle pitch variation */
  setInflection(value: number): void {
    this.setParameterById(VotraxParam.INFLECTION, value);
  }

  /** Override F1 formant (0-15, or -1 to use phoneme default) */
  setF1Override(value: number): void {
    this.setParameterById(VotraxParam.F1_OVERRIDE, value);
  }

  /** Override F2 formant (0-15, or -1 to use phoneme default) */
  setF2Override(value: number): void {
    this.setParameterById(VotraxParam.F2_OVERRIDE, value);
  }

  /** Override F3 formant (0-15, or -1 to use phoneme default) */
  setF3Override(value: number): void {
    this.setParameterById(VotraxParam.F3_OVERRIDE, value);
  }

  /** Write a phone code (0-63) directly */
  writePhone(phone: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writePhone', value: phone });
  }

  /** Write inflection bits (0-3) directly */
  writeInflection(inflection: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeInflection', value: inflection });
  }

  /** Write a register value */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  // ===========================================================================
  // Text-to-Speech
  // ===========================================================================

  /** Speak English text using SAM's reciter and Votrax allophone mapping */
  speakText(text: string): void {
    this.stopSpeaking();

    const phonemeStr = textToPhonemes(text);
    if (!phonemeStr) return;

    const tokens = parsePhonemeString(phonemeStr);
    const frames = phonemesToVotraxFrames(tokens);
    if (frames.length === 0) return;

    const speechFrames: SpeechFrame<VotraxFrame>[] = frames.map(f => ({
      data: f,
      durationMs: f.durationMs,
    }));

    // Activate a voice via the full triggerAttack path
    this.triggerAttack(60, undefined, 0.8);

    this._speechSequencer = new SpeechSequencer<VotraxFrame>(
      (frame) => this.writePhone(frame.phone),
      () => {
        this._speechSequencer = null;
        this.triggerRelease();
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
    if (wasSpeaking) this.triggerRelease();
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

  /** Load a phoneme by program number (0-63) */
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
      volume: VotraxParam.VOLUME,
      phoneme: VotraxParam.PHONEME,
      inflection: VotraxParam.INFLECTION,
      f1_override: VotraxParam.F1_OVERRIDE,
      f2_override: VotraxParam.F2_OVERRIDE,
      f3_override: VotraxParam.F3_OVERRIDE,
      stereo_width: VotraxParam.STEREO_WIDTH,
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

export default VotraxSynth;
