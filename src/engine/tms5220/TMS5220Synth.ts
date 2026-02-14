
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { type TMS5220Frame, phonemesToTMS5220Frames, samToTMS5220 } from '@engine/speech/tms5220PhonemeMap';
import { type VSMWord, buildWordTableFromMCU, scanVSMForWords } from '@engine/speech/VSMROMParser';
import { extractPhonemeLibrary, buildFramesFromROMLibrary } from '@engine/speech/ROMPhonemeExtractor';
import { loadTMS5220ROMs } from '@engine/mame/MAMEROMLoader';
import { normalizeUrl } from '@/utils/urlUtils';

/**
 * TMS5220 Parameter IDs (matching C++ enum)
 */
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
  private _romLoaded = false;
  private _romSentToWasm = false;
  private _romPhonemes: Map<string, TMS5220Frame[]> | null = null;
  private _speakingChain: (() => void) | null = null;
  private _phonemeSpeechActive = false;
  private _phonemeSpeechTimer: ReturnType<typeof setTimeout> | null = null;

  // Speech parameter state (applied as offsets to TTS frames)
  private _speechPitchIndex = 32;   // default center (chipParameters default)
  private _speechEnergyIndex = 10;  // default (chipParameters default)

  // Mode: 0 = Tone (MIDI), 1 = Speech (TTS on noteOn)
  private _mode: 0 | 1 = 1;
  private _singMode = true;  // When true, MIDI note shifts speech pitch (like SAM/V2Speech)
  private _speechText = 'HELLO WORLD';

  // Vowel sequence state
  private _vowelSequence: string[] = [];
  private _vowelLoopSingle = true;
  private _vowelIndex = 0;

  constructor() {
    super();
    this.initSynth();
    this._loadROMs();
  }

  /** Try to load Speak & Spell VSM ROMs on init */
  private async _loadROMs(): Promise<void> {
    try {
      this._romData = await loadTMS5220ROMs();

      // Try to build word table from VSM ROM address table
      try {
        const mcuResponse = await fetch(normalizeUrl('/roms/snspell/tmc0271h-n2l'));
        if (!mcuResponse.ok) throw new Error(`MCU ROM not found (${mcuResponse.status})`);
        const mcuBuffer = await mcuResponse.arrayBuffer();
        this._romWords = buildWordTableFromMCU(new Uint8Array(mcuBuffer), this._romData);
        console.log(`[TMS5220] Built word table from ROM: ${this._romWords.length} words`);
      } catch {
        // Fall back to heuristic scanning
        this._romWords = scanVSMForWords(this._romData);
        console.log(`[TMS5220] Heuristic scan: ${this._romWords.length} words found`);
      }

      // Extract authentic phonemes from A-Z letter recordings
      if (this._romWords.length >= 26) {
        this._romPhonemes = extractPhonemeLibrary(this._romWords.slice(0, 26));
      }

      this._romLoaded = true;
      this.romLoaded = true;
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

    console.log(`[TMS5220] speakWord: "${word.name}" at byte ${byteAddr}`);

    // Set volume and tell WASM to speak at this address
    this.workletNode.port.postMessage({ type: 'setVolume', value: 1.0 });
    this.workletNode.port.postMessage({ type: 'speakAtByte', byteAddr });
  }

  // ===========================================================================
  // MAMEBaseSynth Abstract Method Implementations
  // ===========================================================================

  protected writeKeyOn(note: number, velocity: number): void {
    if (!this.workletNode || this._disposed) return;

    if (this._mode === 1) {
      // Speech mode
      if (this._singMode && this._vowelSequence.length > 0) {
        // Vowel sequence mode: cycle through vowels per note
        const pitchOffset = Math.round((note - 60) * 0.5);
        this.setParameterById(TMS5220Param.SPEECH_PITCH_OFFSET, pitchOffset);
        this._speakSingleVowel();
      } else if (this._singMode) {
        // Sing mode: MIDI note controls pitch via WASM offset (slides smoothly)
        const pitchOffset = Math.round((note - 60) * 0.5);
        this.setParameterById(TMS5220Param.SPEECH_PITCH_OFFSET, pitchOffset);

        // Only start speech if not already speaking — don't retrigger
        if (!this.isSpeaking) {
          this.speakText(this._speechText);
        }
      } else {
        // Non-sing: each note retriggers speech from the start (one-shot)
        this.stopSpeaking();
        this.speakText(this._speechText);
      }
    } else {
      // Tone mode: standard MIDI noteOn
      this.workletNode.port.postMessage({
        type: 'noteOn',
        note,
        velocity: Math.floor(velocity * 127),
      });
    }
  }

  protected writeKeyOff(): void {
    if (!this.workletNode || this._disposed) return;

    if (this._mode === 1) {
      // Speech mode: let speech finish naturally (like SAM)
    } else {
      this.workletNode.port.postMessage({ type: 'noteOff', note: this.currentNote });
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

  /** Speak English text - uses ROM words when available, SAM phonemes as fallback */
  speakText(text: string): void {
    if (!this._isReady || !this.workletNode) {
      this._pendingCalls.push({ method: 'speakText', args: [text] });
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

  /** Stop current speech playback */
  stopSpeaking(): void {
    this._speakingChain = null;
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
    return this._phonemeSpeechActive || this._speakingChain !== null;
  }

  /** Play a single letter from the ROM (A-Z) */
  speakLetter(letter: string): void {
    const idx = this._romWords.findIndex(w => w.name === letter.toUpperCase());
    if (idx >= 0) this.speakWord(idx);
  }

  /** Spell out text letter-by-letter using authentic ROM recordings */
  spellText(text: string): void {
    this.stopSpeaking();
    const letters = text.toUpperCase().split('').filter(c => /[A-Z]/.test(c));
    if (letters.length === 0) return;

    let idx = 0;
    const playNext = () => {
      if (idx >= letters.length || !this._speakingChain) return;
      const wordIdx = this._romWords.findIndex(w => w.name === letters[idx]);
      idx++;
      if (wordIdx >= 0) {
        this._playROMWordDirect(wordIdx);
        // Wait for word duration (~25ms * frames) then play next
        const word = this._romWords[wordIdx];
        const durationMs = word.frames.length * 25 + 100;
        setTimeout(playNext, durationMs);
      } else {
        setTimeout(playNext, 300);
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
    this.stopSpeaking();

    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let wordIndex = 0;

    const playNext = () => {
      if (wordIndex >= words.length || !this._speakingChain) {
        this._speakingChain = null;
        return;
      }

      const word = words[wordIndex++];

      // Only match single letters against ROM (first 26 entries are verified A-Z)
      let romIdx = -1;
      if (word.length === 1 && /^[A-Za-z]$/.test(word)) {
        romIdx = this._romWords.findIndex(
          (w, i) => i < 26 && w.name.toLowerCase() === word.toLowerCase()
        );
      }

      console.log(`[TMS5220] hybrid: word="${word}" → romIdx=${romIdx}`);

      if (romIdx >= 0) {
        // Single letter: play via ROM (verified A-Z mapping)
        this._playROMWordDirect(romIdx);
        const romWord = this._romWords[romIdx];
        const durationMs = romWord.frames.length * 25 + 200;
        setTimeout(playNext, durationMs);
      } else {
        // All other words: SAM phoneme synthesis
        this._speakPhonemeWord(word, () => {
          setTimeout(playNext, 200);
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
    // First pass: count total MAME frames needed
    let totalFrames = 0;
    for (const frame of frames) {
      const count = Math.max(1, Math.round(frame.durationMs / 25));
      totalFrames += count;
    }

    // Add a silence frame at the end so the engine ramps down cleanly
    totalFrames += 1;

    const data = new Uint8Array(totalFrames * 12);
    let offset = 0;

    // K index max values per coefficient (from KBITS: 5,5,4,4,4,4,4,3,3,3)
    const kMax = [31, 31, 15, 15, 15, 15, 15, 7, 7, 7];

    for (const frame of frames) {
      const count = Math.max(1, Math.round(frame.durationMs / 25));
      // Clamp to valid table ranges: energy [1,14] (0=silence, 15=stop), pitch [0,31]
      const energyIdx = Math.min(Math.max(frame.energy, 1), 14);
      const pitchIdx = frame.unvoiced ? 0 : Math.min(Math.max(frame.pitch, 0), 31);
      const k = frame.k;

      for (let i = 0; i < count; i++) {
        data[offset] = energyIdx;
        data[offset + 1] = pitchIdx;
        for (let ki = 0; ki < 10; ki++) {
          data[offset + 2 + ki] = Math.min(Math.max(k[ki] ?? 0, 0), kMax[ki]);
        }
        offset += 12;
      }
    }

    // Final silence frame (energy=0) to end speech cleanly
    data[offset] = 0; // energy 0 = silence
    // pitch and K default to 0 (already zeroed)

    return { data, numFrames: totalFrames };
  }

  /** Apply pitch/energy knob offsets to TTS frames before sending to WASM */
  private _applySpeechParamsToFrames(frames: TMS5220Frame[]): TMS5220Frame[] {
    const pitchOffset = this._speechPitchIndex - 32;  // 32 = center/default
    const energyScale = this._speechEnergyIndex / 10; // 10 = default

    // Skip if no modification needed
    if (pitchOffset === 0 && Math.abs(energyScale - 1) < 0.01) return frames;

    return frames.map(f => {
      let newPitch = f.pitch;
      let newEnergy = f.energy;

      // Apply pitch offset to voiced frames (pitch > 0)
      if (pitchOffset !== 0 && f.pitch > 0) {
        newPitch = Math.max(1, Math.min(31, f.pitch + pitchOffset));
      }

      // Apply energy scaling
      if (Math.abs(energyScale - 1) >= 0.01 && f.energy > 0 && f.energy < 15) {
        newEnergy = Math.max(1, Math.min(14, Math.round(f.energy * energyScale)));
      }

      if (newPitch === f.pitch && newEnergy === f.energy) return f;
      return { ...f, pitch: newPitch, energy: newEnergy };
    });
  }

  /** Send a frame buffer to WASM and start speaking */
  private _sendFrameBufferAndSpeak(frames: TMS5220Frame[], onDone?: () => void): void {
    if (!this.workletNode || this._disposed) {
      onDone?.();
      return;
    }

    // Apply pitch/energy knob offsets before packing
    const modifiedFrames = this._applySpeechParamsToFrames(frames);
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
      const totalMs = numFrames * 25 + 100; // 25ms per frame + buffer
      this._phonemeSpeechTimer = setTimeout(() => {
        this._phonemeSpeechTimer = null;
        this._phonemeSpeechActive = false;
        onDone();
      }, totalMs);
    }
  }

  /** Build TMS5220 frames for phoneme tokens, using ROM data when available */
  private _buildPhonemeFrames(tokens: Array<{ code: string; stress: number }>): TMS5220Frame[] {
    if (this._romPhonemes && this._romPhonemes.size > 0) {
      return buildFramesFromROMLibrary(tokens, this._romPhonemes, samToTMS5220);
    }
    return phonemesToTMS5220Frames(tokens);
  }

  /** Speak full text via SAM phonemes through MAME engine frame buffer */
  private _speakPhonemeText(text: string): void {
    this.stopSpeaking();

    const phonemeStr = textToPhonemes(text);
    if (!phonemeStr) return;

    const tokens = parsePhonemeString(phonemeStr);
    const frames = this._buildPhonemeFrames(tokens);
    if (frames.length === 0) return;

    this._sendFrameBufferAndSpeak(frames, () => {
      this._phonemeSpeechActive = false;
    });
  }

  /** Synthesize a single word using SAM phoneme-to-LPC mapping through MAME engine */
  private _speakPhonemeWord(word: string, onDone: () => void): void {
    const phonemeStr = textToPhonemes(word);
    if (!phonemeStr) { onDone(); return; }

    const tokens = parsePhonemeString(phonemeStr);
    const frames = this._buildPhonemeFrames(tokens);
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
    };

    const paramId = paramMap[param];
    if (paramId !== undefined) {
      this.setParameterById(paramId, value);
    }

    // Track speech-relevant params locally for TTS frame modification
    if (param === 'pitch_index') this._speechPitchIndex = value;
    if (param === 'energy_index') this._speechEnergyIndex = value;
    if (param === 'mode') this._mode = value >= 1 ? 1 : 0;
    if (param === 'sing_mode') this._singMode = value >= 1;
    if (param === 'vowelLoopSingle') this._vowelLoopSingle = value >= 1;
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

    // For looping, repeat the frame multiple times to create a sustained sound
    const frames = this._vowelLoopSingle
      ? Array(40).fill(frame) // ~1 second of frames, will be retriggered on next note
      : [frame];

    this._sendFrameBufferAndSpeak(frames, () => {
      this._phonemeSpeechActive = false;
    });
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
