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
 *  - Beat quantization is available but disabled (quantize: false) for all
 *    patterns to ensure zero-latency response when scratch buttons are pressed.
 */

import * as Tone from 'tone';
import type { DeckEngine } from './DeckEngine';

// ============================================================================
// TYPES
// ============================================================================

export interface ScratchFrame {
  /** Absolute time within the cycle (ms). Use for fixed-duration patterns. */
  timeMs?: number;
  /** Fractional position in cycle (0–1). Used for BPM-synced patterns. Takes precedence over timeMs. */
  timeFraction?: number;
  velocity: number;   // playback rate multiplier: positive = forward, negative = backward
  faderGain: number;  // 0–1 channel gain
}

export interface ScratchPattern {
  name: string;
  shortName: string;
  durationBeats: number | null; // null = fixed ms, number = BPM-synced beat count
  durationMs: number | null;    // null = BPM-synced (use durationBeats)
  loop: boolean;
  quantize: '1/4' | '1/8' | false; // beat division to snap trigger to
  /** Linearly interpolate velocity between keyframes for smooth, human-feel curves. */
  interpolateVelocity?: boolean;
  /** When false, negative velocity = slow forward (no ring-buffer reverse). Use for rapid-oscillation patterns. */
  trueReverse?: boolean;
  frames: ScratchFrame[];
}

// ============================================================================
// BUILT-IN PATTERNS
// ============================================================================

/**
 * Baby Scratch — BPM-synced, smooth velocity curves for human feel.
 *
 * Velocity interpolation creates a sine-like curve: accelerate → peak → decelerate
 * through the zero-crossing, then reverse. This naturally solves three problems:
 * 1. Smooth zero-crossings eliminate scraping artifacts at direction changes
 * 2. The accelerate/decelerate curve feels like a real hand on vinyl
 * 3. BPM-synced duration locks the scratch rhythm to the track
 *
 * One beat per cycle: at 125 BPM → 480ms, at 170 BPM → 353ms.
 */
const BABY_SCRATCH: ScratchPattern = {
  name: 'Baby Scratch',
  shortName: 'Baby',
  durationBeats: 1,           // one beat per cycle — locks to track rhythm
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    { timeFraction: 0,    velocity: 0,    faderGain: 1 },  // zero crossing (loop seam)
    { timeFraction: 0.25, velocity: 2.4,  faderGain: 1 },  // peak forward push
    { timeFraction: 0.5,  velocity: 0,    faderGain: 1 },  // zero crossing
    { timeFraction: 0.75, velocity: -1.2, faderGain: 1 },  // peak backward drag
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
  quantize: false,
  frames: [
    { timeMs: 0, velocity: 1.0, faderGain: 1 },
  ],
};

/**
 * Flare — 2-click flare (DJ Flare's signature technique).
 *
 * KEY: Direction changes occur on OPEN fader. Clicks (brief fader closes)
 * happen BETWEEN direction changes — the opposite of transformer.
 * This creates the distinctive rhythmic chop pattern.
 *
 * Forward: open → click 1 → open → click 2 → open → direction change (OPEN)
 * Backward: continuous open sweep → direction change (OPEN)
 *
 * The "phantom click" at direction changes adds subtle percussive articulation
 * from the natural velocity deceleration through zero.
 */
const FLARE: ScratchPattern = {
  name: 'Flare',
  shortName: 'Flare',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    // Forward stroke with 2 clicks
    { timeFraction: 0,    velocity: 0,    faderGain: 1 },  // direction change — OPEN (flare signature!)
    { timeFraction: 0.10, velocity: 2.2,  faderGain: 1 },  // forward acceleration, open
    { timeFraction: 0.15, velocity: 2.2,  faderGain: 0 },  // click 1 — close
    { timeFraction: 0.19, velocity: 2.2,  faderGain: 1 },  // click 1 — open
    { timeFraction: 0.33, velocity: 2.0,  faderGain: 0 },  // click 2 — close
    { timeFraction: 0.37, velocity: 1.5,  faderGain: 1 },  // click 2 — open, decelerating
    // Backward stroke — smooth return, no clicks, fader stays open
    { timeFraction: 0.50, velocity: 0,    faderGain: 1 },  // direction change — OPEN
    { timeFraction: 0.65, velocity: -1.0, faderGain: 1 },  // backward sweep, open
    { timeFraction: 0.90, velocity: -0.3, faderGain: 1 },  // decelerating return
  ],
};

/**
 * Hydroplane — faderless technique where the opposing hand applies force
 * AGAINST the direction of record movement, creating a stuttering/chopped
 * quality "like a hydroplane boat."
 *
 * Simulated as forward motion with rapid resistance-induced speed fluctuations.
 * Fader stays open (faderless technique). The chopping comes from the opposing
 * force alternately slowing and releasing the record.
 */
const HYDROPLANE: ScratchPattern = {
  name: 'Hydroplane',
  shortName: 'Hydro',
  durationBeats: null,
  durationMs: 500,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,  // forward-only — opposing force creates speed modulation
  frames: [
    { timeMs: 0,   velocity: 1.0,  faderGain: 1 },  // push forward (normal speed)
    { timeMs: 70,  velocity: 0.15, faderGain: 1 },  // resistance (opposing force)
    { timeMs: 130, velocity: 1.1,  faderGain: 1 },  // push through resistance
    { timeMs: 190, velocity: 0.15, faderGain: 1 },  // resistance
    { timeMs: 250, velocity: 1.0,  faderGain: 1 },  // push through
    { timeMs: 310, velocity: 0.2,  faderGain: 1 },  // resistance
    { timeMs: 370, velocity: 1.0,  faderGain: 1 },  // push through
    { timeMs: 430, velocity: 0.25, faderGain: 1 },  // trailing resistance
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
  quantize: false,
  frames: [
    { timeMs: 0, velocity: 1.0, faderGain: 1 },
  ],
};

/**
 * Orbit — 1-click orbit flare: identical click pattern on both forward
 * AND backward strokes. "Scratch repeated identically forward then backward"
 * creates a complete, symmetric sound.
 *
 * Forward: open → click → open → direction change (OPEN)
 * Backward: open → click → open → direction change (OPEN)
 *
 * Both directions are audible. Direction changes always on open fader.
 */
const ORBIT: ScratchPattern = {
  name: 'Orbit',
  shortName: 'Orbit',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    // Forward stroke with 1 click
    { timeFraction: 0,    velocity: 0,    faderGain: 1 },  // direction change — OPEN
    { timeFraction: 0.12, velocity: 2.2,  faderGain: 1 },  // forward, open
    { timeFraction: 0.20, velocity: 2.2,  faderGain: 0 },  // click — close
    { timeFraction: 0.24, velocity: 2.0,  faderGain: 1 },  // click — open
    { timeFraction: 0.42, velocity: 0.5,  faderGain: 1 },  // decelerating
    // Backward stroke with 1 click (symmetric)
    { timeFraction: 0.50, velocity: 0,    faderGain: 1 },  // direction change — OPEN
    { timeFraction: 0.62, velocity: -1.2, faderGain: 1 },  // backward, open
    { timeFraction: 0.70, velocity: -1.2, faderGain: 0 },  // click — close
    { timeFraction: 0.74, velocity: -1.0, faderGain: 1 },  // click — open
    { timeFraction: 0.92, velocity: -0.3, faderGain: 1 },  // decelerating
  ],
};

/**
 * Chirp — fast baby scratch with fader CLOSING at direction changes.
 * "Only opening the fader on the middle parts of the scratch, closing
 * the fader whilst it changes direction" — produces a bird-like chirp.
 *
 * The opposite of flare: fader is CLOSED at direction changes, OPEN
 * during the middle of each stroke. Both forward and backward are audible.
 *
 * The fader-closed zones conveniently mask the forward/backward audio
 * transition, eliminating any crossover artifacts.
 */
const CHIRP: ScratchPattern = {
  name: 'Chirp',
  shortName: 'Chirp',
  durationBeats: 0.5,         // fast baby scratch — half beat per cycle
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    // Direction change zone — fader CLOSED (chirp signature!)
    { timeFraction: 0,    velocity: 0,    faderGain: 0 },  // closed at direction change
    { timeFraction: 0.06, velocity: 0.5,  faderGain: 1 },  // fader opens, forward begins
    { timeFraction: 0.25, velocity: 2.0,  faderGain: 1 },  // peak forward, open
    { timeFraction: 0.44, velocity: 0.3,  faderGain: 0 },  // fader closes before turnaround
    // Direction change zone — fader CLOSED
    { timeFraction: 0.50, velocity: 0,    faderGain: 0 },  // closed at direction change
    { timeFraction: 0.56, velocity: -0.3, faderGain: 1 },  // fader opens, backward begins
    { timeFraction: 0.75, velocity: -1.2, faderGain: 1 },  // peak backward, open
    { timeFraction: 0.94, velocity: -0.3, faderGain: 0 },  // fader closes before turnaround
  ],
};

/**
 * Stab (Cut Scratch) — fader opens for a forward burst, then closes while
 * the record rewinds. "The fader is closed whilst the record is rewound
 * back to the start of the sample." Rhythmic punctuation for kick/snare placement.
 */
const STAB: ScratchPattern = {
  name: 'Stab',
  shortName: 'Stab',
  durationBeats: null,
  durationMs: 180,
  loop: true,
  quantize: false,
  frames: [
    { timeMs: 0,  velocity: 3.0,   faderGain: 1 },  // forward burst, fader open
    { timeMs: 70, velocity: -1.0,  faderGain: 0 },  // fader closed, rewind to start
  ],
};

/**
 * Scribble — "a very fast baby scratch" over minimal vinyl area.
 * Fader stays open throughout. Distinguished from baby scratch by
 * speed and reduced range of motion (lower peak velocities, higher frequency).
 * Creates a rapid machine-gun stuttering texture.
 */
const SCRIBBLE: ScratchPattern = {
  name: 'Scribble',
  shortName: 'Scrbl',
  durationBeats: null,
  durationMs: 160,           // faster cycle than baby scratch
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,  // too rapid for ring-buffer switching — speed modulation only
  frames: [
    { timeMs: 0,   velocity: 1.5,  faderGain: 1 },
    { timeMs: 20,  velocity: 0.3,  faderGain: 1 },
    { timeMs: 40,  velocity: 1.5,  faderGain: 1 },
    { timeMs: 60,  velocity: 0.3,  faderGain: 1 },
    { timeMs: 80,  velocity: 1.5,  faderGain: 1 },
    { timeMs: 100, velocity: 0.3,  faderGain: 1 },
    { timeMs: 120, velocity: 1.5,  faderGain: 1 },
    { timeMs: 140, velocity: 0.3,  faderGain: 1 },
  ],
};

/**
 * Tear — baby scratch with "a short stop where the record comes to rest
 * very briefly," creating THREE sounds from two strokes.
 *
 * Forward push → STOP (rest) → resume forward → backward pull
 * = sound 1 → silence → sound 2 → sound 3
 *
 * Fader stays open throughout (like baby scratch). The pause/stop divides
 * the forward stroke into two distinct pitch-rise sounds.
 */
const TEAR: ScratchPattern = {
  name: 'Tear',
  shortName: 'Tear',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    // Sound 1: forward push
    { timeFraction: 0,    velocity: 0,    faderGain: 1 },
    { timeFraction: 0.12, velocity: 2.0,  faderGain: 1 },  // forward push
    // TEAR: record comes to rest briefly
    { timeFraction: 0.25, velocity: 0,    faderGain: 1 },  // STOP — the tear!
    { timeFraction: 0.32, velocity: 0,    faderGain: 1 },  // hold the rest
    // Sound 2: resume forward
    { timeFraction: 0.45, velocity: 2.0,  faderGain: 1 },  // resume forward
    { timeFraction: 0.55, velocity: 0,    faderGain: 1 },  // decelerate to zero
    // Sound 3: backward pull
    { timeFraction: 0.70, velocity: -1.2, faderGain: 1 },  // backward drag
    { timeFraction: 0.90, velocity: 0,    faderGain: 1 },  // decelerate
  ],
};

/**
 * Debug Ping-Pong — slow, symmetrical forward/backward at 1× speed.
 * Long phases (500ms each) for clearly hearing buffer quality.
 * No fader cuts — everything is audible.
 */
const DEBUG_PINGPONG: ScratchPattern = {
  name: 'Debug PingPong',
  shortName: 'DBG',
  durationBeats: null,
  durationMs: 1000,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    { timeMs: 0,   velocity: 1.0,   faderGain: 1 },  // forward at normal speed
    { timeMs: 500, velocity: -1.0,  faderGain: 1 },  // backward at normal speed
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
  DEBUG_PINGPONG, // 10 — debug: slow ping-pong for buffer quality testing
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
  private pendingStop = false; // set by finishCurrentCycle() to stop after this cycle completes

  /** Current scratch velocity (updated every tick). UI reads this for turntable spin + pattern scroll. */
  currentVelocity = 0;
  /** Current fader gain (updated every tick). UI reads this for visual feedback. */
  currentFaderGain = 1;

  /** Callback fired when a pattern ends internally (cycle complete + pendingStop, or non-looping end).
   *  DeckEngine wires this to _decayToRest() so pitch/tempo gets restored. */
  onPatternEnd?: () => void;

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
    // At very low BPMs (< 30), skip quantization — delay would be absurdly long
    if (bpm < 30) return 0;
    const msPerBeat = 60000 / bpm;
    const msPer = quantize === '1/8' ? msPerBeat / 2 : msPerBeat;
    let elapsed = 0;
    try { elapsed = this.getDeck().replayer.getElapsedMs(); } catch { return 0; }
    const posInDiv = elapsed % msPer;
    const delay = posInDiv < 20 ? 0 : msPer - posInDiv;
    // Cap at 500ms — if BPM is weird, don't make the user wait forever
    return Math.min(delay, 500);
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

    if (this.patternElapsedMs >= this.patternDurationMs) {
      if (!pattern.loop || this.pendingStop) {
        this.stopPattern();
        // Notify DeckEngine to decay pitch/tempo back to rest (pitch slider value)
        this.onPatternEnd?.();
        return;
      }
      this.patternElapsedMs = this.patternElapsedMs % this.patternDurationMs;
    }

    const frames = pattern.frames;
    const dur = this.patternDurationMs;

    // Resolve a frame's time position within the cycle
    const frameTime = (f: ScratchFrame): number =>
      f.timeFraction !== undefined ? f.timeFraction * dur : (f.timeMs ?? 0);

    // Scan backward from end to find current frame
    let frameIdx = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (this.patternElapsedMs >= frameTime(frames[i]!)) { frameIdx = i; break; }
    }

    const frame = frames[frameIdx]!;
    let velocity: number;

    if (pattern.interpolateVelocity && frames.length > 1) {
      // Linear interpolation between current frame and next frame
      const nextIdx = (frameIdx + 1) % frames.length;
      const nextFrame = frames[nextIdx]!;
      const t0 = frameTime(frame);
      // Wrap: if next frame index wrapped around (loop), target the cycle boundary
      const t1 = nextIdx > frameIdx ? frameTime(nextFrame) : dur;
      const span = t1 - t0;
      const frac = span > 0
        ? Math.max(0, Math.min(1, (this.patternElapsedMs - t0) / span))
        : 0;
      velocity = frame.velocity + (nextFrame.velocity - frame.velocity) * frac;
    } else {
      velocity = frame.velocity;
    }

    // trueReverse=false: map negative velocity to slow forward (no ring-buffer switching)
    if (pattern.trueReverse === false) {
      velocity = Math.abs(velocity);
    }

    // Expose current state for UI (turntable spin, pattern display, fader indicators)
    this.currentVelocity = velocity;
    // For Transformer/Crab, estimate fader from chop timing (AudioParam-scheduled, not frame-driven)
    if (pattern === TRANSFORMER || pattern === CRAB) {
      const bpm = this.getEffectiveBPM();
      const chopPeriodMs = (60000 / bpm) / 4;
      const duty = pattern === TRANSFORMER ? 0.40 : 0.28;
      const posInChop = this.patternElapsedMs % chopPeriodMs;
      this.currentFaderGain = posInChop < chopPeriodMs * duty ? 1 : 0;
    } else if (!this.faderLFOActive) {
      this.currentFaderGain = frame.faderGain;
    } else {
      // Fader LFO active — estimate from LFO timing
      const bpm = this.getEffectiveBPM();
      const div = this.currentLFODivision;
      if (div) {
        const beats = LFO_DIVISION_BEATS[div];
        const periodMs = (60000 / bpm) * beats;
        const posInPeriod = this.patternElapsedMs % periodMs;
        this.currentFaderGain = posInPeriod < periodMs * 0.5 ? 1 : 0;
      }
    }

    try {
      const deck = this.getDeck();
      deck.setScratchVelocity(velocity);

      // Apply fader gain (step function — NOT interpolated, for sharp DJ cuts).
      // Skip for Transformer/Crab (AudioParam-scheduled) and when fader LFO is active.
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
    this.pendingStop = false;
    this.currentVelocity = 0;
    this.currentFaderGain = 1;

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

  /**
   * Let the current cycle complete then stop (tap/one-shot mode).
   * If the pattern is waiting for a quantize beat, cancel it immediately.
   */
  finishCurrentCycle(): void {
    // Set pendingStop so the pattern stops after the current (or first) cycle completes.
    // If the pattern is still in quantize-wait, let it start — it will play one cycle then stop.
    this.pendingStop = true;
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
