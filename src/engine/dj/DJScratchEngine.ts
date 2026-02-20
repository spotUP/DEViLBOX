/**
 * DJScratchEngine - Scratch pattern definitions and per-deck playback scheduling.
 *
 * Provides:
 *  - ScratchFrame / ScratchPattern types
 *  - 6 built-in scratch patterns (Baby, Transformer, Flare, Hydroplane, Crab, Orbit)
 *  - ScratchPlayback class: JS-timer-based pattern loop + AudioParam fader LFO
 *
 * Architecture:
 *  - Rate changes (pitchMultiplier / tempoMultiplier) are applied every ~10 ms via
 *    JS setInterval — sufficient for scratch feel without audio glitches.
 *  - Fader chops are scheduled via AudioParam.setValueAtTime() for sub-millisecond
 *    accuracy, completely independent of JS timer jitter.
 *  - Beat quantization snaps pattern triggers to the next beat/half-beat boundary
 *    using replayer.getElapsedMs() and the current effective BPM.
 */

import * as Tone from 'tone';
import type { DeckEngine } from './DeckEngine';

// ============================================================================
// TYPES
// ============================================================================

export interface ScratchFrame {
  timeMs: number;
  velocity: number;   // playback rate multiplier (≥ 0.02 in v1; 1.0 = normal speed)
  faderGain: number;  // 0–1 channel gain
}

export interface ScratchPattern {
  name: string;
  shortName: string;
  durationBeats: number | null; // null = fixed ms, number = BPM-synced beat count
  durationMs: number | null;    // null = BPM-synced (use durationBeats)
  loop: boolean;
  quantize: '1/4' | '1/8' | false; // beat division to snap trigger to
  frames: ScratchFrame[];
}

// ============================================================================
// BUILT-IN PATTERNS
// ============================================================================

/**
 * Baby Scratch — forward push then drag back with fader open throughout.
 * Classic beginner scratch: 2 strokes per cycle (400ms).
 */
const BABY_SCRATCH: ScratchPattern = {
  name: 'Baby Scratch',
  shortName: 'Baby',
  durationBeats: null,
  durationMs: 400,
  loop: true,
  quantize: '1/4',
  frames: [
    { timeMs: 0,   velocity: 1.5,  faderGain: 1 },  // forward push
    { timeMs: 200, velocity: 0.03, faderGain: 1 },  // drag back
  ],
};

/**
 * Transformer — constant rate, rapid fader open/close at 1/8 note intervals.
 * durationBeats = 1 beat, 4 chops per beat (BPM-synced).
 */
const TRANSFORMER: ScratchPattern = {
  name: 'Transformer',
  shortName: 'Trans',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0,    velocity: 1.0, faderGain: 1 },
    // fader timing computed dynamically in ScratchPlayback based on BPM
  ],
};

/**
 * Flare — forward stroke with 2 fader closes mid-stroke, then drag back.
 */
const FLARE: ScratchPattern = {
  name: 'Flare',
  shortName: 'Flare',
  durationBeats: null,
  durationMs: 600,
  loop: true,
  quantize: '1/4',
  frames: [
    { timeMs: 0,   velocity: 1.2,  faderGain: 1 },  // forward, fader open
    { timeMs: 100, velocity: 1.2,  faderGain: 0 },  // fader close #1
    { timeMs: 150, velocity: 1.2,  faderGain: 1 },  // fader open #1
    { timeMs: 250, velocity: 1.2,  faderGain: 0 },  // fader close #2
    { timeMs: 300, velocity: 1.2,  faderGain: 1 },  // fader open #2
    { timeMs: 350, velocity: 0.04, faderGain: 1 },  // drag back (fader open)
  ],
};

/**
 * Hydroplane — rapid velocity oscillation between fast and slow; fader open.
 */
const HYDROPLANE: ScratchPattern = {
  name: 'Hydroplane',
  shortName: 'Hydro',
  durationBeats: null,
  durationMs: 300,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0,   velocity: 2.0,  faderGain: 1 },
    { timeMs: 50,  velocity: 0.2,  faderGain: 1 },
    { timeMs: 100, velocity: 2.0,  faderGain: 1 },
    { timeMs: 150, velocity: 0.2,  faderGain: 1 },
    { timeMs: 200, velocity: 2.0,  faderGain: 1 },
    { timeMs: 250, velocity: 0.2,  faderGain: 1 },
  ],
};

/**
 * Crab — 4 rapid fader taps per beat at normal playback speed.
 * durationBeats = 1 beat (BPM-synced).
 */
const CRAB: ScratchPattern = {
  name: 'Crab',
  shortName: 'Crab',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0,   velocity: 1.0, faderGain: 1 },
    // fader timing computed dynamically in ScratchPlayback based on BPM
  ],
};

/**
 * Orbit — forward with fader open, then slow drag back with fader closed.
 */
const ORBIT: ScratchPattern = {
  name: 'Orbit',
  shortName: 'Orbit',
  durationBeats: null,
  durationMs: 500,
  loop: true,
  quantize: '1/4',
  frames: [
    { timeMs: 0,   velocity: 1.3,  faderGain: 1 },  // forward push, open
    { timeMs: 200, velocity: 0.04, faderGain: 0 },  // drag back, closed
    { timeMs: 450, velocity: 0.04, faderGain: 0 },  // hold back, closed
  ],
};

export const SCRATCH_PATTERNS: ScratchPattern[] = [
  BABY_SCRATCH,
  TRANSFORMER,
  FLARE,
  HYDROPLANE,
  CRAB,
  ORBIT,
];

export function getPatternByName(name: string): ScratchPattern | undefined {
  return SCRATCH_PATTERNS.find(p => p.name === name);
}

// ============================================================================
// SCRATCH PLAYBACK
// ============================================================================

type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

const LFO_DIVISION_BEATS: Record<FaderLFODivision, number> = {
  '1/4':  1,
  '1/8':  0.5,
  '1/16': 0.25,
  '1/32': 0.125,
};

/**
 * ScratchPlayback — one instance per deck, owned by DeckEngine.
 *
 * Manages:
 *  - Pattern playback loop (JS interval, 10ms tick, applies rate changes)
 *  - Fader LFO (AudioParam scheduling, rescheduled every 4 bars)
 *  - Beat quantization for pattern start
 */
export class ScratchPlayback {
  private patternIntervalId: ReturnType<typeof setInterval> | null = null;
  private patternTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly getDeck: () => DeckEngine;
  private readonly getEffectiveBPM: () => number;
  private faderLFOTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private faderLFOActive = false;
  private currentLFODivision: FaderLFODivision | null = null;
  private scheduledLFOBPM = 0;
  private activePattern: ScratchPattern | null = null;
  private patternElapsedMs = 0;
  private patternLastTick = 0;
  private patternDurationMs = 0; // resolved duration for current pattern invocation

  constructor(
    getDeck: () => DeckEngine,
    getEffectiveBPM: () => number,
  ) {
    this.getDeck = getDeck;
    this.getEffectiveBPM = getEffectiveBPM;
  }

  // --------------------------------------------------------------------------
  // BEAT QUANTIZATION
  // --------------------------------------------------------------------------

  /**
   * Returns ms until the next beat boundary (based on quantize division).
   * Uses the deck's elapsed time + effective BPM to find current position in bar.
   * Returns 0 if already within 20ms of a boundary.
   */
  msUntilNextBeat(quantize: '1/4' | '1/8'): number {
    const bpm = this.getEffectiveBPM();
    const msPerBeat = 60000 / bpm;
    const msPer = quantize === '1/8' ? msPerBeat / 2 : msPerBeat;
    let elapsed = 0;
    try {
      elapsed = this.getDeck().replayer.getElapsedMs();
    } catch {
      return 0;
    }
    const posInDiv = elapsed % msPer;
    return posInDiv < 20 ? 0 : msPer - posInDiv;
  }

  // --------------------------------------------------------------------------
  // PATTERN PLAYBACK
  // --------------------------------------------------------------------------

  /**
   * Start playing a scratch pattern (optionally with beat quantization).
   * If pattern.quantize is set, delays start to the next beat boundary.
   */
  play(pattern: ScratchPattern, onWaiting?: (ms: number) => void): void {
    this.stopPattern();

    const bpm = this.getEffectiveBPM();

    // Resolve duration
    if (pattern.durationBeats !== null) {
      this.patternDurationMs = (60000 / bpm) * pattern.durationBeats;
    } else {
      this.patternDurationMs = pattern.durationMs ?? 400;
    }

    const startLoop = () => {
      this.activePattern = pattern;
      this.patternElapsedMs = 0;
      this.patternLastTick = performance.now();
      this._startPatternInterval();
    };

    if (pattern.quantize) {
      const delay = this.msUntilNextBeat(pattern.quantize);
      if (delay > 20) {
        onWaiting?.(delay);
        this.patternTimeoutId = setTimeout(startLoop, delay);
        return;
      }
    }

    startLoop();
  }

  private _startPatternInterval(): void {
    if (this.patternIntervalId !== null) {
      clearInterval(this.patternIntervalId);
    }

    const TICK_MS = 10;
    this.patternIntervalId = setInterval(() => {
      this._tickPattern();
    }, TICK_MS);
  }

  private _tickPattern(): void {
    const pattern = this.activePattern;
    if (!pattern) return;

    const now = performance.now();
    const dt = now - this.patternLastTick;
    this.patternLastTick = now;
    this.patternElapsedMs += dt;

    // Wrap elapsed within pattern duration (loop)
    if (pattern.loop && this.patternElapsedMs >= this.patternDurationMs) {
      this.patternElapsedMs = this.patternElapsedMs % this.patternDurationMs;
    } else if (!pattern.loop && this.patternElapsedMs >= this.patternDurationMs) {
      this.stopPattern();
      return;
    }

    // Find current frame based on elapsed time
    const frames = pattern.frames;
    let frameIdx = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (this.patternElapsedMs >= frames[i].timeMs) {
        frameIdx = i;
        break;
      }
    }
    const frame = frames[frameIdx];

    // Apply velocity (pitch + tempo multiplier)
    try {
      const deck = this.getDeck();
      deck.setScratchVelocity(frame.velocity);

      // Apply fader gain via AudioParam for precise timing
      // (Only for fixed-fader patterns; Transformer/Crab use fader LFO scheduling)
      if (pattern !== TRANSFORMER && pattern !== CRAB) {
        const gain = deck.getChannelGainParam();
        const ctx = Tone.getContext().rawContext as AudioContext;
        gain.cancelScheduledValues(ctx.currentTime);
        gain.setValueAtTime(frame.faderGain, ctx.currentTime);
      }
    } catch {
      // Engine not ready
    }
  }

  stopPattern(): void {
    if (this.patternTimeoutId !== null) {
      clearTimeout(this.patternTimeoutId);
      this.patternTimeoutId = null;
    }
    if (this.patternIntervalId !== null) {
      clearInterval(this.patternIntervalId);
      this.patternIntervalId = null;
    }
    this.activePattern = null;
    this.patternElapsedMs = 0;

    // Restore fader to full if no LFO running
    if (!this.faderLFOActive) {
      try {
        const gain = this.getDeck().getChannelGainParam();
        const ctx = Tone.getContext().rawContext as AudioContext;
        gain.cancelScheduledValues(ctx.currentTime);
        gain.setValueAtTime(1, ctx.currentTime);
      } catch {
        // Engine not ready
      }
    }
  }

  /** Is a pattern currently queued or playing? */
  isPatternActive(): boolean {
    return this.activePattern !== null || this.patternTimeoutId !== null;
  }

  /** Is a pattern currently waiting for beat quantize? */
  isWaiting(): boolean {
    return this.patternTimeoutId !== null && this.activePattern === null;
  }

  // --------------------------------------------------------------------------
  // FADER LFO
  // --------------------------------------------------------------------------

  /**
   * Schedule a fader LFO (square wave) at the given beat division.
   * Uses AudioParam scheduling for sub-millisecond accuracy.
   * Automatically rescheduled every 4 bars (200ms before end).
   */
  startFaderLFO(bpm: number, division: FaderLFODivision): void {
    this.stopFaderLFO();
    this.faderLFOActive = true;
    this.currentLFODivision = division;
    this.scheduledLFOBPM = bpm;
    this._scheduleFaderLFO(bpm, division);
  }

  private _scheduleFaderLFO(bpm: number, division: FaderLFODivision): void {
    try {
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx = Tone.getContext().rawContext as AudioContext;

      const beatsPerDiv = LFO_DIVISION_BEATS[division];
      const periodSec = (60 / bpm) * beatsPerDiv;
      const now = ctx.currentTime;

      // Cancel any existing scheduled values
      gain.cancelScheduledValues(now);

      // Schedule 4 bars = 16 quarter notes
      const totalBeats = 16;
      const totalDivisions = Math.round(totalBeats / beatsPerDiv);
      for (let i = 0; i < totalDivisions; i++) {
        const t = now + i * periodSec;
        gain.setValueAtTime(1, t);
        gain.setValueAtTime(0, t + periodSec * 0.5);
      }

      // Reschedule 200ms before end
      const totalDurationMs = totalDivisions * periodSec * 1000;
      const rescheduleDelay = Math.max(50, totalDurationMs - 200);

      this.faderLFOTimeoutId = setTimeout(() => {
        if (this.faderLFOActive && this.currentLFODivision === division) {
          this._scheduleFaderLFO(bpm, division);
        }
      }, rescheduleDelay);
    } catch {
      // Engine not ready
    }
  }

  stopFaderLFO(): void {
    this.faderLFOActive = false;
    this.currentLFODivision = null;

    if (this.faderLFOTimeoutId !== null) {
      clearTimeout(this.faderLFOTimeoutId);
      this.faderLFOTimeoutId = null;
    }

    // Restore fader to full
    try {
      const gain = this.getDeck().getChannelGainParam();
      const ctx = Tone.getContext().rawContext as AudioContext;
      gain.cancelScheduledValues(ctx.currentTime);
      gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02);
    } catch {
      // Engine not ready
    }
  }

  /** Called by DJDeck RAF when effectiveBPM changes by > 2% */
  onBPMChange(newBPM: number): void {
    if (
      this.faderLFOActive &&
      this.currentLFODivision !== null &&
      Math.abs(newBPM - this.scheduledLFOBPM) / this.scheduledLFOBPM > 0.02
    ) {
      // Reschedule immediately at new BPM
      if (this.faderLFOTimeoutId !== null) {
        clearTimeout(this.faderLFOTimeoutId);
        this.faderLFOTimeoutId = null;
      }
      this._scheduleFaderLFO(newBPM, this.currentLFODivision);
      this.scheduledLFOBPM = newBPM;
    }
  }

  // --------------------------------------------------------------------------
  // SPECIAL PATTERN SCHEDULING (Transformer / Crab)
  // --------------------------------------------------------------------------

  /**
   * Schedule Transformer or Crab fader automation for one bar.
   * These patterns have BPM-synced fader chops that must be computed at trigger time.
   */
  scheduleTransformerFader(bpm: number): void {
    try {
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx = Tone.getContext().rawContext as AudioContext;
      const msPerBeat = 60000 / bpm;
      const chopPeriodSec = msPerBeat / 1000 / 4; // 4 chops per beat = 1/8 note width
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      // 4 beats, 4 chops each = 16 chops
      for (let i = 0; i < 16; i++) {
        const t = now + i * chopPeriodSec;
        gain.setValueAtTime(1, t);
        gain.setValueAtTime(0, t + chopPeriodSec * 0.5);
      }
    } catch {
      // Engine not ready
    }
  }

  scheduleCrabFader(bpm: number): void {
    try {
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx = Tone.getContext().rawContext as AudioContext;
      const msPerBeat = 60000 / bpm;
      // 4 rapid taps per beat
      const tapPeriodSec = msPerBeat / 1000 / 4;
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      for (let i = 0; i < 16; i++) {
        const t = now + i * tapPeriodSec;
        gain.setValueAtTime(1, t);
        gain.setValueAtTime(0, t + tapPeriodSec * 0.4); // slightly less than 50% duty cycle
      }
    } catch {
      // Engine not ready
    }
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------

  dispose(): void {
    this.stopPattern();
    this.stopFaderLFO();
  }
}
