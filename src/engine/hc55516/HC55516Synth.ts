
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type SP0250Frame, phonemesToSP0250Frames, samToSP0250 } from '@engine/speech/sp0250PhonemeMap';
import { loadHC55516ROMs } from '@engine/mame/MAMEROMLoader';

/**
 * HC55516 Parameter IDs (matching C++ enum)
 */
const HC55516Param = {
  VOLUME: 0,
  PRESET: 1,
  VOICED: 2,
  BRIGHTNESS: 3,
  STEREO_WIDTH: 4,
  GRITTINESS: 5,     // Amount of CVSD character/noise
} as const;

/**
 * Waveform presets
 */
export const HC55516Preset = {
  AH: 0,       // /a/ (father) - open vowel via CVSD
  EE: 1,       // /i:/ (beet) - bright, rapid transitions
  IH: 2,       // /ɪ/ (bit) - between AH and EE
  OH: 3,       // /oʊ/ (boat) - rounded, longer runs
  OO: 4,       // /u:/ (boot) - very rounded, deepest
  NN: 5,       // Nasal /n/ - muted with anti-resonance
  ZZ: 6,       // Buzz/fricative (noise-like)
  HH: 7,       // Breathy/aspirate (soft noise)
} as const;

/**
 * HC55516 Synthesizer - Harris HC55516 CVSD Speech Codec (WASM)
 *
 * Based on MAME emulator by Aaron Giles, Jonathan Gevaryahu
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The HC55516 is a CVSD (Continuously Variable Slope Delta) modulation
 * codec used in Williams/Bally arcade and pinball:
 * - 1-bit input per clock, syllabic filter adapts step size
 * - Integration filter smooths output
 * - Characteristic lo-fi, gritty, noisy speech
 * - Used in Defender, Robotron, Joust, Sinistar
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class HC55516Synth extends MAMEBaseSynth {
  readonly name = 'HC55516Synth';

  protected readonly chipName = 'HC55516';
  protected readonly workletFile = 'HC55516.worklet.js';
  protected readonly processorName = 'hc55516-processor';

  private _speechSequencer: SpeechSequencer<SP0250Frame> | null = null;

  private _singMode = true;
  private _speechText = 'I HUNGER';

  private _presetSequence: string[] = [];
  private _presetLoopSingle = false;
  private _presetIndex = 0;

  // ROM state
  private _romData: Uint8Array | null = null;
  private _romSentToWasm = false;
  private _currentRomSpeech = 0;  // merged selector: 0..6 = phrases, 7+ = words
  private static readonly PHRASE_COUNT = 7;

  constructor() {
    super();
    this.initSynth();
  }

  protected async initialize(): Promise<void> {
    let romData: Uint8Array | null = null;
    try {
      romData = await loadHC55516ROMs();
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
  // ROM/Bitstream Loading
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

  playBitstream(byteOffset = 0, byteLength = 0): void {
    if (!this._romSentToWasm || !this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'playBitstream', byteOffset, byteLength });
  }

  stopROMSpeaking(): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'stopSpeaking' });
  }

  // ===========================================================================
  // Frame Buffer Speech (TTS pipeline preset sequencing)
  // Frame format: 2 bytes per frame [presetIndex, duration10ms]
  // ===========================================================================

  private _phonemeSpeechActive = false;
  private _phonemeSpeechTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Send frame buffer to WASM and start speaking.
   * Each frame is 2 bytes: [presetIndex, duration_10ms_units]
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
      totalMs += data[i * 2 + 1] * 10;
    }
    this._phonemeSpeechTimer = setTimeout(() => {
      this._phonemeSpeechTimer = null;
      this._phonemeSpeechActive = false;
      if (onDone) onDone();
    }, totalMs);
  }

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    // ROM speech: play selected ROM phrase/word
    if (this._romSentToWasm) {
      this._playRomSpeech(this._currentRomSpeech);
      return;
    }

    // TTS speech
    if (this._singMode && this._presetSequence.length > 0) {
      this._speakSinglePreset(note, velocity);
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
  // HC55516-Specific Methods
  // ===========================================================================

  setVolume(value: number): void {
    this.setParameterById(HC55516Param.VOLUME, value);
  }

  setPreset(value: number): void {
    this.setParameterById(HC55516Param.PRESET, value);
  }

  setVoiced(voiced: boolean): void {
    this.setParameterById(HC55516Param.VOICED, voiced ? 1.0 : 0.0);
  }

  setBrightness(value: number): void {
    this.setParameterById(HC55516Param.BRIGHTNESS, value);
  }

  setGrittiness(value: number): void {
    this.setParameterById(HC55516Param.GRITTINESS, value);
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
      volume: HC55516Param.VOLUME,
      preset: HC55516Param.PRESET,
      voiced: HC55516Param.VOICED,
      brightness: HC55516Param.BRIGHTNESS,
      stereo_width: HC55516Param.STEREO_WIDTH,
      grittiness: HC55516Param.GRITTINESS,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }

    if (param === 'sing_mode') this._singMode = value >= 1;
    if (param === 'presetLoopSingle') this._presetLoopSingle = value >= 1;
    if (param === 'romSpeech') {
      this._currentRomSpeech = Math.round(value);
    }
  }

  /** Play ROM speech — phrases (0..6) or individual words (7+) */
  private _playRomSpeech(selection: number): void {
    if (selection < HC55516Synth.PHRASE_COUNT) {
      this._playPhrase(selection);
    } else {
      this._playROMWord(selection - HC55516Synth.PHRASE_COUNT);
    }
  }

  /** Sinistar phrase sequences (word indices into SINISTAR_WORDS) */
  private static readonly PHRASES: number[][] = [
    [1, 2, 3],   // I AM SINISTAR
    [8, 1, 6],   // BEWARE I LIVE
    [1, 7],      // I HUNGER
    [8, 4],      // BEWARE COWARD
    [5, 4],      // RUN COWARD
    [5, 5, 5],   // RUN RUN RUN
    [1, 7, 4],   // I HUNGER COWARD
  ];

  private _playPhrase(phraseIdx: number): void {
    if (phraseIdx < 0 || phraseIdx >= HC55516Synth.PHRASES.length) return;
    const words = HC55516Synth.PHRASES[phraseIdx];
    let i = 0;
    const playNext = () => {
      if (i >= words.length) return;
      this._playROMWord(words[i]);
      i++;
      setTimeout(playNext, 800);
    };
    playNext();
  }

  /** Sinistar CVSD word table: [byteOffset, byteLength] in concatenated IC7+IC5+IC6+IC4 */
  private static readonly SINISTAR_WORDS: Array<[number, number]> = [
    [0x0000, 4737],  // 0: ROAR
    [0x1281, 657],   // 1: I
    [0x1512, 1071],  // 2: AM
    [0x1941, 2257],  // 3: SINISTAR
    [0x2212, 1777],  // 4: COWARD
    [0x2903, 1100],  // 5: RUN
    [0x2D4F, 1297],  // 6: LIVE
    [0x3260, 1226],  // 7: HUNGER
    [0x372A, 1625],  // 8: BEWARE
  ];

  private _playROMWord(index: number): void {
    if (index < 0 || index >= HC55516Synth.SINISTAR_WORDS.length) return;
    const [offset, length] = HC55516Synth.SINISTAR_WORDS[index];
    this.playBitstream(offset, length);
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

export default HC55516Synth;
