import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { espeakTextToIPA, parseEspeakIPA } from '@/engine/speech/EspeakNG';
import { SpeechSequencer } from '@/engine/speech/SpeechSequencer';
import type { SpeechFrame } from '@/engine/speech/SpeechSequencer';
import { getTractShape, type TractShape } from './PhonemeMap';

export interface PinkTromboneConfig {
  tenseness: number;       // 0-1: breathy (0) → harsh (1)
  tongueIndex: number;     // 0-1 normalized → 12-40 actual (back → front)
  tongueDiameter: number;  // 0-1 normalized → 2.05-3.5 actual (open → closed)
  lipDiameter: number;     // 0-1 normalized → 0-1.5 actual (closed → open)
  velum: number;           // 0-1 normalized → 0.01-0.4 actual (closed → nasal)
  constrictionIndex: number; // 0-1 normalized → 1-43 actual (back → front)
  constrictionDiameter: number; // 0-1 normalized → 0-3 actual (tight → open)
  vibratoAmount: number;   // 0-1 normalized → 0-0.05 actual
  preset: string;          // current vowel preset name
  text: string;            // text for TTS mode
  speed: number;           // 0-1: speech speed (0=slow, 1=fast)
}

// Vowel presets: tongue/lip positions from phonetics
export const PINK_TROMBONE_PRESETS: Record<string, Partial<PinkTromboneConfig>> = {
  'Default': { tongueIndex: 0.15, tongueDiameter: 0.26, lipDiameter: 0.6, velum: 0, constrictionDiameter: 1, tenseness: 0.6 },
  'AH':      { tongueIndex: 0.21, tongueDiameter: 0.52, lipDiameter: 0.6, velum: 0, constrictionDiameter: 1, tenseness: 0.6 },
  'EE':      { tongueIndex: 0.71, tongueDiameter: 0.1,  lipDiameter: 0.47, velum: 0, constrictionDiameter: 1, tenseness: 0.7 },
  'OH':      { tongueIndex: 0.07, tongueDiameter: 0.66, lipDiameter: 0.33, velum: 0, constrictionDiameter: 1, tenseness: 0.6 },
  'OO':      { tongueIndex: 0.07, tongueDiameter: 0.1,  lipDiameter: 0.2, velum: 0, constrictionDiameter: 1, tenseness: 0.6 },
  'AE':      { tongueIndex: 0.36, tongueDiameter: 0.79, lipDiameter: 0.67, velum: 0, constrictionDiameter: 1, tenseness: 0.7 },
  'ER':      { tongueIndex: 0.29, tongueDiameter: 0.38, lipDiameter: 0.4, velum: 0, constrictionDiameter: 1, tenseness: 0.5 },
  'Robot':   { tongueIndex: 0.46, tongueDiameter: 0.31, lipDiameter: 0.27, velum: 0, constrictionDiameter: 1, tenseness: 0.9 },
  'Whisper': { tongueIndex: 0.29, tongueDiameter: 0.52, lipDiameter: 0.53, velum: 0, constrictionDiameter: 1, tenseness: 0.1 },
  'Nasal':   { tongueIndex: 0.29, tongueDiameter: 0.38, lipDiameter: 0.4, velum: 0.8, constrictionDiameter: 1, tenseness: 0.6 },
  'Choir':   { tongueIndex: 0.21, tongueDiameter: 0.45, lipDiameter: 0.5, velum: 0.15, constrictionDiameter: 1, tenseness: 0.55 },
  'Android': { tongueIndex: 0.46, tongueDiameter: 0.24, lipDiameter: 0.33, velum: 0, constrictionDiameter: 0.4, tenseness: 1.0 },
  'Cyborg':  { tongueIndex: 0.6, tongueDiameter: 0.15, lipDiameter: 0.2, velum: 0, constrictionDiameter: 0.2, tenseness: 0.95 },
  'Alien':   { tongueIndex: 0.9, tongueDiameter: 0.05, lipDiameter: 0.1, velum: 0.6, constrictionDiameter: 0.15, tenseness: 0.8 },
  'Darth':   { tongueIndex: 0.1, tongueDiameter: 0.7, lipDiameter: 0.25, velum: 0.3, constrictionDiameter: 0.8, tenseness: 0.15 },
  'Siren':   { tongueIndex: 0.5, tongueDiameter: 0.1, lipDiameter: 0.8, velum: 0, constrictionDiameter: 1, tenseness: 0.85, vibratoAmount: 0.8 },
  'Growl':   { tongueIndex: 0.14, tongueDiameter: 0.9, lipDiameter: 0.35, velum: 0.1, constrictionDiameter: 0.5, tenseness: 0.05 },
  'Throat':  { tongueIndex: 0.04, tongueDiameter: 0.55, lipDiameter: 0.15, velum: 0, constrictionDiameter: 0.3, tenseness: 0.4 },
};

export const DEFAULT_PINK_TROMBONE: PinkTromboneConfig = {
  tenseness: 0.6,
  tongueIndex: 0.15,
  tongueDiameter: 0.26,
  lipDiameter: 0.6,
  velum: 0,
  constrictionIndex: 0.57,
  constrictionDiameter: 1,
  vibratoAmount: 0.1,
  preset: 'Default',
  text: '',
  speed: 0.5,
};

// Convert 0-1 normalized values to actual parameter ranges
function denormalize(key: string, value: number): { key: string; value: number } {
  switch (key) {
    case 'tongueIndex':         return { key: 'tongueIndex', value: 12 + value * 28 };        // 12-40
    case 'tongueDiameter':      return { key: 'tongueDiameter', value: 2.05 + value * 1.45 }; // 2.05-3.5
    case 'lipDiameter':         return { key: 'lipDiameter', value: value * 1.5 };             // 0-1.5
    case 'velum':               return { key: 'velumTarget', value: 0.01 + value * 0.39 };     // 0.01-0.4
    case 'constrictionIndex':   return { key: 'constrictionIndex', value: 1 + value * 42 };    // 1-43
    case 'constrictionDiameter': return { key: 'constrictionDiameter', value: value * 3 };     // 0-3
    case 'vibratoAmount':       return { key: 'vibratoAmount', value: value * 0.05 };          // 0-0.05
    case 'tenseness':           return { key, value };                                          // 0-1 (native)
    default:                    return { key, value };
  }
}

let workletRegistered = false;

export class PinkTromboneSynth implements DevilboxSynth {
  public readonly name: string = 'PinkTromboneSynth';
  public readonly output: GainNode;

  /** Last created instance — used by controls to trigger speech */
  private static _activeInstance: PinkTromboneSynth | null = null;
  public static getActiveInstance(): PinkTromboneSynth | null { return PinkTromboneSynth._activeInstance; }

  private audioContext: AudioContext;
  private _workletNode: AudioWorkletNode | null = null;
  private _config: PinkTromboneConfig;
  private _readyPromise: Promise<void>;
  private _readyResolve!: () => void;
  private _speechSequencer: SpeechSequencer<TractShape>;
  private _isSpeaking = false;

  constructor(config?: Partial<PinkTromboneConfig>) {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._config = { ...DEFAULT_PINK_TROMBONE, ...config };

    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    PinkTromboneSynth._activeInstance = this;

    // Speech sequencer: drives tract parameters from phoneme sequence
    this._speechSequencer = new SpeechSequencer<TractShape>(
      (shape) => this._applyTractShape(shape),
      () => {
        this._isSpeaking = false;
        // Release the note when speech ends
        if (this._workletNode) {
          this._workletNode.port.postMessage({ type: 'allNotesOff' });
        }
      },
    );

    this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      if (!workletRegistered) {
        await this.audioContext.audioWorklet.addModule('/pinktrombone/PinkTrombone.worklet.js');
        workletRegistered = true;
      }

      this._workletNode = new AudioWorkletNode(this.audioContext, 'pink-trombone-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      this._workletNode.port.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this._readyResolve();
          this._applyAllParams();
        }
      };

      this._workletNode.connect(this.output);
    } catch (err) {
      console.error('[PinkTrombone] Failed to init worklet:', err);
    }
  }

  public async ready(): Promise<void> {
    return this._readyPromise;
  }

  public async ensureInitialized(): Promise<void> {
    return this._readyPromise;
  }

  private _applyAllParams(): void {
    if (!this._workletNode) return;
    const params: Record<string, number> = {};
    for (const [key, value] of Object.entries(this._config)) {
      if (key === 'preset' || key === 'text' || key === 'speed' || typeof value !== 'number') continue;
      const d = denormalize(key, value);
      params[d.key] = d.value;
    }
    this._workletNode.port.postMessage({ type: 'params', params });
  }

  /** Apply a tract shape from the phoneme map directly to the worklet */
  private _applyTractShape(shape: TractShape): void {
    if (!this._workletNode) return;
    const params: Record<string, number> = {};
    // Convert normalized shape values to real worklet params
    for (const key of ['tongueIndex', 'tongueDiameter', 'lipDiameter', 'velum',
                        'constrictionIndex', 'constrictionDiameter', 'tenseness'] as const) {
      const d = denormalize(key, shape[key]);
      params[d.key] = d.value;
    }
    this._workletNode.port.postMessage({ type: 'params', params });
  }

  /** Convert text to phonemes and speak it through the vocal tract */
  public async speak(text: string): Promise<void> {
    if (!text.trim()) return;
    console.log('[PinkTrombone] speak() called with:', text);

    // Convert text → IPA → SAM codes → tract shapes
    let ipa: string | null = null;
    try {
      ipa = await espeakTextToIPA(text);
    } catch (e) {
      console.warn('[PinkTrombone] eSpeak failed:', e);
    }

    let frames: SpeechFrame<TractShape>[];

    if (ipa) {
      console.log('[PinkTrombone] IPA:', ipa);
      const tokens = parseEspeakIPA(ipa);
      console.log('[PinkTrombone] Tokens:', tokens.map(t => t.code).join(' '));

      const speedMult = 1.5 - this._config.speed;
      frames = tokens.map(token => ({
        data: getTractShape(token.code),
        durationMs: Math.round(getTractShape(token.code).durationMs * speedMult),
      }));
    } else {
      // Fallback: cycle through basic vowels for each character
      console.log('[PinkTrombone] eSpeak unavailable, using vowel fallback');
      const vowels = ['AH', 'EH', 'IY', 'AO', 'UX'];
      frames = text.split('').filter(c => c !== ' ').map((_, i) => ({
        data: getTractShape(vowels[i % vowels.length]),
        durationMs: 120,
      }));
    }

    if (frames.length === 0) return;

    // Add silence at end
    frames.push({ data: getTractShape(' '), durationMs: 100 });

    console.log('[PinkTrombone] Starting speech with', frames.length, 'frames');

    // Start a sustained note
    this._isSpeaking = true;
    if (this._workletNode) {
      this._workletNode.port.postMessage({ type: 'noteOn', note: 60, velocity: 0.8 });
    }

    // Sequence the tract shapes (fire and forget — sequencer handles timing)
    this._speechSequencer.speak(frames);
  }

  /** Stop speech playback */
  public stopSpeech(): void {
    this._speechSequencer.stop();
    this._isSpeaking = false;
    if (this._workletNode) {
      this._workletNode.port.postMessage({ type: 'allNotesOff' });
    }
  }

  /** Whether speech is currently playing */
  public get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  public applyConfig(config: Partial<PinkTromboneConfig>): void {
    // Apply preset values first if preset changed
    if (config.preset && config.preset !== this._config.preset) {
      const presetValues = PINK_TROMBONE_PRESETS[config.preset];
      if (presetValues) {
        this._config = { ...this._config, ...presetValues, preset: config.preset };
      }
    }

    // Apply individual overrides
    const { preset: _, ...numericConfig } = config;
    this._config = { ...this._config, ...numericConfig };
    if (config.preset) this._config.preset = config.preset;

    this._applyAllParams();
  }

  public set(param: string, value: number): void {
    if (param in this._config && param !== 'preset') {
      (this._config as unknown as Record<string, number | string>)[param] = value;
      if (this._workletNode) {
        const d = denormalize(param, value);
        this._workletNode.port.postMessage({ type: 'param', key: d.key, value: d.value });
      }
    }
  }

  public get(param: string): number | undefined {
    const val = (this._config as unknown as Record<string, number | string>)[param];
    return typeof val === 'number' ? val : undefined;
  }

  public triggerAttack(note: string | number, _time?: number, velocity: number = 1): void {
    if (!this._workletNode) return;
    const midi = typeof note === 'string' ? noteToMidi(note) : note;
    // Scale tenseness with velocity for expressive playing
    const tenseness = this._config.tenseness * (0.5 + 0.5 * velocity);
    this._workletNode.port.postMessage({
      type: 'noteOn',
      note: midi,
      velocity,
    });
    // Update tenseness based on velocity
    if (this._workletNode) {
      const d = denormalize('tenseness', tenseness);
      this._workletNode.port.postMessage({ type: 'param', key: d.key, value: d.value });
    }
  }

  public triggerRelease(note?: string | number, _time?: number): void {
    if (!this._workletNode) return;
    if (note !== undefined) {
      const midi = typeof note === 'string' ? noteToMidi(note) : note;
      this._workletNode.port.postMessage({ type: 'noteOff', note: midi });
    } else {
      this._workletNode.port.postMessage({ type: 'allNotesOff' });
    }
  }

  public triggerAttackRelease(note: string | number, _duration: number | string, _time?: number, velocity: number = 1): void {
    this.triggerAttack(note, _time, velocity);
    // Let note ring until explicit release
  }

  public releaseAll(): void {
    if (this._workletNode) {
      this._workletNode.port.postMessage({ type: 'allNotesOff' });
    }
  }

  public dispose(): void {
    if (PinkTromboneSynth._activeInstance === this) PinkTromboneSynth._activeInstance = null;
    this._speechSequencer.dispose();
    if (this._workletNode) {
      this._workletNode.port.postMessage({ type: 'allNotesOff' });
      this._workletNode.disconnect();
      this._workletNode = null;
    }
    this.output.disconnect();
  }
}
