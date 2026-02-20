/**
 * DJScratchEngine - Scratch pattern definitions and per-deck playback scheduling.
 *
 * Provides:
 *  - ScratchFrame / ScratchPattern types
 *  - 10 built-in scratch patterns
 *  - ScratchPlayback class: JS-timer-based pattern loop + AudioParam fader LFO
 *
 * Architecture:
 *  - Rate changes (pitchMultiplier / tempoMultiplier) are applied every ~10 ms via
 *    JS setInterval — sufficient for scratch feel without audio glitches.
 *  - Fader chops are scheduled via AudioParam.setValueAtTime() for sub-millisecond
 *    accuracy, completely independent of JS timer jitter.
 *  - Transformer/Crab use 128-chop lookahead + auto-reschedule so they play
 *    indefinitely without expiring.
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
  velocity: number;   // playback rate multiplier (positive for patterns; jog wheel supports negative for true reverse)
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
 * Baby Scratch — strong forward push, audible drag back. Both directions open.
 * The most fundamental scratch; doubled velocity for snap.
 */
const BABY_SCRATCH: ScratchPattern = {
  name: 'Baby Scratch',
  shortName: 'Baby',
  durationBeats: null,
  durationMs: 320,
  loop: true,
  quantize: '1/4',
  frames: [
    { timeMs: 0,   velocity: 2.8,  faderGain: 1 },  // strong forward push
    { timeMs: 210, velocity: 0.04, faderGain: 1 },  // drag back (audible)
  ],
};

/**
 * Transformer — fader rapid-fires 4× per beat at constant forward speed.
 * Fader scheduled via AudioParam (128-chop lookahead, auto-rescheduled).
 */
const TRANSFORMER: ScratchPattern = {
  name: 'Transformer',
  shortName: 'Trans',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0, velocity: 1.3, faderGain: 1 },
  ],
};

/**
 * Flare — 2-click flare: forward stroke with two tight fader closes, silent return.
 * The classic DJ battle technique for melodic phrases.
 */
const FLARE: ScratchPattern = {
  name: 'Flare',
  shortName: 'Flare',
  durationBeats: null,
  durationMs: 480,
  loop: true,
  quantize: '1/4',
  frames: [
    { timeMs: 0,   velocity: 2.2,  faderGain: 1 },  // forward, open
    { timeMs: 75,  velocity: 2.2,  faderGain: 0 },  // click 1 — close
    { timeMs: 105, velocity: 2.2,  faderGain: 1 },  // click 1 — open
    { timeMs: 215, velocity: 2.2,  faderGain: 0 },  // click 2 — close
    { timeMs: 245, velocity: 2.2,  faderGain: 1 },  // click 2 — open
    { timeMs: 310, velocity: 0.04, faderGain: 0 },  // return — silent
  ],
};

/**
 * Hydroplane — extreme velocity swings between 3.8× and 0.04×.
 * Very fast cycle creates an intense wah/pitch-surge effect.
 */
const HYDROPLANE: ScratchPattern = {
  name: 'Hydroplane',
  shortName: 'Hydro',
  durationBeats: null,
  durationMs: 200,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0,   velocity: 3.8,  faderGain: 1 },
    { timeMs: 40,  velocity: 0.04, faderGain: 1 },
    { timeMs: 80,  velocity: 3.8,  faderGain: 1 },
    { timeMs: 120, velocity: 0.04, faderGain: 1 },
    { timeMs: 160, velocity: 3.8,  faderGain: 1 },
  ],
};

/**
 * Crab — 4 rapid finger-tap fader hits per beat at constant speed.
 * Fader scheduled via AudioParam (128-chop lookahead, auto-rescheduled).
 */
const CRAB: ScratchPattern = {
  name: 'Crab',
  shortName: 'Crab',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0, velocity: 1.3, faderGain: 1 },
  ],
};

/**
 * Orbit — strong forward push open, then close fader and drag back silently.
 * Creates the classic "wop" sound — one hit per cycle.
 */
const ORBIT: ScratchPattern = {
  name: 'Orbit',
  shortName: 'Orbit',
  durationBeats: null,
  durationMs: 400,
  loop: true,
  quantize: '1/4',
  frames: [
    { timeMs: 0,   velocity: 2.4,  faderGain: 1 },  // forward push, open
    { timeMs: 200, velocity: 0.04, faderGain: 0 },  // drag back, silent
    { timeMs: 380, velocity: 0.04, faderGain: 0 },  // hold return
  ],
};

/**
 * Chirp — open fader at the top of the forward stroke, then snap closed
 * before the return. The signature 1990s hip-hop chirp.
 */
const CHIRP: ScratchPattern = {
  name: 'Chirp',
  shortName: 'Chirp',
  durationBeats: null,
  durationMs: 280,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0,   velocity: 2.0,  faderGain: 1 },  // forward, fader open
    { timeMs: 115, velocity: 2.0,  faderGain: 0 },  // snap closed mid-stroke
    { timeMs: 195, velocity: 0.04, faderGain: 0 },  // return — silent
  ],
};

/**
 * Stab — explosive short burst at 4× speed then instant cut.
 * Rhythmic punctuation; can be synced to kick/snare placement.
 */
const STAB: ScratchPattern = {
  name: 'Stab',
  shortName: 'Stab',
  durationBeats: null,
  durationMs: 180,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0,  velocity: 4.0,  faderGain: 1 },  // max-speed burst
    { timeMs: 60, velocity: 0.04, faderGain: 0 },  // instant cut + return
  ],
};

/**
 * Scribble — 8 rapid velocity oscillations between 3× and near-zero per cycle.
 * Fader stays open — the pitch surge/drop creates the signature scribble texture.
 * Quantizes to 1/8 so it locks to the bar.
 */
const SCRIBBLE: ScratchPattern = {
  name: 'Scribble',
  shortName: 'Scrbl',
  durationBeats: null,
  durationMs: 240,
  loop: true,
  quantize: '1/8',
  frames: [
    { timeMs: 0,   velocity: 3.2,  faderGain: 1 },
    { timeMs: 30,  velocity: 0.06, faderGain: 1 },
    { timeMs: 60,  velocity: 3.2,  faderGain: 1 },
    { timeMs: 90,  velocity: 0.06, faderGain: 1 },
    { timeMs: 120, velocity: 3.2,  faderGain: 1 },
    { timeMs: 150, velocity: 0.06, faderGain: 1 },
    { timeMs: 180, velocity: 3.2,  faderGain: 1 },
    { timeMs: 210, velocity: 0.06, faderGain: 1 },
  ],
};

/**
 * Tear — fast forward, brief stutter/catch, fast forward again, silent return.
 * The "tear" or "rip" — gives a hiccup mid-stroke that sounds like a snag on vinyl.
 */
const TEAR: ScratchPattern = {
  name: 'Tear',
  shortName: 'Tear',
  durationBeats: null,
  durationMs: 480,
  loop: true,
  quantize: '1/4',
  frames: [
    { timeMs: 0,   velocity: 2.8,  faderGain: 1 },  // fast forward
    { timeMs: 125, velocity: 0.05, faderGain: 1 },  // stutter — catch
    { timeMs: 175, velocity: 2.8,  faderGain: 1 },  // surge forward again
    { timeMs: 295, velocity: 0.04, faderGain: 0 },  // return — silent
  ],
};

/** Original 6 at front (indices 0–5) for backward-compatible keyboard commands */
export const SCRATCH_PATTERNS: ScratchPattern[] = [
  BABY_SCRATCH,  // 0
  TRANSFORMER,   // 1
  FLARE,         // 2
  HYDROPLANE,    // 3
  CRAB,          // 4
  ORBIT,         // 5
  CHIRP,         // 6
  STAB,          // 7
  SCRIBBLE,      // 8
  TEAR,          // 9
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
 * Number of AudioParam events to pre-schedule for Transformer/Crab.
 * At 120 BPM, 128 chops × 0.125 s/chop = 16 seconds of look-ahead.
 * Auto-reschedule fires 300ms before expiry so playback is seamless.
 */
const PATTERN_FADER_LOOKAHEAD = 128;

/**
 * ScratchPlayback — one instance per deck, owned by DeckEngine.
 *
 * Manages:
 *  - Pattern playback loop (JS interval, 10ms tick, applies rate changes)
 *  - Fader LFO (AudioParam scheduling, rescheduled every 4 bars)
 *  - Transformer/Crab special fader scheduling (128-chop lookahead, auto-reschedule)
 *  - Beat quantization for pattern start
 */
export class ScratchPlayback {
  private patternIntervalId: ReturnType<typeof setInterval> | null = null;
  private patternTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private patternFaderTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly getDeck: () => DeckEngine;
  private readonly getEffectiveBPM: () => number;
  private faderLFOTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private faderLFOActive = false;
  private currentLFODivision: FaderLFODivision | null = null;
  private scheduledLFOBPM = 0;
  private activePattern: ScratchPattern | null = null;
  private patternElapsedMs = 0;
  private patternLastTick = 0;
  private patternDurationMs = 0;

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

  msUntilNextBeat(quantize: '1/4' | '1/8'): number {
    const bpm = this.getEffectiveBPM();
    const msPerBeat = 60000 / bpm;
    const msPer = quantize === '1/8' ? msPerBeat / 2 : msPerBeat;
    let elapsed = 0;
    try { elapsed = this.getDeck().replayer.getElapsedMs(); } catch { return 0; }
    const posInDiv = elapsed % msPer;
    return posInDiv < 20 ? 0 : msPer - posInDiv;
  }

  // --------------------------------------------------------------------------
  // PATTERN PLAYBACK
  // --------------------------------------------------------------------------

  play(pattern: ScratchPattern, onWaiting?: (ms: number) => void): void {
    this.stopPattern();

    const bpm = this.getEffectiveBPM();
    this.patternDurationMs = pattern.durationBeats !== null
      ? (60000 / bpm) * pattern.durationBeats
      : (pattern.durationMs ?? 400);

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
    if (this.patternIntervalId !== null) clearInterval(this.patternIntervalId);
    this.patternIntervalId = setInterval(() => this._tickPattern(), 10);
  }

  private _tickPattern(): void {
    const pattern = this.activePattern;
    if (!pattern) return;

    const now = performance.now();
    this.patternElapsedMs += now - this.patternLastTick;
    this.patternLastTick = now;

    if (pattern.loop && this.patternElapsedMs >= this.patternDurationMs) {
      this.patternElapsedMs = this.patternElapsedMs % this.patternDurationMs;
    } else if (!pattern.loop && this.patternElapsedMs >= this.patternDurationMs) {
      this.stopPattern();
      return;
    }

    // Scan backward from end to find current frame
    const frames = pattern.frames;
    let frameIdx = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (this.patternElapsedMs >= frames[i]!.timeMs) { frameIdx = i; break; }
    }
    const frame = frames[frameIdx]!;

    try {
      const deck = this.getDeck();
      deck.setScratchVelocity(frame.velocity);

      // Apply fader — skip for Transformer/Crab (AudioParam-scheduled)
      // and skip when fader LFO is active to avoid clobbering its schedule.
      if (pattern !== TRANSFORMER && pattern !== CRAB && !this.faderLFOActive) {
        const gain = deck.getChannelGainParam();
        const ctx  = Tone.getContext().rawContext as AudioContext;
        gain.cancelScheduledValues(ctx.currentTime);
        gain.setValueAtTime(frame.faderGain, ctx.currentTime);
      }
    } catch { /* engine not ready */ }
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
    if (this.patternFaderTimeoutId !== null) {
      clearTimeout(this.patternFaderTimeoutId);
      this.patternFaderTimeoutId = null;
    }
    this.activePattern = null;
    this.patternElapsedMs = 0;

    if (!this.faderLFOActive) {
      try {
        const gain = this.getDeck().getChannelGainParam();
        const ctx  = Tone.getContext().rawContext as AudioContext;
        gain.cancelScheduledValues(ctx.currentTime);
        gain.setValueAtTime(1, ctx.currentTime);
      } catch { /* engine not ready */ }
    }
  }

  isPatternActive(): boolean {
    return this.activePattern !== null || this.patternTimeoutId !== null;
  }

  isWaiting(): boolean {
    return this.patternTimeoutId !== null && this.activePattern === null;
  }

  // --------------------------------------------------------------------------
  // FADER LFO
  // --------------------------------------------------------------------------

  startFaderLFO(bpm: number, division: FaderLFODivision): void {
    this.stopFaderLFO();
    this.faderLFOActive = true;
    this.currentLFODivision = division;
    this.scheduledLFOBPM = bpm;
    this._scheduleFaderLFO(bpm, division);
  }

  private _scheduleFaderLFO(bpm: number, division: FaderLFODivision): void {
    try {
      const gain = this.getDeck().getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      const periodSec = (60 / bpm) * LFO_DIVISION_BEATS[division];
      const now = ctx.currentTime;

      // 4 bars look-ahead
      const totalDivisions = Math.round(16 / LFO_DIVISION_BEATS[division]);
      gain.cancelScheduledValues(now);
      for (let i = 0; i < totalDivisions; i++) {
        const t = now + i * periodSec;
        gain.setValueAtTime(1, t);
        gain.setValueAtTime(0, t + periodSec * 0.5);
      }

      const totalMs = totalDivisions * periodSec * 1000;
      this.faderLFOTimeoutId = setTimeout(() => {
        if (this.faderLFOActive && this.currentLFODivision === division) {
          this._scheduleFaderLFO(bpm, division);
        }
      }, Math.max(50, totalMs - 200));
    } catch { /* engine not ready */ }
  }

  stopFaderLFO(): void {
    this.faderLFOActive = false;
    this.currentLFODivision = null;
    if (this.faderLFOTimeoutId !== null) {
      clearTimeout(this.faderLFOTimeoutId);
      this.faderLFOTimeoutId = null;
    }
    try {
      const gain = this.getDeck().getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      gain.cancelScheduledValues(ctx.currentTime);
      gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02);
    } catch { /* engine not ready */ }
  }

  onBPMChange(newBPM: number): void {
    if (
      this.faderLFOActive &&
      this.currentLFODivision !== null &&
      Math.abs(newBPM - this.scheduledLFOBPM) / this.scheduledLFOBPM > 0.02
    ) {
      if (this.faderLFOTimeoutId !== null) {
        clearTimeout(this.faderLFOTimeoutId);
        this.faderLFOTimeoutId = null;
      }
      this._scheduleFaderLFO(newBPM, this.currentLFODivision);
      this.scheduledLFOBPM = newBPM;
    }
  }

  // --------------------------------------------------------------------------
  // SPECIAL PATTERN FADER SCHEDULING (Transformer / Crab)
  //
  // 128-chop lookahead + auto-reschedule so the patterns play indefinitely.
  // Called by DeckEngine.playPattern() before handing off to play().
  // --------------------------------------------------------------------------

  scheduleTransformerFader(bpm: number): void {
    if (this.patternFaderTimeoutId !== null) {
      clearTimeout(this.patternFaderTimeoutId);
      this.patternFaderTimeoutId = null;
    }
    try {
      const gain = this.getDeck().getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      // 4 chops per beat, 40% open duty cycle (crisper than 50%)
      const chopPeriodSec = (60 / bpm) / 4;
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      for (let i = 0; i < PATTERN_FADER_LOOKAHEAD; i++) {
        const t = now + i * chopPeriodSec;
        gain.setValueAtTime(1, t);
        gain.setValueAtTime(0, t + chopPeriodSec * 0.40);
      }
      const totalMs = PATTERN_FADER_LOOKAHEAD * chopPeriodSec * 1000;
      this.patternFaderTimeoutId = setTimeout(() => {
        this.patternFaderTimeoutId = null;
        if (this.activePattern === TRANSFORMER) {
          this.scheduleTransformerFader(this.getEffectiveBPM());
        }
      }, Math.max(50, totalMs - 300));
    } catch { /* engine not ready */ }
  }

  scheduleCrabFader(bpm: number): void {
    if (this.patternFaderTimeoutId !== null) {
      clearTimeout(this.patternFaderTimeoutId);
      this.patternFaderTimeoutId = null;
    }
    try {
      const gain = this.getDeck().getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      // 4 finger taps per beat, 28% open duty cycle (very staccato)
      const tapPeriodSec = (60 / bpm) / 4;
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      for (let i = 0; i < PATTERN_FADER_LOOKAHEAD; i++) {
        const t = now + i * tapPeriodSec;
        gain.setValueAtTime(1, t);
        gain.setValueAtTime(0, t + tapPeriodSec * 0.28);
      }
      const totalMs = PATTERN_FADER_LOOKAHEAD * tapPeriodSec * 1000;
      this.patternFaderTimeoutId = setTimeout(() => {
        this.patternFaderTimeoutId = null;
        if (this.activePattern === CRAB) {
          this.scheduleCrabFader(this.getEffectiveBPM());
        }
      }, Math.max(50, totalMs - 300));
    } catch { /* engine not ready */ }
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------

  dispose(): void {
    this.stopPattern();
    this.stopFaderLFO();
  }
}
