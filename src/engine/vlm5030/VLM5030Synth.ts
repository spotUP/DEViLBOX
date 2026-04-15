
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { isQuestion, textToTokens } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type SP0250Frame, samToSP0250 } from '@engine/speech/sp0250PhonemeMap';
import { phonemesToVLM5030Frames, samToVLM5030 } from '@engine/speech/vlm5030PhonemeMap';
import { loadVLM5030ROMs } from '@engine/mame/MAMEROMLoader';

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
  private _phonemeSpeechActive = false;
  private _phonemeSpeechTimer: ReturnType<typeof setTimeout> | null = null;

  private _singMode = true;
  private _speechText = 'READY SET GO';

  private _vowelSequence: string[] = [];
  private _vowelLoopSingle = false;
  private _vowelIndex = 0;

  // ROM state
  private _romData: Uint8Array | null = null;
  private _romSentToWasm = false;
  private _currentRomSpeech = 0;  // merged selector: 0..3 = phrases, 4+ = words
  private static readonly PHRASE_COUNT = 4;

  constructor() {
    super();
    this.initSynth();
  }

  protected async initialize(): Promise<void> {
    let romData: Uint8Array | null = null;
    try {
      romData = await loadVLM5030ROMs();
    } catch {
      // ROMs not available — will use preset mode
    }

    await super.initialize();

    if (romData) {
      this.loadROM(0, romData);
      // Update instrument store so UI shows "ROMS READY"
      this._updateRomStatus(true);
    }
  }

  // ===========================================================================
  // ROM Loading
  // ===========================================================================

  loadROM(_bank: number, data: Uint8Array): void {
    this._romData = data;
    this._romSentToWasm = false;
    this.romLoaded = true;
    if (this._isReady) this._sendROMToWasm();
  }

  private _sendROMToWasm(): void {
    if (!this._romData || !this.workletNode || this._romSentToWasm) return;
    const buffer = this._romData.buffer.slice(this._romData.byteOffset, this._romData.byteOffset + this._romData.byteLength);
    this.workletNode.port.postMessage({ type: 'loadROM', romData: buffer }, [buffer]);
    this._romData = null;
    this._romSentToWasm = true;
  }

  protected override handleWorkletMessage(data: Record<string, unknown>): void {
    super.handleWorkletMessage(data);
    if (data.type === 'ready' && this.romLoaded && !this._romSentToWasm) this._sendROMToWasm();
  }

  speakWord(index: number): void {
    if (!this._romSentToWasm || !this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'speakWord', wordIndex: index });
  }

  speakAtAddress(byteAddr: number): void {
    if (!this._romSentToWasm || !this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'speakAtAddress', byteAddr });
  }

  stopROMSpeaking(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'stopSpeaking' });
  }

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    // ROM speech: play selected ROM phrase/word
    if (this._romSentToWasm) {
      this._playRomSpeech(this._currentRomSpeech);
      return;
    }

    // ROM speech selected but not loaded yet — don't fall through to TTS
    if (this._currentRomSpeech > 0) return;

    // TTS speech
    if (this._singMode && this._vowelSequence.length > 0) {
      this._speakSingleVowel(note, velocity);
    } else if (this._singMode) {
      if (this._speechSequencer) {
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        this.writeFrequency(freq);
      } else {
        this._startSpeechAtNote(this._speechText, note, velocity);
      }
    } else if (this._speechText && this._speechText.trim().length > 0) {
      this._startSpeechAtNote(this._speechText, 60, velocity);
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

  private async _startSpeechAtNote(text: string, _note: number, _velocity: number): Promise<void> {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    this.stopSpeaking();

    const question = isQuestion(text);

    // Use eSpeak-NG for phoneme analysis (falls back to SAM)
    const tokens = await textToTokens(text);
    if (tokens.length === 0) return;

    // Use VLM5030-specific phoneme map with per-phoneme K coefficients
    const vlmFrames = phonemesToVLM5030Frames(tokens, question);
    if (vlmFrames.length === 0) return;

    // Pack into 12-byte WASM frames: [energyIdx, pitchIdx, k0..k9]
    // Each frame is ~25ms at 8kHz LPC rate (40 samples / 4 interp steps)
    const frameList: number[][] = [];
    for (const f of vlmFrames) {
      const count = Math.max(1, Math.round(f.durationMs / 25));
      const packed = [f.energy, f.unvoiced ? 0 : f.pitch, ...f.k];
      for (let i = 0; i < count; i++) {
        frameList.push(packed);
      }
    }
    // Silence frame at end
    frameList.push([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    const numFrames = frameList.length;
    const data = new Uint8Array(numFrames * 12);
    for (let i = 0; i < numFrames; i++) {
      const f = frameList[i];
      for (let j = 0; j < 12; j++) {
        data[i * 12 + j] = f[j];
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

  get isSpeaking(): boolean {
    return this._phonemeSpeechActive || (this._speechSequencer?.isSpeaking ?? false);
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

    if (param === 'sing_mode') this._singMode = value >= 1;
    if (param === 'vowelLoopSingle') this._vowelLoopSingle = value >= 1;
    if (param === 'romSpeech') {
      this._currentRomSpeech = Math.round(value);
    }
  }

  /** Play ROM speech — phrases (0..3) or individual words (4+) */
  private _playRomSpeech(selection: number): void {
    if (selection < VLM5030Synth.PHRASE_COUNT) {
      this._playPhrase(selection);
    } else {
      this.speakWord(selection - VLM5030Synth.PHRASE_COUNT);
    }
  }

  /** Track & Field phrase sequences (word indices) */
  private static readonly PHRASES: number[][] = [
    [0, 1, 2],         // READY SET GO
    [3, 4],            // 100 METER DASH
    [18],              // NEW RECORD
    [19],              // GAME OVER
  ];

  private _playPhrase(phraseIdx: number): void {
    if (phraseIdx < 0 || phraseIdx >= VLM5030Synth.PHRASES.length) return;
    const words = VLM5030Synth.PHRASES[phraseIdx];
    let i = 0;
    const playNext = () => {
      if (i >= words.length) return;
      this.speakWord(words[i]);
      i++;
      setTimeout(playNext, 600);
    };
    playNext();
  }

  setTextParam(key: string, value: string): void {
    if (key === 'speechText') this._speechText = value;
    if (key === 'vowelSequence') {
      this._vowelSequence = value ? value.split(',').filter(Boolean) : [];
      this._vowelIndex = 0;
    }
  }

  private _speakSingleVowel(_note: number, _velocity: number): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    const code = this._vowelSequence[this._vowelIndex % this._vowelSequence.length];
    this._vowelIndex++;

    // Use VLM5030 phoneme map for frame buffer playback
    const vlmFrame = samToVLM5030(code);
    if (vlmFrame) {
      this.stopSpeaking();
      const count = this._vowelLoopSingle ? 40 : Math.max(1, Math.round(vlmFrame.durationMs / 25));
      const packed = [vlmFrame.energy, vlmFrame.unvoiced ? 0 : vlmFrame.pitch, ...vlmFrame.k];
      const numFrames = count + 1;
      const data = new Uint8Array(numFrames * 12);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < 12; j++) data[i * 12 + j] = packed[j];
      }
      // silence at end
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      this.workletNode.port.postMessage({ type: 'loadFrameBuffer', frameData: buffer, numFrames }, [buffer]);
      this.workletNode.port.postMessage({ type: 'speakFrameBuffer' });
      this._phonemeSpeechActive = true;
      this._phonemeSpeechTimer = setTimeout(() => {
        this._phonemeSpeechTimer = null; this._phonemeSpeechActive = false;
      }, numFrames * 25 + 100);
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
          if (this.workletNode && !this._disposed) { this.workletNode.port.postMessage({ type: 'allNotesOff' }); }
        }
      }
    );
    this._speechSequencer.speak(speechFrames, this._vowelLoopSingle);
  }
}

export default VLM5030Synth;
