
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToTokensSmart, isQuestion, textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { type TMS5220Frame, samToTMS5220 } from '@engine/speech/tms5220PhonemeMap';
import { type VSMWord, parseVSMDirectory, scanVSMForWords } from '@engine/speech/VSMROMParser';
import { shouldAuditionRomSelection } from '@engine/speech/romSpeechRouting';
import { buildRomWordIndex, lookupRomWord } from '@engine/speech/romWordLookup';
import { buildCompletePhonemeLibrary, buildFramesFromROMLibrary } from '@engine/speech/ROMPhonemeExtractor';
import { buildWordPitchOffsets, offsetFramesPitch } from '@engine/speech/sentenceProsody';
import { packFrameBuffer } from '@engine/speech/tms5220FrameBuffer';
import { applySpeechParamOffsets } from '@engine/tms5220/speechParamOffsets';
import { IMPORTED_RECORDINGS } from '@generated/tms5220Recordings';
import { AUTHENTIC_PHONEMES } from '@generated/tms5220Phonemes';
import { loadTMS5220ROMs } from '@engine/mame/MAMEROMLoader';
import { SpeechChain } from '@engine/speech/SpeechChain';

/**
 * Global registry for ROM word names — avoids instrument store updates
 * which trigger re-render loops (synth recreated → publishes → repeat).
 * Key: chip name (e.g. "TMS5220"), Value: array of word names.
 */
const _romWordRegistry = new Map<string, string[]>();
let _romWordVersion = 0;
const _romWordListeners = new Set<() => void>();

export function getRomWordNames(chipName: string): string[] | undefined {
  return _romWordRegistry.get(chipName);
}

export function getRomWordVersion(): number {
  return _romWordVersion;
}

/**
 * Subscribe to ROM word table changes, for useSyncExternalStore.
 *
 * ROMs load asynchronously well after the editor first renders, so a component that
 * merely reads getRomWordNames() at mount sees nothing and falls back to the static
 * option list in chipParameters.ts — which is where the wrong dropdown labels came
 * from. This lets the UI re-read once the real table exists.
 */
export function subscribeRomWords(listener: () => void): () => void {
  _romWordListeners.add(listener);
  return () => { _romWordListeners.delete(listener); };
}

/** Case-insensitive lookup of an imported authentic recording by word. */
export function lookupImportedRecording(word: string) {
  const key = word.trim().toUpperCase();
  return IMPORTED_RECORDINGS.find(r => r.word === key) ?? null;
}

/** Names of every imported authentic recording (for UI badges). */
export function getImportedRecordingNames(): string[] {
  return IMPORTED_RECORDINGS.map(r => r.word);
}

const TMS5220Param = {
  VOLUME: 0,
  CHIRP_TYPE: 1,
  K1_INDEX: 2,
  K2_INDEX: 3,
  K3_INDEX: 4,
  ENERGY_INDEX: 5,
  PITCH_INDEX: 6,
  NOISE_MODE: 7,
  STEREO_WIDTH: 8,
  BRIGHTNESS: 9,
  K4_INDEX: 10,
  K5_INDEX: 11,
  K6_INDEX: 12,
  K7_INDEX: 13,
  K8_INDEX: 14,
  K9_INDEX: 15,
  K10_INDEX: 16,
  SPEECH_PITCH_OFFSET: 17,
  CABINET: 18,
  USE_ROM_WORDS: 19,
  ROM_KNOBS: 20,
} as const;

/**
 * Phoneme presets (vowel sounds)
 */
export const TMS5220Preset = {
  AH: 0,   // "father"
  EE: 1,   // "meet"
  IH: 2,   // "bit"
  OH: 3,   // "boat"
  OO: 4,   // "boot"
  AE: 5,   // "bat"
  UH: 6,   // "but"
  SH: 7,   // "shh" (unvoiced)
} as const;

/**
 * Chirp type selection
 */
export const TMS5220ChirpType = {
  ORIGINAL_SPEAK_AND_SPELL: 0,  // 1978-79 patent chirp
  LATER_TMS5220: 1,             // Later arcade/TMS5110A chirp
} as const;

/**
 * TMS5220 (Texas Instruments) - LPC Speech Synthesizer (WASM)
 *
 * Based on MAME emulator by Frank Palazzolo, Aaron Giles,
 * Jonathan Gevaryahu, Raphael Nabet, Couriersud, Michael Zapf
 * Compiled to WebAssembly via Emscripten for 1:1 accuracy
 *
 * The TMS5220 is the famous "Speak & Spell" chip - a Linear Predictive
 * Coding (LPC) speech synthesizer that generates sound by exciting a
 * 10-pole digital lattice filter with either a chirp waveform (voiced)
 * or pseudo-random noise (unvoiced).
 *
 * ROM Speech Mode (MAME-accurate):
 * - Loads VSM ROM data into WASM memory
 * - C++ engine reads bits directly from ROM (LSB-first like TMS6100)
 * - Uses MAME's exact state machine: subcycle/PC/IP timing, parse_frame(),
 *   parameter interpolation with inhibit logic, chirp/noise excitation,
 *   10-pole lattice filter
 *
 * MIDI Mode (interactive):
 * - 4-voice polyphonic LPC synth with phoneme presets
 * - Real-time K1/K2/K3 formant control via MIDI CC
 */
export class TMS5220Synth extends MAMEBaseSynth {
  readonly name = 'TMS5220Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'TMS5220';
  protected readonly workletFile = 'TMS5220.worklet.js';
  protected readonly processorName = 'tms5220-processor';

  private _romData: Uint8Array | null = null;
  private _romWords: VSMWord[] = [];
  private _romWordIndex = new Map<string, number>();
  private _romLoaded = false;
  private _romSentToWasm = false;
  private _romPhonemes: Map<string, TMS5220Frame[]> | null = null;
  private _speakingChain: (() => void) | null = null;
  private _phonemeSpeechActive = false;
  private _phonemeSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Guards multi-word playback. `_speakingChain` alone cannot distinguish "no chain"
   * from "a NEWER chain", so a pending timer from the previous utterance used to
   * resume the old word list on top of the new one — two voices at once.
   */
  private _chain = new SpeechChain();

  // Speech parameter state (applied as offsets to TTS frames)
  private _speechPitchIndex = 32;   // default center (chipParameters default)
  private _speechEnergyIndex = 10;  // default (chipParameters default)
  private _speechKIndices: [number, number, number] = [15, 15, 15]; // K1-K3 defaults
  private _speechNoiseMode = 0;     // 0 = voiced, 1 = force noise excitation

  private _singMode = true;  // When true, MIDI note shifts speech pitch
  private _speechText = 'HELLO WORLD';
  private _currentRomSpeech = 0;  // 0 = TTS mode, 1+ = ROM word index + 1
  private _romSpeechRestored = false; // first romSpeech write is the stored value, not a pick
  private _useRomWords = true; // When false, use only static/calibrated table (consistent sound)
  private _romKnobs = false; // When true, apply knob offsets to ROM words

  // Vowel sequence state
  private _vowelSequence: string[] = [];
  // UI default (VowelEditor Sustain/Loop ON) — the engine only learns this via
  // setParam, so the field default must match the UI default or held notes blip.
  private _vowelLoopSingle = true;
  private _vowelIndex = 0;
  private _heldNotes = new Set<number>();
  private _sustainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.initSynth();
    this._loadROMs();
  }

  /** Try to load Speak & Spell VSM ROMs on init */
  private async _loadROMs(): Promise<void> {
    try {
      this._romData = await loadTMS5220ROMs();

      if (!this._romData) {
        console.warn('[TMS5220] VSM ROMs not found — text-to-speech unavailable until ROM is uploaded');
        return;
      }

      // The VSM carries its own directory: system phrases plus four spelling lists.
      this._romWords = parseVSMDirectory(this._romData);
      if (this._romWords.length < 26) {
        // Not a Speak & Spell VSM — fall back to heuristic scanning.
        this._romWords = scanVSMForWords(this._romData);
        console.log(`[TMS5220] Heuristic scan: ${this._romWords.length} words found`);
      }

      this._romWordIndex = buildRomWordIndex(this._romWords);

      // Extract authentic phonemes: hand-verified letter path plus aligner-mined
      // vocabulary words, digits and phrases, with derivations for the codes no
      // recording exercises.
      if (this._romWords.length >= 26) {
        const result = buildCompletePhonemeLibrary(this._romWords);
        this._romPhonemes = result.library;
        const count = (src: string) =>
          [...result.provenance.values()].filter(p => p.source === src).length;
        console.log(
          `[TMS5220] Phoneme library: ${result.library.size} codes ` +
          `(letter ${count('letter')}, word ${count('word')}, phrase ${count('phrase')}, ` +
          `derived ${count('derived')}), ${result.droppedWords.length} recordings rejected`
        );
      }

      this._romLoaded = true;
      this.romLoaded = true;
      this._updateRomStatus(true);
      this._publishRomWordNames();
      const sampleNames = this._romWords.slice(0, 10).map(w => w.name);
      console.log(`[TMS5220] Loaded VSM ROMs: ${this._romData.length} bytes, ${this._romWords.length} words, first 10: [${sampleNames.join(', ')}]`);

      // If WASM is already ready, send ROM data now
      if (this._isReady) {
        this._sendROMToWasm();
      }
    } catch {
      console.log('[TMS5220] VSM ROMs not available (optional for text-to-speech)');
    }
  }

  /** Send ROM data to WASM worklet */
  private _sendROMToWasm(): void {
    if (!this._romData || !this.workletNode || this._romSentToWasm) return;

    // Transfer ROM data as ArrayBuffer
    const buffer = this._romData.buffer.slice(
      this._romData.byteOffset,
      this._romData.byteOffset + this._romData.byteLength
    );

    this.workletNode.port.postMessage(
      { type: 'loadROM', romData: buffer },
      [buffer] // Transfer ownership for zero-copy
    );

    // Re-create _romData since we transferred the buffer
    // (word table already has all addresses, we don't need the raw data anymore)
    this._romData = null;
    this._romSentToWasm = true;
    console.log('[TMS5220] ROM data sent to WASM worklet');
  }

  /** Publish ROM word names to the global registry for UI consumption */
  private _publishRomWordNames(): void {
    if (this._romWords.length === 0) return;
    _romWordRegistry.set(this.chipName, this._romWords.map(w => w.name));
    _romWordVersion++;
    for (const listener of _romWordListeners) listener();
  }

  /** Override message handler to send ROM when WASM is ready */
  protected override handleWorkletMessage(data: Record<string, unknown>): void {
    super.handleWorkletMessage(data);
    if (data.type === 'ready' && this._romLoaded && !this._romSentToWasm) {
      this._sendROMToWasm();
    }
  }

  /** Get list of words found in the ROM */
  get romWords(): VSMWord[] {
    return this._romWords;
  }

  /** Whether ROM data is loaded */
  get hasROM(): boolean {
    return this._romLoaded;
  }

  /** Play a word from the ROM by index (MAME-accurate: WASM reads ROM directly) */
  speakWord(index: number): void {
    this.stopSpeaking();
    this._playROMWordDirect(index);
  }

  /**
   * Send a ROM word to WASM without calling stopSpeaking().
   * Used by chain methods (speakTextHybrid, spellText) to avoid
   * nulling _speakingChain between words.
   */
  private _playROMWordDirect(index: number): void {
    if (!this._romLoaded || index < 0 || index >= this._romWords.length) return;
    if (!this._romSentToWasm || !this.workletNode || this._disposed) return;

    const word = this._romWords[index];
    const byteAddr = Math.floor(word.startBit / 8);

    console.log(`[TMS5220] speakWord: "${word.name}" at byte ${byteAddr} (via frame buffer)`);

    // If ROM words are disabled, fall back to TTS for this word
    if (!this._useRomWords) {
      const phonemeStr = textToPhonemes(word.name);
      if (phonemeStr) {
        const tokens = parsePhonemeString(phonemeStr);
        const frames = this._buildPhonemeFrames(tokens);
        this._sendFrameBufferAndSpeak(frames);
      }
      return;
    }

    // Stop the engine first: a previous frame-buffer utterance leaves the chip
    // in frame_buffer_mode.
    this.workletNode.port.postMessage({ type: 'stopSpeaking' });
    // Convert ROM LPCFrame[] to TMS5220Frame[] (add durationMs = 25ms/frame).
    // The LPCFrame.repeat flag is handled by packFrameBuffer via empty k array.
    const frames: TMS5220Frame[] = word.frames.map(f => ({
      energy: f.energy,
      pitch: f.pitch,
      k: f.k,
      unvoiced: f.unvoiced,
      durationMs: 25,
    }));
    // Apply knob offsets when rom_knobs is enabled
    this._sendFrameBufferAndSpeak(frames, undefined, this._romKnobs);
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  protected writeKeyOn(note: number, _velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    // Note: the old "play ROM word on key" mode is gone — the dropdown that set
    // _currentRomSpeech was removed, but instruments persisted a stale value
    // (e.g. 2 = "two") that hijacked every key press. Keys now always speak
    // text or sing vowels.

    if (this._singMode && this._vowelSequence.length > 0) {
      const pitchOffset = Math.round((note - 60) * 0.5);
      this.setParameterById(TMS5220Param.SPEECH_PITCH_OFFSET, pitchOffset);
      this._heldNotes.add(note);
      this._speakSingleVowel();
      if (this._vowelLoopSingle) this._startVowelSustain();
    } else if (this._singMode) {
      const pitchOffset = Math.round((note - 60) * 0.5);
      this.setParameterById(TMS5220Param.SPEECH_PITCH_OFFSET, pitchOffset);
      // Always re-trigger — the old isSpeaking skip swallowed key presses while
      // any speech was active, so a held key played nothing and the previous
      // utterance (a lexicon preview, the last Speak click) just kept going.
      // That read as "the keyboard plays the lexicon word" and as a race.
      this._heldNotes.add(note);
      this.speakText(this._speechText);
    } else {
      this.stopSpeaking();
      this.speakText(this._speechText);
    }
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;
    if (this._heldNotes.size === 0) return;
    // Release ends the sustained vowel (any key up ends it — the base synth
    // does not pass the note number here).
    this._heldNotes.clear();
    if (this._sustainTimer !== null) {
      clearTimeout(this._sustainTimer);
      this._sustainTimer = null;
    }
    // Sing mode: release cuts the current utterance, in every sing path —
    // vowel sequence or plain text.
    if (this._singMode) {
      this.stopSpeaking();
    }
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
  // TMS5220-Specific Methods
  // ===========================================================================

  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  setFormants(k: number[]): void {
    if (!this.workletNode || this._disposed) return;
    if (k.length < 10) return;
    this.setParameterById(TMS5220Param.K1_INDEX, k[0]);
    this.setParameterById(TMS5220Param.K2_INDEX, k[1]);
    this.setParameterById(TMS5220Param.K3_INDEX, k[2]);
    this.setParameterById(TMS5220Param.K4_INDEX, k[3]);
    this.setParameterById(TMS5220Param.K5_INDEX, k[4]);
    this.setParameterById(TMS5220Param.K6_INDEX, k[5]);
    this.setParameterById(TMS5220Param.K7_INDEX, k[6]);
    this.setParameterById(TMS5220Param.K8_INDEX, k[7]);
    this.setParameterById(TMS5220Param.K9_INDEX, k[8]);
    this.setParameterById(TMS5220Param.K10_INDEX, k[9]);
  }

  setNoiseMode(noise: boolean): void {
    if (!this.workletNode || this._disposed) return;
    this.setParameterById(TMS5220Param.NOISE_MODE, noise ? 1 : 0);
  }

  setChirpType(type: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setChirpType', value: type });
  }

  setEnergy(index: number): void {
    this.setParameterById(TMS5220Param.ENERGY_INDEX, index);
  }

  setBrightness(value: number): void {
    this.setParameterById(TMS5220Param.BRIGHTNESS, value);
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
  // Text-to-Speech
  // ===========================================================================

  /** Speak English text - uses imported recordings, ROM words when available, SAM phonemes as fallback */
  speakText(text: string): void {
    if (!this._isReady || !this.workletNode) {
      this._pendingCalls.push({ method: 'speakText', args: [text] });
      return;
    }

    // Single-word authentic recordings (ti_lpc/QBoxPro) play directly; for
    // multi-word text the hybrid chain routes each word through them anyway.
    const recording = lookupImportedRecording(text);
    if (recording) {
      this.stopSpeaking();
      // Authentic imported recording: play byte-exact without knob offsets
      this._sendFrameBufferAndSpeak(recording.frames, undefined, false);
      return;
    }

    // When ROM is loaded in WASM, use hybrid approach
    if (this._romSentToWasm && this._romWords.length > 0) {
      this.speakTextHybrid(text);
      return;
    }

    // Fallback: SAM phoneme synthesis via frame buffer (MAME engine)
    this._speakPhonemeText(text);
  }

  /**
   * Schedule the next step of a word chain, tagged with the generation the chain
   * started in. Stale steps are dropped instead of playing over the new utterance.
   */
  private _scheduleChainStep(generation: number, step: () => void, delayMs: number): void {
    this._chain.schedule(generation, step, delayMs);
  }

  /** Begin a new utterance: invalidates every pending step of the previous one. */
  private _beginChain(): number {
    this.stopSpeaking();
    return this._chain.begin();
  }

  /** Stop current speech playback */
  stopSpeaking(): void {
    this._speakingChain = null;
    this._phonemeSpeechActive = false;
    // Invalidate in-flight chain steps and drop their timers.
    this._chain.cancel();
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
    return this._phonemeSpeechActive || this._speakingChain !== null;
  }

  /** Play a single letter from the ROM (A-Z) */
  speakLetter(letter: string): void {
    const idx = this._romWords.findIndex(w => w.name === letter.toUpperCase());
    if (idx >= 0) this.speakWord(idx);
  }

  /** Spell out text letter-by-letter using authentic ROM recordings */
  spellText(text: string): void {
    const generation = this._beginChain();
    const letters = text.toUpperCase().split('').filter(c => /[A-Z]/.test(c));
    if (letters.length === 0) return;

    let idx = 0;
    const playNext = () => {
      if (idx >= letters.length || !this._chain.isCurrent(generation)) return;
      const wordIdx = this._romWords.findIndex(w => w.name === letters[idx]);
      idx++;
      if (wordIdx >= 0) {
        this._playROMWordDirect(wordIdx);
        // Wait for word duration (~25ms * frames) then play next
        const word = this._romWords[wordIdx];
        const durationMs = word.frames.length * 25 + 100;
        this._scheduleChainStep(generation, playNext, durationMs);
      } else {
        this._scheduleChainStep(generation, playNext, 300);
      }
    };
    this._speakingChain = playNext;
    playNext();
  }

  /**
   * Hybrid TTS: ROM recordings for single-letter words (A-Z verified),
   * SAM phoneme synthesis for everything else.
   *
   * Only the first 26 ROM entries (letters A-Z) have verified name→audio mapping.
   * Vocabulary words after index 25 may have incorrect name mappings depending on
   * the ROM version, so we route those through the phoneme pipeline instead.
   */
  speakTextHybrid(text: string): void {
    const generation = this._beginChain();

    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    const isQuestionText = isQuestion(text);
    const wordPitchOffsets = buildWordPitchOffsets(words.length, isQuestionText);

    let wordIndex = 0;

    const playNext = () => {
      if (!this._chain.isCurrent(generation)) return; // a newer utterance took over
      if (wordIndex >= words.length) {
        this._speakingChain = null;
        return;
      }

      const wi = wordIndex;
      const word = words[wordIndex++];

      // Every recording the ROM names — the letters, the digits and the 117 spelled
      // vocabulary words — is fair game. A real TI recording of the typed word beats
      // synthesising it from the hand-authored coefficient table every time.
      const romIdx = lookupRomWord(this._romWordIndex, word);

      // Authentic imported recordings (ti_lpc/QBoxPro) beat ROM words and
      // phoneme synthesis — a real TI recording of the typed word is the best
      // possible render. ISLE/COLOR/NEIGHBOR/YOUR SCORE are byte-identical to
      // the ROM copies, so this never regresses ROM playback.
      const recording = lookupImportedRecording(word);

      if (recording) {
        const frames = offsetFramesPitch(recording.frames, wordPitchOffsets[wi]);
        // Authentic imported recording: play byte-exact without knob offsets
        this._sendFrameBufferAndSpeak(frames, undefined, false);
        const totalMs = frames.reduce((sum, f) => sum + f.durationMs, 0) + 120;
        this._scheduleChainStep(generation, playNext, totalMs);
      } else if (romIdx >= 0) {
        // Single letter: play via ROM (verified A-Z mapping). Byte-exact
        // playback — the prosody offset is not applied to ROM words (v1).
        this._playROMWordDirect(romIdx);
        const romWord = this._romWords[romIdx];
        const durationMs = romWord.frames.length * 25 + 120;
        this._scheduleChainStep(generation, playNext, durationMs);
      } else {
        // All other words: SAM phoneme synthesis
        this._speakPhonemeWord(word, wordPitchOffsets[wi], () => {
          this._scheduleChainStep(generation, playNext, 90);
        });
      }
    };

    this._speakingChain = playNext;
    playNext();
  }

  /**
   * Pack TMS5220Frame[] into a flat frame buffer for the MAME engine.
   * Each frame is 12 bytes: [energy_idx, pitch_idx, k0..k9].
   * Frames are expanded based on durationMs (25ms per MAME frame).
   */
  private _packFrameBuffer(frames: TMS5220Frame[]): { data: Uint8Array; numFrames: number } {
    return packFrameBuffer(frames);
  }

  /** Apply pitch/energy/formant/noise knob offsets to TTS frames before sending to WASM */
  private _applySpeechParamsToFrames(frames: TMS5220Frame[]): TMS5220Frame[] {
    return applySpeechParamOffsets(frames, {
      pitchIndex: this._speechPitchIndex,
      energyIndex: this._speechEnergyIndex,
      kIndices: this._speechKIndices,
      noiseMode: this._speechNoiseMode,
    });
  }

  /** Send a frame buffer to WASM and start speaking */
  private _sendFrameBufferAndSpeak(
    frames: TMS5220Frame[],
    onDone?: () => void,
    applyKnobOffsets = true
  ): void {
    if (!this.workletNode || this._disposed) {
      onDone?.();
      return;
    }

    // Apply pitch/energy/formant/noise knob offsets for TTS synthesis.
    // Authentic ROM words/recordings pass applyKnobOffsets=false to play byte-exact.
    const modifiedFrames = applyKnobOffsets
      ? this._applySpeechParamsToFrames(frames)
      : frames;
    const { data, numFrames } = this._packFrameBuffer(modifiedFrames);

    // Transfer frame buffer to worklet
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.workletNode.port.postMessage(
      { type: 'loadFrameBuffer', frameData: buffer, numFrames },
      [buffer]
    );

    // Start speaking through MAME engine (volume already set via setParameter knob)
    this.workletNode.port.postMessage({ type: 'speakFrameBuffer' });

    this._phonemeSpeechActive = true;

    // Estimate total duration for callback (cancellable via stopSpeaking)
    if (onDone) {
      const totalMs = numFrames * 25 + 50; // 25ms per frame + buffer tail
      this._phonemeSpeechTimer = setTimeout(() => {
        this._phonemeSpeechTimer = null;
        this._phonemeSpeechActive = false;
        onDone();
      }, totalMs);
    }
  }

  /** Build TMS5220 frames for phoneme tokens, using ROM data when available */
  private _buildPhonemeFrames(tokens: Array<{ code: string; stress: number }>): TMS5220Frame[] {
    // Always use the authentic multi-frame library (AUTHENTIC_PHONEMES or runtime-mined)
    // for natural prosody. The _useRomWords flag controls ROM *word* playback only,
    // not the phoneme library quality.
    const library = this._romPhonemes && this._romPhonemes.size > 0
      ? this._romPhonemes
      : new Map(Object.entries(AUTHENTIC_PHONEMES));
    return buildFramesFromROMLibrary(tokens, library, samToTMS5220);
  }

  /** Speak full text via SAM phonemes through MAME engine frame buffer */
  private _speakPhonemeText(text: string): void {
    this.stopSpeaking();

    const tokens = textToTokensSmart(text);
    if (!tokens) return;

    const frames = this._buildPhonemeFrames(tokens);
    if (frames.length === 0) return;

    this._sendFrameBufferAndSpeak(frames, () => {
      this._phonemeSpeechActive = false;
    });
  }

  /** Synthesize a single word using SAM phoneme-to-LPC mapping through MAME engine */
  private _speakPhonemeWord(word: string, pitchOffset: number, onDone: () => void): void {
    const tokens = textToTokensSmart(word);
    if (!tokens) { onDone(); return; }

    const frames = offsetFramesPitch(this._buildPhonemeFrames(tokens), pitchOffset);
    if (frames.length === 0) { onDone(); return; }

    // Stop any current WASM speech first
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'stopSpeaking' });
    }

    this._sendFrameBufferAndSpeak(frames, onDone);
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
      volume: TMS5220Param.VOLUME,
      chirp_type: TMS5220Param.CHIRP_TYPE,
      k1_index: TMS5220Param.K1_INDEX,
      k2_index: TMS5220Param.K2_INDEX,
      k3_index: TMS5220Param.K3_INDEX,
      energy_index: TMS5220Param.ENERGY_INDEX,
      pitch_index: TMS5220Param.PITCH_INDEX,
      noise_mode: TMS5220Param.NOISE_MODE,
      stereo_width: TMS5220Param.STEREO_WIDTH,
      brightness: TMS5220Param.BRIGHTNESS,
      cabinet: TMS5220Param.CABINET,
      use_rom_words: TMS5220Param.USE_ROM_WORDS,
      rom_knobs: TMS5220Param.ROM_KNOBS,
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }

    // Track speech-relevant params locally for TTS frame modification
    if (param === 'pitch_index') this._speechPitchIndex = value;
    if (param === 'energy_index') this._speechEnergyIndex = value;
    if (param === 'k1_index') this._speechKIndices[0] = value;
    if (param === 'k2_index') this._speechKIndices[1] = value;
    if (param === 'k3_index') this._speechKIndices[2] = value;
    if (param === 'noise_mode') this._speechNoiseMode = value >= 1 ? 1 : 0;
    if (param === 'sing_mode') this._singMode = value >= 1;
    if (param === 'vowelLoopSingle') this._vowelLoopSingle = value >= 1;
    if (param === 'use_rom_words') this._useRomWords = value >= 1;
    if (param === 'rom_knobs') this._romKnobs = value >= 1;
    if (param === 'romSpeech') {
      const selection = Math.round(value);
      const previous = this._currentRomSpeech;
      this._currentRomSpeech = selection;
      // Auditioning belongs to the list, not to the Speak button: giving a stale list
      // selection precedence over the text field left typed text unspeakable until the
      // list was set back to "(Text-to-Speech)". The first application after load is the
      // stored value being restored, so it stays silent; later changes are the user
      // picking a word and are played straight away.
      if (shouldAuditionRomSelection({
        previous,
        next: selection,
        romReady: this._romSentToWasm,
        restored: this._romSpeechRestored,
      })) {
        this.stopSpeaking();
        this.speakWord(selection - 1);
      }
      this._romSpeechRestored = true;
    }
  }

  /** Store speech text for use in Speech mode noteOn */
  setTextParam(key: string, value: string): void {
    if (key === 'speechText') {
      this._speechText = value;
    }
    if (key === 'vowelSequence') {
      this._vowelSequence = value ? value.split(',').filter(Boolean) : [];
      this._vowelIndex = 0;
    }
  }

  /** Speak a single vowel from the sequence through the frame buffer */
  private _speakSingleVowel(): void {
    if (!this._isReady || !this.workletNode || this._disposed) return;

    const code = this._vowelSequence[this._vowelIndex % this._vowelSequence.length];
    this._vowelIndex++;

    const frame = samToTMS5220(code);
    if (!frame) return;

    this.stopSpeaking();

    // Sustain/Loop: repeat the frame to create a sustained sound that keeps
    // playing while the key is held (_startVowelSustain re-sends it).
    // One-shot: a short audible blip (~200 ms), not a single 25 ms frame.
    const frames = this._vowelLoopSingle
      ? Array(40).fill(frame) // ~1 second of frames, will be retriggered on next note
      : Array(8).fill(frame);

    this._sendFrameBufferAndSpeak(frames, () => {
      this._phonemeSpeechActive = false;
    });
  }

  /**
   * Keep the sustained vowel sounding while a key is held: re-send the current
   * vowel's frames every ~950 ms (each send is ~1 s). writeKeyOff stops the
   * timer and the sound.
   */
  private _startVowelSustain(): void {
    if (this._sustainTimer !== null) return;
    const loop = () => {
      this._sustainTimer = null;
      if (this._heldNotes.size === 0 || this._vowelSequence.length === 0) return;
      const code = this._vowelSequence[this._vowelIndex % this._vowelSequence.length];
      const frame = samToTMS5220(code);
      if (frame) {
        this._sendFrameBufferAndSpeak(Array(40).fill(frame));
      }
      this._sustainTimer = setTimeout(loop, 950);
    };
    this._sustainTimer = setTimeout(loop, 950);
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

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

export default TMS5220Synth;
