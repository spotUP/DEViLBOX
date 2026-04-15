
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type SP0250Frame, phonemesToSP0250Frames, samToSP0250 } from '@engine/speech/sp0250PhonemeMap';
import { loadS14001AROMs } from '@engine/mame/MAMEROMLoader';

/**
 * S14001A Parameter IDs (matching C++ enum)
 */
const S14001AParam = {
  VOLUME: 0,
  PRESET: 1,        // 0-7 waveform presets
  VOICED: 2,        // 0=noise, 1=voiced
  BRIGHTNESS: 3,
  STEREO_WIDTH: 4,
  DELTA_DEPTH: 5,   // delta modulation depth
} as const;

/**
 * Waveform presets
 */
export const S14001APreset = {
  AH: 0,       // /a/ (father) - open vowel via delta modulation
  EE: 1,       // /i:/ (beet) - bright, fast transitions
  IH: 2,       // /ɪ/ (bit) - between AH and EE
  OH: 3,       // /oʊ/ (boat) - rounded, deeper
  OO: 4,       // /u:/ (boot) - very rounded, deep
  NN: 5,       // Nasal /n/
  ZZ: 6,       // Buzz/fricative (noise)
  HH: 7,       // Breathy/aspirate
} as const;

/**
 * S14001A Synthesizer - SSi TSI S14001A Speech IC (Berzerk) (WASM)
 *
 * Based on MAME emulator by Ed Bernard, Jonathan Gevaryahu, hap
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The S14001A is a delta modulation speech synthesis IC (1975):
 * - 2-bit delta encoding with increment table (0, 1, or 3)
 * - 4-bit DAC output (16 levels)
 * - Voiced/unvoiced/silence modes
 * - Mirroring within pitch periods
 * - Used in Berzerk, Frenzy, TSI Speech+ calculator
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class S14001ASynth extends MAMEBaseSynth {
  readonly name = 'S14001ASynth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'S14001A';
  protected readonly workletFile = 'S14001A.worklet.js';
  protected readonly processorName = 's14001a-processor';

  private _speechSequencer: SpeechSequencer<SP0250Frame> | null = null;

  // Speech mode state
  private _mode: 0 | 1 = 1;       // 0=Tone, 1=Speech
  private _singMode = true;
  private _speechText = 'INTRUDER ALERT';

  // Preset sequence state
  private _presetSequence: string[] = [];
  private _presetLoopSingle = false;
  private _presetIndex = 0;

  // ROM state
  private _romData: Uint8Array | null = null;
  private _romSentToWasm = false;
  private _currentRomSpeech = 0;  // merged selector: 0..5 = phrases, 6+ = words
  private static readonly PHRASE_COUNT = 6;

  constructor() {
    super();
    this.initSynth();
  }

  protected async initialize(): Promise<void> {
    let romData: Uint8Array | null = null;
    try {
      romData = await loadS14001AROMs();
    } catch {
      // ROMs not available
    }

    await super.initialize();

    if (romData) {
      this.loadROM(0, romData);
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

  stopROMSpeaking(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'stopSpeaking' });
  }

  // ===========================================================================
  // Frame Buffer Speech (TTS pipeline preset sequencing)
  // Frame format: 4 bytes per frame [presetIndex, pitchPeriod, voiced, duration10ms]
  // ===========================================================================

  private _phonemeSpeechActive = false;
  private _phonemeSpeechTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Send frame buffer to WASM and start speaking.
   * Each frame is 4 bytes: [presetIndex, pitchPeriod, voiced, duration_10ms_units]
   */
  speakFrameBuffer(data: Uint8Array, numFrames: number, onDone?: () => void): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    this.stopSpeaking();

    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.workletNode.port.postMessage(
      { type: 'loadFrameBuffer', frameData: buffer, numFrames },
      [buffer]
    );
    this.workletNode.port.postMessage({ type: 'speakFrameBuffer' });

    this._phonemeSpeechActive = true;

    // Estimate duration from frame durations (each unit = 10ms)
    let totalMs = 100; // buffer
    for (let i = 0; i < numFrames; i++) {
      totalMs += data[i * 4 + 3] * 10;
    }
    this._phonemeSpeechTimer = setTimeout(() => {
      this._phonemeSpeechTimer = null;
      this._phonemeSpeechActive = false;
      if (onDone) onDone();
    }, totalMs);
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    // ROM speech mode: trigger ROM speech on note-on
    if (this._romSentToWasm && this._mode === 1) {
      this._playRomSpeech(this._currentRomSpeech);
      return;
    }

    if (this._mode === 1) {
      if (this._singMode && this._presetSequence.length > 0) {
        this._speakSinglePreset(note, velocity);
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
  // S14001A-Specific Methods
  // ===========================================================================

  setVolume(value: number): void {
    this.setParameterById(S14001AParam.VOLUME, value);
  }

  setPreset(value: number): void {
    this.setParameterById(S14001AParam.PRESET, value);
  }

  setVoiced(voiced: boolean): void {
    this.setParameterById(S14001AParam.VOICED, voiced ? 1.0 : 0.0);
  }

  setBrightness(value: number): void {
    this.setParameterById(S14001AParam.BRIGHTNESS, value);
  }

  setDeltaDepth(value: number): void {
    this.setParameterById(S14001AParam.DELTA_DEPTH, value);
  }

  writeWord(word: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeWord', word });
  }

  writeRegister(offset: number, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'writeRegister', offset, value });
  }

  // ===========================================================================
  // Text-to-Speech (reuses SP0250 phoneme pipeline)
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
      .map(f => ({ data: f, durationMs: f.durationMs }));
    if (speechFrames.length === 0) return;

    const first = speechFrames[0].data;
    this.setPreset(first.preset);
    this.setVoiced(first.voiced);
    this.setBrightness(first.brightness);

    this.workletNode.port.postMessage({
      type: 'noteOn',
      note,
      velocity: Math.floor(velocity * 127),
    });

    this._speechSequencer = new SpeechSequencer<SP0250Frame>(
      (frame) => {
        this.setPreset(frame.preset);
        this.setVoiced(frame.voiced);
        this.setBrightness(frame.brightness);
      },
      () => {
        this._speechSequencer = null;
        if (this.workletNode && !this._disposed) {
          this.workletNode.port.postMessage({ type: 'allNotesOff' });
        }
      }
    );
    this._speechSequencer.speak(speechFrames);
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
      this.workletNode.port.postMessage({ type: 'allNotesOff' });
    }
  }

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
      volume: S14001AParam.VOLUME,
      preset: S14001AParam.PRESET,
      voiced: S14001AParam.VOICED,
      brightness: S14001AParam.BRIGHTNESS,
      stereo_width: S14001AParam.STEREO_WIDTH,
      delta_depth: S14001AParam.DELTA_DEPTH,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }

    if (param === 'mode') this._mode = value >= 1 ? 1 : 0;
    if (param === 'sing_mode') this._singMode = value >= 1;
    if (param === 'presetLoopSingle') this._presetLoopSingle = value >= 1;
    if (param === 'romSpeech') {
      this._currentRomSpeech = Math.round(value);
      if (this._romSentToWasm) this._playRomSpeech(this._currentRomSpeech);
    }
  }

  /** Play ROM speech — phrases (0..5) or individual words (6+) */
  private _playRomSpeech(selection: number): void {
    if (selection < S14001ASynth.PHRASE_COUNT) {
      this._playPhrase(selection);
    } else {
      this.speakWord(selection - S14001ASynth.PHRASE_COUNT);
    }
  }

  /** Berzerk phrase sequences (word indices) */
  private static readonly PHRASES: number[][] = [
    [18, 8],                   // INTRUDER ALERT
    [10, 15, 22, 23, 20],     // THE HUMANOID MUST NOT ESCAPE
    [24, 25, 26, 27, 28],     // CHICKEN FIGHT LIKE A ROBOT
    [16, 9, 11, 17],          // COINS DETECTED IN POCKET
    [6, 10, 15],              // GET THE HUMANOID
    [1, 10, 18],              // KILL THE INTRUDER
  ];

  private _playPhrase(phraseIdx: number): void {
    if (phraseIdx < 0 || phraseIdx >= S14001ASynth.PHRASES.length) return;
    const words = S14001ASynth.PHRASES[phraseIdx];
    let i = 0;
    const playNext = () => {
      if (i >= words.length) return;
      this.speakWord(words[i]);
      i++;
      setTimeout(playNext, 400); // ~400ms per word
    };
    playNext();
  }

  setTextParam(key: string, value: string): void {
    if (key === 'speechText') this._speechText = value;
    if (key === 'presetSequence') {
      this._presetSequence = value ? value.split(',').filter(Boolean) : [];
      this._presetIndex = 0;
    }
  }

  private _speakSinglePreset(note: number, velocity: number): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    const code = this._presetSequence[this._presetIndex % this._presetSequence.length];
    this._presetIndex++;

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
        this.setPreset(f.preset);
        this.setVoiced(f.voiced);
        this.setBrightness(f.brightness);
      },
      () => {
        if (!this._presetLoopSingle) {
          this._speechSequencer = null;
          if (this.workletNode && !this._disposed) { this.workletNode.port.postMessage({ type: 'allNotesOff' }); }
        }
      }
    );
    this._speechSequencer.speak(speechFrames, this._presetLoopSingle);
  }
}

export default S14001ASynth;
