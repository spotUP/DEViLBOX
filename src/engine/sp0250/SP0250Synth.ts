
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type SP0250Frame, samToSP0250 } from '@engine/speech/sp0250PhonemeMap';
import { phonemesToSP0250LPCFrames, samToSP0250LPC } from '@engine/speech/sp0250FrameMap';

/**
 * SP0250 Parameter IDs (matching C++ enum)
 */
const SP0250Param = {
  VOLUME: 0,
  VOWEL: 1,
  VOICED: 2,
  BRIGHTNESS: 3,
  STEREO_WIDTH: 4,
  FILTER_MIX: 5,
} as const;

/**
 * Vowel presets
 */
export const SP0250Preset = {
  AH: 0,       // /a/ (father) - open vowel
  EE: 1,       // /e/ (beet) - front close
  IH: 2,       // /i/ (bit) - front open
  OH: 3,       // /o/ (boat) - back rounded
  OO: 4,       // /u/ (boot) - back close
  NN: 5,       // Nasal /n/
  ZZ: 6,       // Buzz (unvoiced noise)
  HH: 7,       // Breathy
} as const;

/**
 * SP0250 Synthesizer - GI SP0250 Digital LPC Sound Synthesizer (WASM)
 *
 * Based on MAME emulator by Olivier Galibert
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The SP0250 is a digital formant/LPC (Linear Predictive Coding)
 * synthesizer that generates speech and vocal sounds through:
 * - Voiced excitation (pitch pulse train) or unvoiced (15-bit LFSR noise)
 * - 6 cascaded second-order lattice filters shaping the spectral envelope
 * - 8-bit amplitude control with mantissa+exponent encoding
 *
 * Features:
 * - 4-voice polyphony (extended from original single voice)
 * - 8 built-in vowel/formant presets: AH, EE, IH, OH, OO, NN, ZZ, HH
 * - Direct coefficient control for filter shaping
 * - 15-byte FIFO hardware-compatible interface
 * - Internal 128-entry coefficient ROM (from MAME)
 * - LPC runs at ~10kHz (authentic) with interpolated upsampling
 * - MIDI pitch mapping with pitch bend support
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class SP0250Synth extends MAMEBaseSynth {
  readonly name = 'SP0250Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'SP0250';
  protected readonly workletFile = 'SP0250.worklet.js';
  protected readonly processorName = 'sp0250-processor';

  private _speechSequencer: SpeechSequencer<SP0250Frame> | null = null;
  private _phonemeSpeechActive = false;
  private _phonemeSpeechTimer: ReturnType<typeof setTimeout> | null = null;

  // Speech mode state
  private _singMode = true;
  private _speechText = 'HELLO WORLD';

  // Vowel sequence state
  private _vowelSequence: string[] = [];
  private _vowelLoopSingle = false;
  private _vowelIndex = 0;

  constructor() {
    super();
    this.initSynth();
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

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
  // SP0250-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.setParameterById(SP0250Param.VOLUME, value);
  }

  /** Set vowel preset (0-7). Use SP0250Preset constants. */
  setVowel(value: number): void {
    this.setParameterById(SP0250Param.VOWEL, value);
  }

  /** Set voiced excitation (true) or noise excitation (false) */
  setVoiced(voiced: boolean): void {
    this.setParameterById(SP0250Param.VOICED, voiced ? 1.0 : 0.0);
  }

  /** Set brightness / upper formant emphasis (0-1) */
  setBrightness(value: number): void {
    this.setParameterById(SP0250Param.BRIGHTNESS, value);
  }

  /** Write a value to the SP0250 FIFO (index 0-14) */
  writeFIFO(index: number, data: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeFIFO', index, data });
  }

  /** Set individual filter coefficient (filterIdx 0-5, isB: false=F/true=B, value 0-255) */
  setFilterCoeff(filterIdx: number, isB: boolean, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFilterCoeff', filterIdx, isB, value });
  }

  /** Write a value to an SP0250 register */
  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  // ===========================================================================
  // Text-to-Speech
  // ===========================================================================

  /** Speak English text using SAM's reciter and SP0250 vowel mapping */
  speakText(text: string): void {
    if (!this._isReady || !this.workletNode) {
      this._pendingCalls.push({ method: 'speakText', args: [text] });
      return;
    }
    this._startSpeechAtNote(text, 60, 0.8);
  }

  /** Start speech at a specific MIDI note using frame buffer with per-phoneme LPC coefficients */
  private _startSpeechAtNote(text: string, _note: number, _velocity: number): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    this.stopSpeaking();

    const phonemeStr = textToPhonemes(text);
    if (!phonemeStr) return;

    const tokens = parsePhonemeString(phonemeStr);

    // Use SP0250-specific LPC frame map with per-phoneme filter coefficients
    const lpcFrames = phonemesToSP0250LPCFrames(tokens);
    if (lpcFrames.length === 0) return;

    // Pack into 15-byte WASM frames: [amp, pitch, voiced, F0, B0, F1, B1, F2, B2, F3, B3, F4, B4, F5, B5]
    // Each frame is ~25ms at 10kHz LPC rate (250 samples)
    const frameList: number[][] = [];
    for (const f of lpcFrames) {
      const count = Math.max(1, Math.round(f.durationMs / 25));
      const packed = [f.amp, f.pitch, f.voiced ? 1 : 0, ...f.filterF.flatMap((fv, i) => [fv, f.filterB[i]])];
      for (let i = 0; i < count; i++) {
        frameList.push(packed);
      }
    }
    // Fade-out frames to prevent click at end of speech
    if (frameList.length > 0) {
      const last = frameList[frameList.length - 1];
      // 3 frames ramping amplitude to zero (75ms fade-out)
      for (let i = 3; i >= 1; i--) {
        const fadedAmp = Math.max(1, Math.round(last[0] * i / 4));
        frameList.push([fadedAmp, last[1], last[2], ...last.slice(3)]);
      }
      // Silent frame before stop
      frameList.push([0x00, 0, 0, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10]);
    }
    // Stop marker at end
    frameList.push([0xFF, 0, 0, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10, 0x80, 0x10]);

    const numFrames = frameList.length;
    const data = new Uint8Array(numFrames * 15);
    for (let i = 0; i < numFrames; i++) {
      const f = frameList[i];
      for (let j = 0; j < 15; j++) {
        data[i * 15 + j] = f[j];
      }
    }

    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.workletNode.port.postMessage(
      { type: 'loadFrameBuffer', frameData: buffer, numFrames },
      [buffer]
    );
    this.workletNode.port.postMessage({ type: 'speakFrameBuffer' });

    this._phonemeSpeechActive = true;
    const totalMs = numFrames * 25 + 100;
    this._phonemeSpeechTimer = setTimeout(() => {
      this._phonemeSpeechTimer = null;
      this._phonemeSpeechActive = false;
    }, totalMs);
  }

  /** Stop current text-to-speech playback */
  stopSpeaking(): void {
    if (this._speechSequencer) {
      this._speechSequencer.stop();
      this._speechSequencer = null;
    }
    this._phonemeSpeechActive = false;
    if (this._phonemeSpeechTimer !== null) {
      clearTimeout(this._phonemeSpeechTimer);
      this._phonemeSpeechTimer = null;
    }
    if (this.workletNode && !this._disposed) {
      this.workletNode.port.postMessage({ type: 'stopSpeaking' });
    }
  }

  /** Whether text-to-speech is currently playing */
  get isSpeaking(): boolean {
    return this._phonemeSpeechActive || (this._speechSequencer?.isSpeaking ?? false);
  }

  // ===========================================================================
  // Pending Call Handling
  // ===========================================================================

  protected override processPendingCall(call: { method: string; args: unknown[] }): void {
    if (call.method === 'speakText') {
      this.speakText(call.args[0] as string);
    } else if (call.method === 'loadPreset') {
      this.loadPreset(call.args[0] as number);
    } else {
      super.processPendingCall(call);
    }
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

  /** Load a vowel preset by program number (0-7) */
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
      volume: SP0250Param.VOLUME,
      vowel: SP0250Param.VOWEL,
      voiced: SP0250Param.VOICED,
      brightness: SP0250Param.BRIGHTNESS,
      stereo_width: SP0250Param.STEREO_WIDTH,
      filter_mix: SP0250Param.FILTER_MIX,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }

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

  /** Play a single vowel from the sequence at the given MIDI note */
  private _speakSingleVowel(_note: number, _velocity: number): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    const code = this._vowelSequence[this._vowelIndex % this._vowelSequence.length];
    this._vowelIndex++;

    // Use SP0250 LPC frame map for frame buffer playback
    const lpcFrame = samToSP0250LPC(code);
    if (lpcFrame) {
      this.stopSpeaking();
      const count = this._vowelLoopSingle ? 40 : Math.max(1, Math.round(lpcFrame.durationMs / 25));
      const packed = [lpcFrame.amp, lpcFrame.pitch, lpcFrame.voiced ? 1 : 0,
        ...lpcFrame.filterF.flatMap((fv, i) => [fv, lpcFrame.filterB[i]])];
      // +5: main frames + 3 fade-out + 1 silent + 1 stop marker
      const totalFrames = count + 5;
      const data = new Uint8Array(totalFrames * 15);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < 15; j++) data[i * 15 + j] = packed[j];
      }
      // Fade-out frames to prevent click
      let off = count;
      for (let i = 3; i >= 1; i--) {
        const fadedAmp = Math.max(1, Math.round(lpcFrame.amp * i / 4));
        data[off * 15] = fadedAmp;
        data[off * 15 + 1] = packed[1]; data[off * 15 + 2] = packed[2];
        for (let j = 3; j < 15; j++) data[off * 15 + j] = packed[j];
        off++;
      }
      // Silent frame
      data[off * 15] = 0x00;
      off++;
      // Stop marker
      data[off * 15] = 0xFF;
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      this.workletNode.port.postMessage({ type: 'loadFrameBuffer', frameData: buffer, numFrames: totalFrames }, [buffer]);
      this.workletNode.port.postMessage({ type: 'speakFrameBuffer' });
      this._phonemeSpeechActive = true;
      this._phonemeSpeechTimer = setTimeout(() => {
        this._phonemeSpeechTimer = null;
        this._phonemeSpeechActive = false;
      }, totalFrames * 25 + 100);
      return;
    }

    // Fallback: old preset switching
    const frame = samToSP0250(code);
    if (!frame) return;

    this.stopSpeaking();

    const speechFrames: SpeechFrame<SP0250Frame>[] = [{
      data: frame,
      durationMs: frame.durationMs,
    }];

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: _note,
      velocity: Math.floor(_velocity * 127),
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
          if (this.workletNode && !this._disposed) {
            this.workletNode.port.postMessage({ type: 'allNotesOff' });
          }
        }
      }
    );
    this._speechSequencer.speak(speechFrames, this._vowelLoopSingle);
  }
}

export default SP0250Synth;
