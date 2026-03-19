
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type SP0250Frame, phonemesToSP0250Frames, samToSP0250 } from '@engine/speech/sp0250PhonemeMap';

/**
 * VLM5030 Parameter IDs (matching C++ enum)
 */
const VLM5030Param = {
  VOLUME: 0,
  VOWEL: 1,
  VOICED: 2,
  BRIGHTNESS: 3,
  STEREO_WIDTH: 4,
  FORMANT_SHIFT: 5,
} as const;

/**
 * Vowel presets
 */
export const VLM5030Preset = {
  AH: 0,       // /a/ (Track!)
  EE: 1,       // /e/ (Set!)
  IH: 2,       // /i/ (Ready!)
  OH: 3,       // /o/ (Go!)
  OO: 4,       // /u/ (Ooh)
  NN: 5,       // Nasal /n/
  SS: 6,       // Fricative /s/
  HH: 7,       // Breathy
} as const;

/**
 * VLM5030 Synthesizer - Sanyo VLM5030 LPC Speech (Konami arcade) (WASM)
 *
 * Based on MAME emulator by Tatsuyuki Satoh
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The VLM5030 is an LPC speech synthesis IC used in Konami arcade games:
 * - 10-pole lattice filter
 * - Frame interpolation (4 steps)
 * - Voiced/unvoiced/silent modes
 * - Used in Track & Field, Hyper Sports, Yie Ar Kung-Fu
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class VLM5030Synth extends MAMEBaseSynth {
  readonly name = 'VLM5030Synth';

  protected readonly chipName = 'VLM5030';
  protected readonly workletFile = 'VLM5030.worklet.js';
  protected readonly processorName = 'vlm5030-processor';

  private _speechSequencer: SpeechSequencer<SP0250Frame> | null = null;

  private _mode: 0 | 1 = 1;
  private _singMode = true;
  private _speechText = 'READY SET GO';

  private _vowelSequence: string[] = [];
  private _vowelLoopSingle = false;
  private _vowelIndex = 0;

  constructor() {
    super();
    this.initSynth();
  }

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    if (this._mode === 1) {
      if (this._singMode && this._vowelSequence.length > 0) {
        this._speakSingleVowel(note, velocity);
      } else if (this._singMode) {
        if (this._speechSequencer) {
          const freq = 440 * Math.pow(2, (note - 69) / 12);
          this.writeFrequency(freq);
        } else {
          this._startSpeechAtNote(this._speechText, note, velocity);
        }
      } else {
        this._startSpeechAtNote(this._speechText, 60, velocity);
      }
    } else {
      this.workletNode.port.postMessage({
        type: 'noteOn',
        note,
        velocity: Math.floor(velocity * 127),
      });
    }
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'noteOff', note: this.currentNote });
  }

  protected writeFrequency(freq: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFrequency', freq });
  }

  protected writeVolume(volume: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setVolume', value: volume });
  }

  protected writePanning(pan: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setPanning', pan });
  }

  // ===========================================================================
  // VLM5030-Specific Methods
  // ===========================================================================

  setVolume(value: number): void {
    this.setParameterById(VLM5030Param.VOLUME, value);
  }

  setVowel(value: number): void {
    this.setParameterById(VLM5030Param.VOWEL, value);
  }

  setVoiced(voiced: boolean): void {
    this.setParameterById(VLM5030Param.VOICED, voiced ? 1.0 : 0.0);
  }

  setBrightness(value: number): void {
    this.setParameterById(VLM5030Param.BRIGHTNESS, value);
  }

  setFormantShift(value: number): void {
    this.setParameterById(VLM5030Param.FORMANT_SHIFT, value);
  }

  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  // ===========================================================================
  // Text-to-Speech
  // ===========================================================================

  speakText(text: string): void {
    if (!this._isReady || !this.workletNode) {
      this._pendingCalls.push({ method: 'speakText', args: [text] });
      return;
    }
    this._startSpeechAtNote(text, 60, 0.8);
  }

  private _startSpeechAtNote(text: string, note: number, velocity: number): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    this.stopSpeaking();

    const phonemeStr = textToPhonemes(text);
    if (!phonemeStr) return;

    const tokens = parsePhonemeString(phonemeStr);
    const frames = phonemesToSP0250Frames(tokens);
    if (frames.length === 0) return;

    const speechFrames: SpeechFrame<SP0250Frame>[] = frames
      .filter(f => f.voiced)
      .map(f => ({ data: f, durationMs: f.durationMs }));
    if (speechFrames.length === 0) return;

    const first = speechFrames[0].data;
    this.setVowel(first.preset);
    this.setVoiced(first.voiced);
    this.setBrightness(first.brightness);

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
    });

    this._speechSequencer = new SpeechSequencer<SP0250Frame>(
      (frame) => {
        this.setVowel(frame.preset);
        this.setVoiced(frame.voiced);
        this.setBrightness(frame.brightness);
      },
      () => {
        this._speechSequencer = null;
        this.triggerRelease();
      }
    );
    this._speechSequencer.speak(speechFrames);
  }

  stopSpeaking(): void {
    const wasSpeaking = this._speechSequencer !== null;
    if (this._speechSequencer) {
      this._speechSequencer.stop();
      this._speechSequencer = null;
    }
    if (wasSpeaking) this.triggerRelease();
  }

  get isSpeaking(): boolean {
    return this._speechSequencer?.isSpeaking ?? false;
  }

  protected override processPendingCall(call: { method: string; args: unknown[] }): void {
    if (call.method === 'speakText') {
      this.speakText(call.args[0] as string);
    } else if (call.method === 'loadPreset') {
      this.loadPreset(call.args[0] as number);
    } else {
      super.processPendingCall(call);
    }
  }

  controlChange(cc: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'controlChange', cc, value });
  }

  pitchBend(value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'pitchBend', value });
  }

  loadPreset(program: number): void {
    if (!this._isReady) {
      this._pendingCalls.push({ method: 'loadPreset', args: [program] });
      return;
    }
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'programChange', program });
  }

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
      volume: VLM5030Param.VOLUME,
      vowel: VLM5030Param.VOWEL,
      voiced: VLM5030Param.VOICED,
      brightness: VLM5030Param.BRIGHTNESS,
      stereo_width: VLM5030Param.STEREO_WIDTH,
      formant_shift: VLM5030Param.FORMANT_SHIFT,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }

    if (param === 'mode') this._mode = value >= 1 ? 1 : 0;
    if (param === 'sing_mode') this._singMode = value >= 1;
    if (param === 'vowelLoopSingle') this._vowelLoopSingle = value >= 1;
  }

  setTextParam(key: string, value: string): void {
    if (key === 'speechText') this._speechText = value;
    if (key === 'vowelSequence') {
      this._vowelSequence = value ? value.split(',').filter(Boolean) : [];
      this._vowelIndex = 0;
    }
  }

  private _speakSingleVowel(note: number, velocity: number): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    const code = this._vowelSequence[this._vowelIndex % this._vowelSequence.length];
    this._vowelIndex++;

    const frame = samToSP0250(code);
    if (!frame) return;

    this.stopSpeaking();

    const speechFrames: SpeechFrame<SP0250Frame>[] = [{
      data: frame,
      durationMs: frame.durationMs,
    }];

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
    });

    this._speechSequencer = new SpeechSequencer<SP0250Frame>(
      (f) => {
        this.setVowel(f.preset);
        this.setVoiced(f.voiced);
        this.setBrightness(f.brightness);
      },
      () => {
        if (!this._vowelLoopSingle) {
          this._speechSequencer = null;
          this.triggerRelease();
        }
      }
    );
    this._speechSequencer.speak(speechFrames, this._vowelLoopSingle);
  }
}

export default VLM5030Synth;
