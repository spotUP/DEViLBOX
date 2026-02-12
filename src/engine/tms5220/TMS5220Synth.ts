
import { MAMEBaseSynth } from '@engine/mame/MAMEBaseSynth';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { SpeechSequencer, type SpeechFrame } from '@engine/speech/SpeechSequencer';
import { type TMS5220Frame, phonemesToTMS5220Frames } from '@engine/speech/tms5220PhonemeMap';
import { type LPCFrame, scanVSMForWords, buildWordTableFromMCU, type VSMWord } from '@engine/speech/VSMROMParser';
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
 * Features:
 * - 4-voice polyphony (4 independent TMS5220 LPC engines)
 * - 10-pole digital lattice filter (faithful from MAME)
 * - Chirp excitation for voiced sounds (52-element ROM table)
 * - 13-bit LFSR noise for unvoiced sounds (20 updates per sample)
 * - Frame-based parameter interpolation (25ms frames, 8 IPs)
 * - Two chirp ROM variants (original Speak & Spell + later TMS5220)
 * - 8 phoneme presets (7 vowels + 1 unvoiced fricative)
 * - Real-time K1/K2/K3 formant control via MIDI CC
 * - Internal 8kHz processing rate (authentic)
 *
 * Used in: TI Speak & Spell (1978), arcade games (Berzerk, Star Wars,
 * Bagman, Blue Wizard Is About To Die), Atari games
 *
 * Now extends MAMEBaseSynth for:
 * - Macro system (volume, arpeggio, pitch, panning)
 * - Tracker effects (0x00-0x0F and Exy)
 * - Velocity scaling
 * - Oscilloscope support
 */
export class TMS5220Synth extends MAMEBaseSynth {
  readonly name = 'TMS5220Synth';

  // MAMEBaseSynth chip configuration
  protected readonly chipName = 'TMS5220';
  protected readonly workletFile = 'TMS5220.worklet.js';
  protected readonly processorName = 'tms5220-processor';

  private _speechSequencer: SpeechSequencer<TMS5220Frame> | null = null;
  private _romData: Uint8Array | null = null;
  private _romWords: VSMWord[] = [];
  private _romLoaded = false;
  private _romSequencer: SpeechSequencer<LPCFrame> | null = null;

  constructor() {
    super();
    this.initSynth();
    this._loadROMs();
  }

  /** Try to load Speak & Spell VSM ROMs on init */
  private async _loadROMs(): Promise<void> {
    try {
      this._romData = await loadTMS5220ROMs();

      // Try to build word table from VSM ROM address table (via MCU ROM)
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

      this._romLoaded = true;
      console.log(`[TMS5220] Loaded VSM ROMs: ${this._romData.length} bytes, ${this._romWords.length} named words`);
    } catch (e) {
      console.log('[TMS5220] VSM ROMs not available (optional for text-to-speech)');
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

  /** Play a word from the ROM by index */
  speakWord(index: number): void {
    if (!this._romLoaded || index < 0 || index >= this._romWords.length) return;

    this.stopSpeaking();
    const word = this._romWords[index];
    const lastK = [8, 8, 8, 8, 8, 8, 8, 4, 4, 4]; // Default K values for repeat frames

    const speechFrames: SpeechFrame<LPCFrame>[] = word.frames.map(f => ({
      data: f,
      durationMs: 25, // 25ms per TMS5220 frame (200 samples at 8kHz)
    }));

    // Activate a voice via the full triggerAttack path
    this.triggerAttack(60, undefined, 0.8);

    this._romSequencer = new SpeechSequencer<LPCFrame>(
      (frame) => {
        if (frame.energy === 0) return; // Silent frame
        const k = frame.repeat ? lastK : frame.k;
        if (!frame.repeat && frame.k.length >= 3) {
          for (let i = 0; i < frame.k.length; i++) lastK[i] = frame.k[i];
        }
        if (k.length >= 3) {
          this.setFormants(k[0], k[1], k[2]);
        }
        this.setNoiseMode(frame.unvoiced);
        this.setEnergy(frame.energy);
      },
      () => {
        this._romSequencer = null;
        this.triggerRelease();
      }
    );
    this._romSequencer.speak(speechFrames);
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
  // TMS5220-Specific Methods
  // ===========================================================================

  /** Set output volume (0-1) */
  setVolume(value: number): void {
    this.sendMessage('setVolume', value);
  }

  /** Set K1/K2/K3 formant filter indices.
   * k1: 0-31 (low=closed, high=open vowel)
   * k2: 0-31 (low=back, high=front vowel)
   * k3: 0-15 */
  setFormants(k1: number, k2: number, k3: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setFormants', k1, k2, k3 });
  }

  /** Set noise mode (true=unvoiced fricative, false=voiced) */
  setNoiseMode(noise: boolean): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setNoiseMode', value: noise });
  }

  /** Set chirp ROM type (0=original Speak & Spell, 1=later TMS5220) */
  setChirpType(type: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type: 'setChirpType', value: type });
  }

  /** Set energy level index (0-15, controls excitation amplitude) */
  setEnergy(index: number): void {
    this.setParameterById(TMS5220Param.ENERGY_INDEX, index);
  }

  /** Set brightness (0-2, scales higher K coefficients) */
  setBrightness(value: number): void {
    this.setParameterById(TMS5220Param.BRIGHTNESS, value);
  }

  /** Load a phoneme preset (0-7). Use TMS5220Preset constants. */
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

  /** Speak English text using SAM's reciter and TMS5220 LPC mapping */
  speakText(text: string): void {
    this.stopSpeaking();

    const phonemeStr = textToPhonemes(text);
    if (!phonemeStr) return;

    const tokens = parsePhonemeString(phonemeStr);
    const frames = phonemesToTMS5220Frames(tokens);
    if (frames.length === 0) return;

    const speechFrames: SpeechFrame<TMS5220Frame>[] = frames.map(f => ({
      data: f,
      durationMs: f.durationMs,
    }));

    // Activate a voice via the full triggerAttack path (sets up macros, note state, etc.)
    this.triggerAttack(60, undefined, 0.8);

    this._speechSequencer = new SpeechSequencer<TMS5220Frame>(
      (frame) => {
        this.setFormants(frame.k[0], frame.k[1], frame.k[2]);
        this.setNoiseMode(frame.unvoiced);
        this.setEnergy(frame.energy);
      },
      () => {
        this._speechSequencer = null;
        this.triggerRelease();
      }
    );
    this._speechSequencer.speak(speechFrames);
  }

  /** Stop current text-to-speech or ROM playback */
  stopSpeaking(): void {
    const wasSpeaking = this._speechSequencer !== null || this._romSequencer !== null;
    if (this._speechSequencer) {
      this._speechSequencer.stop();
      this._speechSequencer = null;
    }
    if (this._romSequencer) {
      this._romSequencer.stop();
      this._romSequencer = null;
    }
    if (wasSpeaking) this.triggerRelease();
  }

  /** Whether text-to-speech or ROM playback is currently playing */
  get isSpeaking(): boolean {
    return (this._speechSequencer?.isSpeaking ?? false) || (this._romSequencer?.isSpeaking ?? false);
  }

  /** Play a single letter from the ROM (A-Z) */
  speakLetter(letter: string): void {
    const idx = this._romWords.findIndex(w => w.name === letter.toUpperCase());
    if (idx >= 0) this.speakWord(idx);
  }

  /** Spell out text letter-by-letter using authentic ROM alphabet recordings */
  spellText(text: string): void {
    this.stopSpeaking();
    const letters = text.toUpperCase().split('').filter(c => /[A-Z]/.test(c));
    if (letters.length === 0) return;

    // Build a chain of ROM word playbacks with ~300ms gaps between letters
    let idx = 0;
    const playNext = () => {
      if (idx >= letters.length) return;
      const wordIdx = this._romWords.findIndex(w => w.name === letters[idx]);
      idx++;
      if (wordIdx >= 0) {
        // speakWord sets up the ROM sequencer with a done callback.
        // We override the done callback to chain the next letter.
        this._speakWordChained(wordIdx, () => {
          setTimeout(playNext, 300);
        });
      } else {
        // Letter not in ROM, skip with a pause
        setTimeout(playNext, 300);
      }
    };
    playNext();
  }

  /** Internal: play a ROM word with a custom done callback for chaining */
  private _speakWordChained(index: number, onDone: () => void): void {
    if (!this._romLoaded || index < 0 || index >= this._romWords.length) {
      onDone();
      return;
    }

    // Stop any current playback but don't release the voice
    if (this._romSequencer) {
      this._romSequencer.stop();
      this._romSequencer = null;
    }

    const word = this._romWords[index];
    const lastK = [8, 8, 8, 8, 8, 8, 8, 4, 4, 4];

    const speechFrames: SpeechFrame<LPCFrame>[] = word.frames.map(f => ({
      data: f,
      durationMs: 25,
    }));

    // Activate a voice via the full triggerAttack path
    this.triggerAttack(60, undefined, 0.8);

    this._romSequencer = new SpeechSequencer<LPCFrame>(
      (frame) => {
        if (frame.energy === 0) return;
        const k = frame.repeat ? lastK : frame.k;
        if (!frame.repeat && frame.k.length >= 3) {
          for (let i = 0; i < frame.k.length; i++) lastK[i] = frame.k[i];
        }
        if (k.length >= 3) {
          this.setFormants(k[0], k[1], k[2]);
        }
        this.setNoiseMode(frame.unvoiced);
        this.setEnergy(frame.energy);
      },
      () => {
        this._romSequencer = null;
        onDone();
      }
    );
    this._romSequencer.speak(speechFrames);
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
  }

  private sendMessage(type: string, value: number): void {
    if (!this.workletNode || this._disposed) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

export default TMS5220Synth;
