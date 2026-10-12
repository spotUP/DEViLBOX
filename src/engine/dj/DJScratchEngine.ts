/**
 * DJScratchEngine - Scratch pattern definitions and per-deck playback scheduling.
 *
 * Provides:
 *  - ScratchFrame / ScratchPattern types
 *  - 19 built-in scratch patterns (sourced from dj.fandom.com/wiki/Scratching diagrams)
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
 *    Instead, patterns are phase-aligned to the current beat position at start
 *    time, giving instant response while staying locked to the beat grid.
 */

import * as Tone from 'tone';
import type { DeckEngine } from './DeckEngine';
import type { ScratchGesture, ScratchGestureId } from './scratch/scratchTypes';
import { getGesture } from './scratch/scratchGestureCatalog';
import { gestureMotion } from './scratch/scratchPhysics';
import { faderGainAt, faderRampSec, applyFaderGain } from './scratch/scratchFaderModel';
import { realTimers } from './autodj/executorTimers';

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

/**
 * A planned start (scratch audit SA-M2, SA-m5): the caller says where the stroke begins and how
 * long it plays. The Auto Scratch executor starts a deck gesture on its planned beat, so the
 * cycle begins at `phase` (0 = the start of the stroke) instead of the elapsed-time modulo that
 * phase-aligns a hand-pressed pattern, with no quantize wait; the pattern ends itself after
 * `cycles` whole cycles.
 */
export interface PatternStart {
  /** 0..1 position in the cycle the stroke starts at. */
  phase?: number;
  /** Whole cycles to play, then end (the gesture's one length). */
  cycles?: number;
  /** The plan velocity 0..1: the turntable model's stroke length (owner decision O2). */
  velocity?: number;
}

export interface ScratchPattern {
  name: string;
  shortName: string;
  /** The catalogue gesture this pattern executes (ledger SCR-P1.3, D3). */
  gestureId: ScratchGestureId;
  durationBeats: number | null; // null = fixed ms, number = BPM-synced beat count
  durationMs: number | null;    // null = BPM-synced (use durationBeats)
  loop: boolean;
  quantize: '1/4' | '1/8' | false; // beat division to snap trigger to
  /** When false, negative velocity = slow forward (no ring-buffer reverse). Use for rapid-oscillation patterns. */
  trueReverse?: boolean;
  frames: ScratchFrame[];
}

// ============================================================================
// BUILT-IN PATTERNS - derived from the gesture catalogue (one table, D3)
// ============================================================================

/**
 * The 19 pattern slots the keyboard commands, pads and `ScratchActionId`
 * index by position. `name` is the stable pattern key (keyboard, store,
 * `DeckEngine.playPattern`); the UI label is the gesture's full English
 * `name` (`getGesture(pattern.gestureId).name`).
 */
const PATTERN_SLOTS: ReadonlyArray<readonly [name: string, shortName: string, gestureId: ScratchGestureId]> = [
  ['Baby Scratch',  'Baby',  'baby'],            // 0
  ['Transformer',   'Trans', 'transformer4'],    // 1
  ['Flare',         'Flare', 'flare2'],          // 2
  ['Hydroplane',    'Hydro', 'hydroplane'],      // 3
  ['Crab',          'Crab',  'crab'],            // 4
  ['Orbit',         'Orbit', 'orbit'],           // 5
  ['Chirp',         'Chirp', 'chirp'],           // 6
  ['Stab',          'Stab',  'forwardStab'],     // 7
  ['Scribble',      'Scrbl', 'scribble'],        // 8
  ['Tear',          'Tear',  'tearForward'],     // 9
  ['Uzi',           'Uzi',   'uzi'],             // 10
  ['Twiddle',       'Twdl',  'twiddle'],         // 11
  ['8-Finger Crab', '8Crb',  'eightFingerCrab'], // 12
  ['3-Click Flare', '3Flr',  'threeClickFlare'], // 13
  ['Laser',         'Laser', 'laser'],           // 14
  ['Phaser',        'Phasr', 'phaser'],          // 15
  ['Tweak',         'Tweak', 'tweak'],           // 16
  ['Drag',          'Drag',  'drag'],            // 17
  ['Vibrato',       'Vibr',  'vibrato'],         // 18
];

/**
 * A pattern's frames are the gesture's motion through the turntable model (one motion path, owner
 * decision O1: `scratchPhysics.gestureMotion`) with the fader read from its windows (the fader
 * model is the one source for both). `bpm` and `velocity` set the stroke's real length and its
 * hand (O2); the player rebuilds the frames for the deck's tempo and the plan's velocity at start.
 */
export function motionFrames(gesture: ScratchGesture, bpm: number, velocity?: number, perform = false): ScratchFrame[] {
  const cycleSec = gesture.cycleBeats * 60 / Math.max(30, bpm);
  return gestureMotion(gesture, cycleSec, { velocity, perform }).map((p) => ({
    timeFraction: p.t,
    velocity: p.velocity,
    faderGain: faderGainAt(gesture, p.t, bpm),
  }));
}

export function patternFromGesture(gesture: ScratchGesture, name: string, shortName: string): ScratchPattern {
  return {
    name, shortName, gestureId: gesture.id,
    durationBeats: gesture.cycleBeats, durationMs: null,
    loop: gesture.loop, quantize: false,
    trueReverse: gesture.trueReverse,
    frames: motionFrames(gesture, PATTERN_FRAME_BPM),
  };
}

/** Tempo the static frame table (the registry's view of a pattern) is built at; a playing pattern
 *  rebuilds its frames at the deck's tempo. */
const PATTERN_FRAME_BPM = 120;

/** Original 6 at front (indices 0–5) for backward-compatible keyboard commands */
export const SCRATCH_PATTERNS: ScratchPattern[] = PATTERN_SLOTS.map(([name, shortName, gestureId]) =>
  patternFromGesture(getGesture(gestureId), name, shortName));

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

/** Cut-grid gestures (a glide under fader cuts) are scheduled on the
 *  AudioParam for sub-millisecond cuts; frame-driven gestures step in the tick. */
function isAudioParamScheduled(gesture: ScratchGesture): boolean {
  return !!gesture.glide && gesture.faderWindows.length > 1;
}

function gestureCurves(gesture: ScratchGesture): Array<'deck' | 'crossfader'> {
  const out: Array<'deck' | 'crossfader'> = [];
  for (const w of gesture.faderWindows) if (!out.includes(w.curve)) out.push(w.curve);
  return out;
}

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
  private patternIntervalId: unknown = null;
  private patternTimeoutId: unknown = null;
  private patternFaderTimeoutId: unknown = null;
  private readonly getDeck: () => DeckEngine;
  private readonly getEffectiveBPM: () => number;
  private faderLFOTimeoutId: unknown = null;
  private faderLFOActive = false;
  private currentLFODivision: FaderLFODivision | null = null;
  private scheduledLFOBPM = 0;
  private activePattern: ScratchPattern | null = null;
  private patternElapsedMs = 0;
  private patternLastTick = 0;
  private patternDurationMs = 0;
  private pendingStop = false; // set by finishCurrentCycle() to stop after this cycle completes
  /** Whole cycles left before a planned pattern ends itself (null = loop until stopped). */
  private cyclesLeft: number | null = null;
  /** The running pattern's motion at the deck's tempo and the plan's velocity (the turntable model). */
  private activeFrames: ScratchFrame[] = [];

  /** Current scratch velocity (updated every tick). UI reads this for turntable spin + pattern scroll. */
  currentVelocity = 0;
  /** Current fader gain (updated every tick). UI reads this for visual feedback. */
  currentFaderGain = 1;

  /** Where a `crossfader` fader window is performed (section 20); DJEngine wires the mixer. */
  private crossfaderSink: ((position: number) => void) | null = null;

  setCrossfaderSink(sink: ((position: number) => void) | null): void {
    this.crossfaderSink = sink;
  }

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

  play(pattern: ScratchPattern, onWaiting?: (ms: number) => void, start?: PatternStart): void {
    this.stopPattern();

    const bpm = this.getEffectiveBPM();
    this.patternDurationMs = pattern.durationBeats !== null
      ? (60000 / bpm) * pattern.durationBeats
      : (pattern.durationMs ?? 400);

    const startLoop = () => {
      this.activePattern = pattern;
      this.patternLastTick = performance.now();
      this.cyclesLeft = start?.cycles !== undefined ? Math.max(1, Math.round(start.cycles)) : null;
      this.activeFrames = motionFrames(getGesture(pattern.gestureId), bpm, start?.velocity, true);

      if (start) {
        // a planned stroke begins where the plan says, on the beat it was fired on
        this.patternElapsedMs = Math.max(0, Math.min(1, start.phase ?? 0)) * this.patternDurationMs;
        this._startPatternInterval();
        return;
      }

      // Phase-align: start the pattern at the correct phase within the current
      // beat so scratch cycles lock to beat boundaries. This gives instant
      // response (no quantize delay) while keeping the rhythm perfectly synced.
      if (bpm >= 30) {
        try {
          const elapsed = this.getDeck().replayer.getElapsedMs();
          const posInCycle = elapsed % this.patternDurationMs;
          this.patternElapsedMs = posInCycle;
        } catch {
          this.patternElapsedMs = 0;
        }
      } else {
        this.patternElapsedMs = 0;
      }

      this._startPatternInterval();
    };

    if (pattern.quantize && !start) {
      const delay = this.msUntilNextBeat(pattern.quantize);
      if (delay > 20) {
        onWaiting?.(delay);
        this.patternTimeoutId = realTimers.setTimeout(startLoop, delay);
        return;
      }
    }

    startLoop();
  }

  private _startPatternInterval(): void {
    if (this.patternIntervalId !== null) realTimers.clearInterval(this.patternIntervalId);
    this.patternIntervalId = realTimers.setInterval(() => this._tickPattern(), 10);
  }

  private _tickPattern(): void {
    const pattern = this.activePattern;
    if (!pattern) return;

    const now = performance.now();
    this.patternElapsedMs += now - this.patternLastTick;
    this.patternLastTick = now;

    if (this.patternElapsedMs >= this.patternDurationMs) {
      if (this.cyclesLeft !== null) this.cyclesLeft--;
      if (!pattern.loop || this.pendingStop || this.cyclesLeft === 0) {
        this.stopPattern();
        // Notify DeckEngine to decay pitch/tempo back to rest (pitch slider value)
        this.onPatternEnd?.();
        return;
      }
      this.patternElapsedMs = this.patternElapsedMs % this.patternDurationMs;
    }

    const frames = this.activeFrames.length ? this.activeFrames : pattern.frames;
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

    if (frames.length > 1) {
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
    const gesture = getGesture(pattern.gestureId);
    const bpm = this.getEffectiveBPM();
    const scheduled = isAudioParamScheduled(gesture);
    if (!this.faderLFOActive) {
      // One source for every pattern: the gesture's fader windows (section 19).
      this.currentFaderGain = faderGainAt(gesture, this.patternElapsedMs / dur, bpm, 'deck');
    } else {
      // Fader LFO active — estimate from LFO timing
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

      // Apply the fader gain (step function — NOT interpolated, for sharp DJ cuts)
      // to the fader each window names (section 20: deck fader vs crossfader,
      // never substituted). Skip the cut-grid gestures (AudioParam-scheduled
      // by schedulePatternFader) and when the fader LFO is active.
      if (!scheduled && !this.faderLFOActive) {
        const fraction = this.patternElapsedMs / dur;
        for (const curve of gestureCurves(gesture)) {
          const g = faderGainAt(gesture, fraction, bpm, curve);
          applyFaderGain({ curve }, g, deck.id === 'B' ? 'B' : 'A', {
            deck: (value) => {
              const gain = deck.getChannelGainParam();
              const ctx  = Tone.getContext().rawContext as AudioContext;
              gain.cancelScheduledValues(ctx.currentTime);
              gain.setValueAtTime(value, ctx.currentTime);
            },
            crossfader: (position) => { this.crossfaderSink?.(position); },
          });
        }
      }
    } catch { /* engine not ready */ }
  }

  stopPattern(): void {
    if (this.patternTimeoutId !== null) {
      realTimers.clearTimeout(this.patternTimeoutId);
      this.patternTimeoutId = null;
    }
    if (this.patternIntervalId !== null) {
      realTimers.clearInterval(this.patternIntervalId);
      this.patternIntervalId = null;
    }
    if (this.patternFaderTimeoutId !== null) {
      realTimers.clearTimeout(this.patternFaderTimeoutId);
      this.patternFaderTimeoutId = null;
    }
    this.activePattern = null;
    this.patternElapsedMs = 0;
    this.pendingStop = false;
    this.cyclesLeft = null;
    this.activeFrames = [];
    this.currentVelocity = 0;
    this.currentFaderGain = 1;

    if (!this.faderLFOActive) {
      try {
        const deck = this.getDeck();
        const gain = deck.getChannelGainParam();
        const ctx  = Tone.getContext().rawContext as AudioContext;
        gain.cancelScheduledValues(ctx.currentTime);
        gain.setValueAtTime(1, ctx.currentTime);
        deck.releaseChannelGainParam();
      } catch { /* engine not ready */ }
    }
  }

  isPatternActive(): boolean {
    return this.activePattern !== null || this.patternTimeoutId !== null;
  }

  isWaiting(): boolean {
    return this.patternTimeoutId !== null && this.activePattern === null;
  }

  /** Whether the fader LFO is currently active (for reverb send logic). */
  get isFaderLFOActive(): boolean {
    return this.faderLFOActive;
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

  /**
   * Calculate seconds until the next period boundary so scheduling
   * aligns to the beat grid rather than starting at wall-clock time.
   */
  private _getBeatOffsetSec(deck: DeckEngine, periodSec: number): number {
    let elapsedMs = 0;
    try {
      elapsedMs = deck.playbackMode === 'audio'
        ? deck.audioPlayer.getPosition() * 1000
        : deck.replayer.getElapsedMs();
    } catch { /* fallback to 0 */ }
    const periodMs = periodSec * 1000;
    const phaseMs = periodMs > 0 ? (elapsedMs % periodMs) : 0;
    return phaseMs > 0 ? (periodMs - phaseMs) / 1000 : 0;
  }

  private _scheduleFaderLFO(bpm: number, division: FaderLFODivision): void {
    try {
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      const periodSec = (60 / bpm) * LFO_DIVISION_BEATS[division];
      const now = ctx.currentTime;
      const ramp = 0.003; // 3ms anti-click ramp

      // Beat-phase alignment: calculate time until next division boundary
      // so the LFO snaps to the beat grid rather than starting at an arbitrary point.
      const offsetSec = this._getBeatOffsetSec(deck, periodSec);

      // 4 bars look-ahead
      const totalDivisions = Math.round(16 / LFO_DIVISION_BEATS[division]);
      gain.cancelScheduledValues(now);
      // Hold current value until first aligned beat
      gain.setValueAtTime(1, now);
      for (let i = 0; i < totalDivisions; i++) {
        const t = now + offsetSec + i * periodSec;
        // Beat lands here — keep audio OPEN (gain=1) so beats punch through.
        // Mute happens on the off-beat (between beats) to preserve the groove.
        gain.setValueAtTime(1, t);
        const mid = t + periodSec * 0.5;
        // Off-beat: close fader
        gain.setValueAtTime(1, mid - ramp);
        gain.linearRampToValueAtTime(0, mid);
        // Re-open before next beat
        const reopen = t + periodSec - ramp;
        gain.setValueAtTime(0, reopen);
        gain.linearRampToValueAtTime(1, reopen + ramp);
      }

      const totalMs = (offsetSec + totalDivisions * periodSec) * 1000;
      this.faderLFOTimeoutId = realTimers.setTimeout(() => {
        if (this.faderLFOActive && this.currentLFODivision === division) {
          // Always use fresh BPM on reschedule so LFO stays synced
          const freshBPM = this.getEffectiveBPM();
          this.scheduledLFOBPM = freshBPM;
          this._scheduleFaderLFO(freshBPM, division);
        }
      }, Math.max(50, totalMs - 200));
    } catch { /* engine not ready */ }
  }

  stopFaderLFO(): void {
    this.faderLFOActive = false;
    this.currentLFODivision = null;
    if (this.faderLFOTimeoutId !== null) {
      realTimers.clearTimeout(this.faderLFOTimeoutId);
      this.faderLFOTimeoutId = null;
    }
    try {
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      const now  = ctx.currentTime;
      // Cancel all scheduled values, snap gain to current value, then ramp to 1
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(1, now + 0.005);
      deck.releaseChannelGainParam();
    } catch { /* engine not ready */ }
  }

  onBPMChange(newBPM: number): void {
    if (
      this.faderLFOActive &&
      this.currentLFODivision !== null &&
      Math.abs(newBPM - this.scheduledLFOBPM) / this.scheduledLFOBPM > 0.02
    ) {
      if (this.faderLFOTimeoutId !== null) {
        realTimers.clearTimeout(this.faderLFOTimeoutId);
        this.faderLFOTimeoutId = null;
      }
      this._scheduleFaderLFO(newBPM, this.currentLFODivision);
      this.scheduledLFOBPM = newBPM;
    }
  }

  // --------------------------------------------------------------------------
  // CUT-GRID FADER SCHEDULING (Transformer / Crab / Eight-Finger Crab)
  //
  // The gesture's fader windows scheduled on the channel-gain AudioParam with
  // a 128-cycle lookahead + auto-reschedule so the pattern plays indefinitely.
  // Called by DeckEngine.playPattern() after play(). One source: the same
  // windows `faderGainAt` reads for the tick's UI estimate.
  // --------------------------------------------------------------------------

  schedulePatternFader(pattern: ScratchPattern, bpm: number, start?: PatternStart): void {
    if (this.patternFaderTimeoutId !== null) {
      realTimers.clearTimeout(this.patternFaderTimeoutId);
      this.patternFaderTimeoutId = null;
    }
    const gesture = getGesture(pattern.gestureId);
    if (!isAudioParamScheduled(gesture)) return;
    try {
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      const cycleSec = (60 / bpm) * gesture.cycleBeats;
      const now = ctx.currentTime;
      const ramp = faderRampSec(1);
      // a planned stroke's cut grid starts with its stroke, not on elapsed time
      const offsetSec = start ? 0 : this._getBeatOffsetSec(deck, cycleSec);
      const cycles = start?.cycles !== undefined ? Math.max(1, Math.round(start.cycles)) : PATTERN_FADER_LOOKAHEAD;
      const windows = gesture.faderWindows.filter((w) => w.curve === 'deck');
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(1, now);
      for (let i = 0; i < cycles; i++) {
        const cycleStart = now + offsetSec + i * cycleSec;
        for (const w of windows) {
          const open = cycleStart + w.open[0] * cycleSec;
          const close = cycleStart + w.open[1] * cycleSec;
          // Open ramps in just before the window, closes at its end.
          gain.setValueAtTime(0, Math.max(now, open - ramp));
          gain.linearRampToValueAtTime(1, open);
          gain.setValueAtTime(1, close - ramp);
          gain.linearRampToValueAtTime(0, close);
        }
      }
      if (start?.cycles !== undefined) return; // a planned stroke is scheduled whole: nothing to extend
      const totalMs = (offsetSec + PATTERN_FADER_LOOKAHEAD * cycleSec) * 1000;
      this.patternFaderTimeoutId = realTimers.setTimeout(() => {
        this.patternFaderTimeoutId = null;
        if (this.activePattern === pattern) {
          this.schedulePatternFader(pattern, this.getEffectiveBPM());
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
