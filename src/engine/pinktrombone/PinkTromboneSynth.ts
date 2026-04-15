import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SpeechSequencer } from '@/engine/speech/SpeechSequencer';
import type { SpeechFrame } from '@/engine/speech/SpeechSequencer';
import { getTractShape, type TractShape } from './PhonemeMap';
import { textToPhonemes as simpleTextToPhonemes } from './SimpleReciter';
import { espeakTextToIPA, parseEspeakIPA, isEspeakAvailable, preloadEspeak } from '@engine/speech/EspeakNG';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';

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
  speechPitch: number;     // 0-1: MIDI note for TTS (0=deep bass, 0.5=baritone, 1=soprano)
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
  'Whisper': { tongueIndex: 0.29, tongueDiameter: 0.52, lipDiameter: 0.53, velum: 0, constrictionDiameter: 1, tenseness: 0.1, speechPitch: 0.35 },
  'Nasal':   { tongueIndex: 0.29, tongueDiameter: 0.38, lipDiameter: 0.4, velum: 0.8, constrictionDiameter: 1, tenseness: 0.6, speechPitch: 0.35 },
  'Choir':   { tongueIndex: 0.21, tongueDiameter: 0.45, lipDiameter: 0.5, velum: 0.15, constrictionDiameter: 1, tenseness: 0.55, speechPitch: 0.5 },
  // ── Evil Robots ──
  'Terminator': { tongueIndex: 0.35, tongueDiameter: 0.20, lipDiameter: 0.15, velum: 0, constrictionIndex: 0.4, constrictionDiameter: 0.25, tenseness: 1.0, vibratoAmount: 0, speechPitch: 0.05 },
  'HAL 9000':   { tongueIndex: 0.30, tongueDiameter: 0.35, lipDiameter: 0.30, velum: 0.05, constrictionDiameter: 0.6, tenseness: 0.85, vibratoAmount: 0, speechPitch: 0.15, speed: 0.3 },
  'Dalek':      { tongueIndex: 0.50, tongueDiameter: 0.10, lipDiameter: 0.10, velum: 0, constrictionIndex: 0.6, constrictionDiameter: 0.1, tenseness: 1.0, vibratoAmount: 0.4, speechPitch: 0.2 },
  'GLaDOS':     { tongueIndex: 0.55, tongueDiameter: 0.18, lipDiameter: 0.25, velum: 0, constrictionDiameter: 0.35, tenseness: 0.92, vibratoAmount: 0.02, speechPitch: 0.55 },
  'Skynet':     { tongueIndex: 0.40, tongueDiameter: 0.12, lipDiameter: 0.12, velum: 0.1, constrictionIndex: 0.3, constrictionDiameter: 0.15, tenseness: 1.0, vibratoAmount: 0, speechPitch: 0.0 },
  'Cylon':      { tongueIndex: 0.45, tongueDiameter: 0.28, lipDiameter: 0.20, velum: 0.2, constrictionDiameter: 0.3, tenseness: 0.95, vibratoAmount: 0.15, speechPitch: 0.1 },
  'Replicant':  { tongueIndex: 0.25, tongueDiameter: 0.40, lipDiameter: 0.35, velum: 0, constrictionDiameter: 0.5, tenseness: 0.75, vibratoAmount: 0, speechPitch: 0.25 },
  // ── Monsters ──
  'Demon':      { tongueIndex: 0.10, tongueDiameter: 0.85, lipDiameter: 0.20, velum: 0.3, constrictionDiameter: 0.4, tenseness: 0.05, vibratoAmount: 0.3, speechPitch: 0.0 },
  'Growl':      { tongueIndex: 0.14, tongueDiameter: 0.9, lipDiameter: 0.35, velum: 0.1, constrictionDiameter: 0.5, tenseness: 0.05, speechPitch: 0.02 },
  'Darth':      { tongueIndex: 0.10, tongueDiameter: 0.7, lipDiameter: 0.25, velum: 0.3, constrictionDiameter: 0.8, tenseness: 0.15, speechPitch: 0.08 },
  'Alien':      { tongueIndex: 0.9, tongueDiameter: 0.05, lipDiameter: 0.1, velum: 0.6, constrictionDiameter: 0.15, tenseness: 0.8, speechPitch: 0.7 },
  'Siren':      { tongueIndex: 0.5, tongueDiameter: 0.1, lipDiameter: 0.8, velum: 0, constrictionDiameter: 1, tenseness: 0.85, vibratoAmount: 0.8, speechPitch: 0.6 },
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
  speechPitch: 0.3,  // baritone by default
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
  private _currentShape: TractShape | null = null;
  private _targetShape: TractShape | null = null;
  private _lerpStartTime = 0;
  private _lerpDurationMs = 20; // transition time between phonemes
  private _rafId: number | null = null;

  constructor(config?: Partial<PinkTromboneConfig>) {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._config = { ...DEFAULT_PINK_TROMBONE, ...config };

    this._readyPromise = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    PinkTromboneSynth._activeInstance = this;

    // Defer eSpeak-NG preload to avoid freezing UI on first note
    setTimeout(() => preloadEspeak(), 2000);

    // Speech sequencer: drives tract parameters from phoneme sequence
    this._speechSequencer = new SpeechSequencer<TractShape>(
      (shape) => this._applyTractShape(shape),
      () => {
        this._isSpeaking = false;
        useSpeechActivityStore.getState().speechStop();
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
      if (key === 'preset' || key === 'text' || key === 'speed' || key === 'speechPitch' || typeof value !== 'number') continue;
      const d = denormalize(key, value);
      params[d.key] = d.value;
    }
    this._workletNode.port.postMessage({ type: 'params', params });
  }

  private static readonly SHAPE_KEYS = [
    'tongueIndex', 'tongueDiameter', 'lipDiameter', 'velum',
    'constrictionIndex', 'constrictionDiameter', 'tenseness',
  ] as const;

  /** Send a tract shape to the worklet (denormalized) */
  private _sendShape(shape: TractShape): void {
    if (!this._workletNode) return;
    const params: Record<string, number> = {};
    for (const key of PinkTromboneSynth.SHAPE_KEYS) {
      const d = denormalize(key, shape[key]);
      params[d.key] = d.value;
    }
    this._workletNode.port.postMessage({ type: 'params', params });
  }

  /** Lerp between two shapes */
  private _lerpShape(a: TractShape, b: TractShape, t: number): TractShape {
    const clamped = Math.max(0, Math.min(1, t));
    const result = { ...a };
    for (const key of PinkTromboneSynth.SHAPE_KEYS) {
      result[key] = a[key] + (b[key] - a[key]) * clamped;
    }
    result.isVoiced = clamped < 0.5 ? a.isVoiced : b.isVoiced;
    return result;
  }

  /** Start smooth interpolation toward a target tract shape */
  private _applyTractShape(shape: TractShape): void {
    if (!this._workletNode) return;

    // First frame — snap immediately
    if (!this._currentShape) {
      this._currentShape = { ...shape };
      this._targetShape = shape;
      this._sendShape(shape);
      return;
    }

    // Start lerp from current position to new target
    this._targetShape = shape;
    this._lerpStartTime = performance.now();

    // Stops and affricates need faster transitions for the "burst" effect
    const isStop = shape.constrictionDiameter <= 0.05;
    this._lerpDurationMs = isStop ? 8 : 20;

    if (!this._rafId) {
      this._startLerpLoop();
    }
  }

  private _startLerpLoop(): void {
    const tick = () => {
      if (!this._targetShape || !this._currentShape || !this._isSpeaking) {
        this._rafId = null;
        return;
      }

      const elapsed = performance.now() - this._lerpStartTime;
      const t = Math.min(1, elapsed / this._lerpDurationMs);
      const interpolated = this._lerpShape(this._currentShape, this._targetShape, t);
      this._sendShape(interpolated);

      if (t >= 1) {
        // Transition complete — snap current to target
        this._currentShape = { ...this._targetShape };
        this._rafId = null;
        return;
      }

      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  /** Convert text to phonemes and speak it through the vocal tract */
  public async speak(text: string): Promise<void> {
    if (!text.trim()) return;
    console.log('[PinkTrombone] speak() called with:', text);

    // Try eSpeak-NG first (much better pronunciation), fall back to SimpleReciter
    let phonemes: string[];
    if (isEspeakAvailable()) {
      const ipa = await espeakTextToIPA(text);
      if (ipa) {
        const tokens = parseEspeakIPA(ipa);
        phonemes = tokens.map(t => t.code);
        console.log('[PinkTrombone] eSpeak phonemes:', phonemes.join(' '));
      } else {
        phonemes = simpleTextToPhonemes(text);
        console.log('[PinkTrombone] SimpleReciter phonemes:', phonemes.join(' '));
      }
    } else {
      phonemes = simpleTextToPhonemes(text);
      console.log('[PinkTrombone] SimpleReciter phonemes:', phonemes.join(' '));
    }

    if (phonemes.length === 0) return;

    // Speed multiplier: 0=2x duration (slow), 0.5=1x, 1=0.5x (fast)
    const speedMult = 1.5 - this._config.speed;

    const frames: SpeechFrame<TractShape>[] = phonemes.map(code => {
      const shape = getTractShape(code);
      return {
        data: shape,
        durationMs: Math.round(shape.durationMs * speedMult),
      };
    });

    // Add silence at end
    frames.push({ data: getTractShape(' '), durationMs: 100 });

    console.log('[PinkTrombone] Starting speech with', frames.length, 'frames');

    // Start a sustained note
    this._isSpeaking = true;
    useSpeechActivityStore.getState().speechStart();
    if (this._workletNode) {
      // Map speechPitch 0-1 to MIDI 30-72 (deep bass to soprano)
      const midiNote = Math.round(30 + this._config.speechPitch * 42);
      this._workletNode.port.postMessage({ type: 'noteOn', note: midiNote, velocity: 0.8 });
    }

    // Sequence the tract shapes (fire and forget — sequencer handles timing)
    this._speechSequencer.speak(frames);
  }

  /** Stop speech playback */
  public stopSpeech(): void {
    this._speechSequencer.stop();
    if (this._isSpeaking) {
      useSpeechActivityStore.getState().speechStop();
    }
    this._isSpeaking = false;
    this._currentShape = null;
    this._targetShape = null;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
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
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._isSpeaking) {
      useSpeechActivityStore.getState().speechStop();
      this._isSpeaking = false;
    }
    this._speechSequencer.dispose();
    if (this._workletNode) {
      this._workletNode.port.postMessage({ type: 'allNotesOff' });
      this._workletNode.disconnect();
      this._workletNode = null;
    }
    this.output.disconnect();
  }
}
