/**
 * VL1Synth.ts — Casio VL-Tone synthesizer engine for DEViLBOX
 *
 * Pure TypeScript AudioWorklet-based synth. The DSP runs entirely in the worklet
 * (VL1.worklet.js) — no WASM binary needed.
 *
 * Features:
 * - 10 sounds (Piano, Fantasy, Violin, Flute, Guitar1, Guitar2, English Horn, + 3 Electro)
 * - VL-1 authentic ADSR with discrete lookup tables
 * - Vibrato & Tremolo LFOs
 * - Analog envelope shaper (RC circuit simulation)
 * - 10 built-in rhythm patterns
 * - Bandpass output filter (800Hz LP - 65Hz LP)
 * - 16x internal oversampling
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

// ─── Param indices (must match VL1.worklet.js setParam) ──────────────────────

export const VL1Param = {
  SOUND: 0,
  ATTACK: 1,
  DECAY: 2,
  SUSTAIN_LEVEL: 3,
  SUSTAIN_TIME: 4,
  RELEASE: 5,
  VIBRATO: 6,
  TREMOLO: 7,
  OCTAVE: 8,
  TUNE: 9,
  VOLUME: 10,
  BALANCE: 11,
  TEMPO: 12,
  RHYTHM: 13,
  RHYTHM_ON: 14,
} as const;

export const VL1_PARAM_NAMES: Record<number, string> = {
  0: 'Sound', 1: 'Attack', 2: 'Decay', 3: 'Sustain Level', 4: 'Sustain Time',
  5: 'Release', 6: 'Vibrato', 7: 'Tremolo', 8: 'Octave', 9: 'Tune',
  10: 'Volume', 11: 'Balance', 12: 'Tempo', 13: 'Rhythm', 14: 'Rhythm On',
};

export const VL1_SOUND_NAMES = [
  'Piano', 'Fantasy', 'Violin', 'Flute', 'Guitar 1',
  'Guitar 2', 'English Horn', 'Electro 1', 'Electro 2', 'Electro 3',
];

export const VL1_RHYTHM_NAMES = [
  'March', 'Waltz', '4 Beat', 'Swing', 'Rock 1',
  'Rock 2', 'Bossanova', 'Samba', 'Rhumba', 'Beguine',
];

// ─── Config interface ────────────────────────────────────────────────────────

export interface VL1Config {
  sound?: number;         // 0-1 (maps to 10 sounds: 0=Piano..0.9=Electro3)
  attack?: number;        // 0-1 (maps to VL1 discrete 0-9)
  decay?: number;         // 0-1
  sustainLevel?: number;  // 0-1
  sustainTime?: number;   // 0-1
  release?: number;       // 0-1
  vibrato?: number;       // 0-1 (0=off, higher=slower LFO)
  tremolo?: number;       // 0-1 (0=off, higher=slower LFO)
  octave?: number;        // 0-1 (0=low, 0.5=mid, 1=high)
  tune?: number;          // 0-1 (0.5=center)
  volume?: number;        // 0-1
  balance?: number;       // 0-1 (synth vs rhythm)
  tempo?: number;         // 0-1 (0.5=default)
  rhythm?: number;        // 0-1 (maps to 10 rhythms)
  rhythmOn?: number;      // 0 or 1
}

export const DEFAULT_VL1: VL1Config = {
  sound: 0.0,         // Piano
  attack: 0.0,
  decay: 0.4,
  sustainLevel: 0.5,
  sustainTime: 0.3,
  release: 0.2,
  vibrato: 0.0,       // Off
  tremolo: 0.0,       // Off
  octave: 0.5,        // Middle
  tune: 1.0,          // Center (tune is a multiplier, 1.0 = no detune)
  volume: 0.7,
  balance: 0.5,       // Centered
  tempo: 0.5,         // Default tempo
  rhythm: 0.0,        // March
  rhythmOn: 0,        // Rhythm off
};

// ─── Presets (based on VL1 factory presets + custom) ──────────────────────────

export const VL1_PRESETS: Record<string, VL1Config> = {
  // ── Factory Sounds (from the original VL-1 hardware) ──
  'Piano': {
    ...DEFAULT_VL1,
    sound: 0.0, attack: 0.0, decay: 0.4, sustainLevel: 0.5,
    sustainTime: 0.3, release: 0.2, vibrato: 0.0, tremolo: 0.0,
  },
  'Fantasy': {
    ...DEFAULT_VL1,
    sound: 0.1, attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.6, vibrato: 0.3, tremolo: 0.0,
  },
  'Violin': {
    ...DEFAULT_VL1,
    sound: 0.2, attack: 0.3, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.1, vibrato: 0.3, tremolo: 0.0,
  },
  'Flute': {
    ...DEFAULT_VL1,
    sound: 0.3, attack: 0.3, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.1, vibrato: 0.3, tremolo: 0.0,
  },
  'Guitar': {
    ...DEFAULT_VL1,
    sound: 0.4, attack: 0.1, decay: 0.0, sustainLevel: 0.7,
    sustainTime: 0.1, release: 0.2, vibrato: 0.0, tremolo: 0.0,
  },
  // ── Alternate Guitars ──
  'Guitar 2': {
    ...DEFAULT_VL1,
    sound: 0.5, attack: 0.1, decay: 0.0, sustainLevel: 0.7,
    sustainTime: 0.1, release: 0.2, vibrato: 0.0, tremolo: 0.0,
  },
  'English Horn': {
    ...DEFAULT_VL1,
    sound: 0.6, attack: 0.2, decay: 0.1, sustainLevel: 0.8,
    sustainTime: 0.7, release: 0.2, vibrato: 0.2, tremolo: 0.0,
  },
  // ── Electro Variants (modulated waveforms) ──
  'Electro Piano': {
    ...DEFAULT_VL1,
    sound: 0.7, attack: 0.0, decay: 0.3, sustainLevel: 0.6,
    sustainTime: 0.4, release: 0.3, vibrato: 0.0, tremolo: 0.2,
  },
  'Electro Fantasy': {
    ...DEFAULT_VL1,
    sound: 0.8, attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.5, vibrato: 0.2, tremolo: 0.2,
  },
  'Electro Violin': {
    ...DEFAULT_VL1,
    sound: 0.9, attack: 0.2, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.2, vibrato: 0.3, tremolo: 0.1,
  },
  // ── Custom ADSR Sounds ──
  'Pluck': {
    ...DEFAULT_VL1,
    sound: 0.0, attack: 0.0, decay: 0.2, sustainLevel: 0.0,
    sustainTime: 0.0, release: 0.1, vibrato: 0.0, tremolo: 0.0,
  },
  'Pad': {
    ...DEFAULT_VL1,
    sound: 0.2, attack: 0.5, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.6, vibrato: 0.4, tremolo: 0.2,
  },
  'Bell': {
    ...DEFAULT_VL1,
    sound: 0.1, attack: 0.0, decay: 0.5, sustainLevel: 0.2,
    sustainTime: 0.5, release: 0.4, vibrato: 0.0, tremolo: 0.0,
  },
  'Staccato': {
    ...DEFAULT_VL1,
    sound: 0.0, attack: 0.0, decay: 0.1, sustainLevel: 0.0,
    sustainTime: 0.0, release: 0.0, vibrato: 0.0, tremolo: 0.0,
  },
  'Organ': {
    ...DEFAULT_VL1,
    sound: 0.3, attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.0, vibrato: 0.0, tremolo: 0.3,
  },
  'Wobble': {
    ...DEFAULT_VL1,
    sound: 0.7, attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.3, vibrato: 0.5, tremolo: 0.5,
  },
  // ── "Da Da Da" (Trio, 1982) — the VL-1's most famous sound ──
  'Da Da Da': {
    ...DEFAULT_VL1,
    sound: 0.1,         // Fantasy
    attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.6, vibrato: 0.3, tremolo: 0.0,
    rhythm: 4 / 9,      // Rock 1
    rhythmOn: 1,
    tempo: 0.5,
    octave: 0.5,
  },
  // ── Lo-Fi Keys ──
  'Lo-Fi Keys': {
    ...DEFAULT_VL1,
    sound: 0.0, attack: 0.0, decay: 0.3, sustainLevel: 0.4,
    sustainTime: 0.2, release: 0.3, vibrato: 0.1, tremolo: 0.0,
  },
  // ── Bossa Fantasy ──
  'Bossa Fantasy': {
    ...DEFAULT_VL1,
    sound: 0.1, attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.6, vibrato: 0.3, tremolo: 0.0,
    rhythm: 6 / 9,      // Bossanova
    rhythmOn: 1,
    tempo: 0.45,
  },
  // ── Samba Guitar ──
  'Samba Guitar': {
    ...DEFAULT_VL1,
    sound: 0.4, attack: 0.1, decay: 0.0, sustainLevel: 0.7,
    sustainTime: 0.1, release: 0.2, vibrato: 0.0, tremolo: 0.0,
    rhythm: 7 / 9,      // Samba
    rhythmOn: 1,
    tempo: 0.55,
  },
  // ── Bass Patches (Guitar waveforms run at 0.5x pitch = bass register) ──
  'Sub Bass': {
    ...DEFAULT_VL1,
    sound: 0.4,         // Guitar1 (0.5x pitch)
    octave: 0.0,        // Low
    attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.1, vibrato: 0.0, tremolo: 0.0,
  },
  'Pluck Bass': {
    ...DEFAULT_VL1,
    sound: 0.4,         // Guitar1 (0.5x pitch)
    octave: 0.0,        // Low
    attack: 0.0, decay: 0.3, sustainLevel: 0.3,
    sustainTime: 0.1, release: 0.1, vibrato: 0.0, tremolo: 0.0,
  },
  'Synth Bass': {
    ...DEFAULT_VL1,
    sound: 0.5,         // Guitar2 (0.5x pitch, different timbre)
    octave: 0.0,        // Low
    attack: 0.0, decay: 0.2, sustainLevel: 0.5,
    sustainTime: 0.5, release: 0.1, vibrato: 0.0, tremolo: 0.0,
  },
  'E-Horn Bass': {
    ...DEFAULT_VL1,
    sound: 0.6,         // English Horn (0.5x pitch, 1/7 duty cycle = nasal)
    octave: 0.0,        // Low
    attack: 0.0, decay: 0.1, sustainLevel: 0.7,
    sustainTime: 0.6, release: 0.2, vibrato: 0.0, tremolo: 0.0,
  },
  'Wobble Bass': {
    ...DEFAULT_VL1,
    sound: 0.5,         // Guitar2
    octave: 0.0,        // Low
    attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.2, vibrato: 0.0, tremolo: 0.6,
  },
  // ── Lead / Melody ──
  'Lead Line': {
    ...DEFAULT_VL1,
    sound: 0.2,         // Violin
    octave: 1.0,        // High
    attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.1, vibrato: 0.4, tremolo: 0.0,
  },
  'Chiptune': {
    ...DEFAULT_VL1,
    sound: 0.0,         // Piano (11/16 duty square)
    octave: 1.0,        // High
    attack: 0.0, decay: 0.0, sustainLevel: 0.9,
    sustainTime: 0.9, release: 0.0, vibrato: 0.0, tremolo: 0.0,
  },
  // ── Percussion / FX ──
  'Blip': {
    ...DEFAULT_VL1,
    sound: 0.0, attack: 0.0, decay: 0.0, sustainLevel: 0.0,
    sustainTime: 0.0, release: 0.0, vibrato: 0.0, tremolo: 0.0,
    octave: 1.0,
  },
  'Zap': {
    ...DEFAULT_VL1,
    sound: 0.1,         // Fantasy (2x pitch)
    octave: 1.0,        // High
    attack: 0.0, decay: 0.3, sustainLevel: 0.0,
    sustainTime: 0.0, release: 0.2, vibrato: 0.5, tremolo: 0.0,
  },
  // ── Ambient / Texture ──
  'Ghost Pad': {
    ...DEFAULT_VL1,
    sound: 0.8,         // Electro Fantasy
    attack: 0.7, decay: 0.0, sustainLevel: 0.6,
    sustainTime: 0.9, release: 0.8, vibrato: 0.3, tremolo: 0.3,
  },
  'Music Box': {
    ...DEFAULT_VL1,
    sound: 0.1,         // Fantasy (2x pitch = sparkly)
    octave: 1.0,        // High
    attack: 0.0, decay: 0.4, sustainLevel: 0.1,
    sustainTime: 0.3, release: 0.5, vibrato: 0.0, tremolo: 0.0,
  },
};

// ─── Param index mapping (config key → worklet param index) ──────────────────

const PARAM_INDEX: Record<string, number> = {
  sound: 0,
  attack: 1,
  decay: 2,
  sustainLevel: 3,
  sustainTime: 4,
  release: 5,
  vibrato: 6,
  tremolo: 7,
  octave: 8,
  tune: 9,
  volume: 10,
  balance: 11,
  tempo: 12,
  rhythm: 13,
  rhythmOn: 14,
};

// ─── Synth Engine ────────────────────────────────────────────────────────────

export class VL1SynthEngine implements DevilboxSynth {
  readonly name = 'VL1SynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: VL1Config;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<VL1Config> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_VL1, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!VL1SynthEngine.isWorkletLoaded) {
        if (!VL1SynthEngine.workletLoadPromise) {
          VL1SynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}vl1/VL1.worklet.js`
          );
        }
        await VL1SynthEngine.workletLoadPromise;
        VL1SynthEngine.isWorkletLoaded = true;
      }

      this._worklet = new AudioWorkletNode(rawContext, 'vl1-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
        processorOptions: { sampleRate: rawContext.sampleRate },
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          console.log('[VL1Synth] Worklet ready');
          this.isInitialized = true;
          this.applyConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('[VL1Synth] Worklet error:', event.data.error);
        }
      };

      this._worklet.connect(this.output);

      // Keepalive connection
      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize VL1Synth:', error);
      throw error;
    }
  }

  applyConfig(config: VL1Config): void {
    if (!this._worklet || !this.isInitialized) return;
    const prev = this.config as Record<string, number | undefined>;
    for (const [key, index] of Object.entries(PARAM_INDEX)) {
      const value = (config as Record<string, number | undefined>)[key];
      if (value !== undefined && value !== prev[key]) {
        (this.config as Record<string, number>)[key] = value;
        this._worklet.port.postMessage({ type: 'setParam', index, value });
      }
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string'
      ? noteToMidi(frequency)
      : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.round((velocity ?? 0.8) * 127);
    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }
    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) {
      // Clear pending notes to prevent stuck notes when noteOff arrives before init
      if (frequency !== undefined) {
        const note = typeof frequency === 'string'
          ? noteToMidi(frequency)
          : Math.round(12 * Math.log2(frequency / 440) + 69);
        this.pendingNotes = this.pendingNotes.filter(p => p.note !== note);
      } else {
        this.pendingNotes = [];
      }
      return this;
    }
    if (frequency !== undefined) {
      const note = typeof frequency === 'string'
        ? noteToMidi(frequency)
        : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', note });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const index = PARAM_INDEX[param];
    if (index !== undefined) {
      (this.config as Record<string, number>)[param] = value;
      if (this._worklet && this.isInitialized) {
        this._worklet.port.postMessage({ type: 'setParam', index, value });
      }
    }
  }

  get(param: string): number | undefined {
    return (this.config as Record<string, number | undefined>)[param];
  }

  setPreset(name: string): void {
    const preset = VL1_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.applyConfig(this.config);
    }
  }

  dispose(): void {
    if (this._worklet) {
      this._worklet.port.postMessage({ type: 'dispose' });
      this._worklet.disconnect();
      this._worklet = null;
    }
    this.isInitialized = false;
  }
}
