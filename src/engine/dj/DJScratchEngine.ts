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
 * Baby Scratch — BPM-synced speed modulation for fluid, continuous feel.
 *
 * Uses trueReverse: false — the record always moves forward but at varying
 * speed, creating the characteristic pitch rise/fall "wika wika" sound
 * without any direction-switching gaps. This matches how Hydroplane works
 * (which the user confirmed sounds great).
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
  trueReverse: false,         // speed modulation only — no direction switching pauses
  frames: [
    // Dip 1 → push 1: fader cut at dip creates sharp "wik" articulation
    { timeFraction: 0,    velocity: 0.2,  faderGain: 0 },  // dip — fader CLOSED (masks turnaround)
    { timeFraction: 0.04, velocity: 0.8,  faderGain: 1 },  // accelerating — fader OPENS (sharp cut-in)
    { timeFraction: 0.20, velocity: 2.4,  faderGain: 1 },  // peak forward push (high pitch)
    { timeFraction: 0.36, velocity: 0.8,  faderGain: 1 },  // decelerating
    // Dip 2 → push 2: same fader cut pattern
    { timeFraction: 0.40, velocity: 0.2,  faderGain: 0 },  // dip — fader CLOSED
    { timeFraction: 0.44, velocity: 0.8,  faderGain: 1 },  // accelerating — fader OPENS
    { timeFraction: 0.60, velocity: 1.8,  faderGain: 1 },  // second push (slightly lower peak)
    { timeFraction: 0.76, velocity: 0.8,  faderGain: 1 },  // decelerating
    // Dip 3: closed (wraps to dip 1 on loop)
    { timeFraction: 0.80, velocity: 0.2,  faderGain: 0 },  // dip — fader CLOSED
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
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,  // forward-only — opposing force creates speed modulation
  frames: [
    { timeFraction: 0,    velocity: 1.0,  faderGain: 1 },  // push forward (normal speed)
    { timeFraction: 0.14, velocity: 0.15, faderGain: 1 },  // resistance (opposing force)
    { timeFraction: 0.26, velocity: 1.1,  faderGain: 1 },  // push through resistance
    { timeFraction: 0.38, velocity: 0.15, faderGain: 1 },  // resistance
    { timeFraction: 0.50, velocity: 1.0,  faderGain: 1 },  // push through
    { timeFraction: 0.62, velocity: 0.2,  faderGain: 1 },  // resistance
    { timeFraction: 0.74, velocity: 1.0,  faderGain: 1 },  // push through
    { timeFraction: 0.86, velocity: 0.25, faderGain: 1 },  // trailing resistance
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
  durationBeats: 0.25,         // fast chirp — quarter beat per cycle
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
  durationBeats: 0.5,         // eighth note — enough time for audible burst + silent rewind
  durationMs: null,
  loop: true,
  quantize: false,
  frames: [
    { timeFraction: 0,    velocity: 2.5,   faderGain: 1 },  // forward burst, fader open
    { timeFraction: 0.50, velocity: -1.0,  faderGain: 0 },  // fader closed, rewind to start
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
  durationBeats: 0.25,       // 1/16th note — rapid machine-gun stutter per beat subdivision
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,  // too rapid for ring-buffer switching — speed modulation only
  frames: [
    { timeFraction: 0,    velocity: 1.5,  faderGain: 1 },
    { timeFraction: 0.125, velocity: 0.3,  faderGain: 1 },
    { timeFraction: 0.25, velocity: 1.5,  faderGain: 1 },
    { timeFraction: 0.375, velocity: 0.3,  faderGain: 1 },
    { timeFraction: 0.50, velocity: 1.5,  faderGain: 1 },
    { timeFraction: 0.625, velocity: 0.3,  faderGain: 1 },
    { timeFraction: 0.75, velocity: 1.5,  faderGain: 1 },
    { timeFraction: 0.875, velocity: 0.3,  faderGain: 1 },
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
    // Sound 1: forward push (fader cut at start masks loop seam)
    { timeFraction: 0,    velocity: 0,    faderGain: 0 },  // direction change — fader CLOSED
    { timeFraction: 0.03, velocity: 0.5,  faderGain: 1 },  // fader OPENS
    { timeFraction: 0.12, velocity: 2.0,  faderGain: 1 },  // forward push
    // TEAR: record comes to rest briefly (audible — fader stays open)
    { timeFraction: 0.25, velocity: 0,    faderGain: 1 },  // STOP — the tear!
    { timeFraction: 0.32, velocity: 0,    faderGain: 1 },  // hold the rest
    // Sound 2: resume forward
    { timeFraction: 0.45, velocity: 2.0,  faderGain: 1 },  // resume forward
    { timeFraction: 0.53, velocity: 0.3,  faderGain: 0 },  // fader CLOSES before direction change
    // Sound 3: backward pull
    { timeFraction: 0.58, velocity: -0.3, faderGain: 1 },  // fader OPENS, backward begins
    { timeFraction: 0.70, velocity: -1.2, faderGain: 1 },  // backward drag
    { timeFraction: 0.90, velocity: 0,    faderGain: 0 },  // fader CLOSES before loop restart
  ],
};

/**
 * Uzi — "a very, very fast scribble scratch over a very small amount of the
 * record; it requires muscle tension in the scratching hand."
 *
 * Wiki diagram: extremely dense, tiny-amplitude oscillation sitting on top of
 * a forward-moving record. Much faster and tighter than scribble — the waveform
 * appears as a thick buzz band with barely visible individual cycles.
 *
 * Fader stays open. trueReverse: false (forward-only speed modulation).
 * 60ms cycle (vs scribble's 160ms), tighter velocity range (1.4/0.6 vs 1.5/0.3).
 */
const UZI: ScratchPattern = {
  name: 'Uzi',
  shortName: 'Uzi',
  durationBeats: 0.125,      // 1/32nd note — extremely fast buzz per beat subdivision
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,
  frames: [
    { timeFraction: 0,     velocity: 1.4, faderGain: 1 },
    { timeFraction: 0.125, velocity: 0.6, faderGain: 1 },
    { timeFraction: 0.25,  velocity: 1.4, faderGain: 1 },
    { timeFraction: 0.375, velocity: 0.6, faderGain: 1 },
    { timeFraction: 0.50,  velocity: 1.4, faderGain: 1 },
    { timeFraction: 0.625, velocity: 0.6, faderGain: 1 },
    { timeFraction: 0.75,  velocity: 1.4, faderGain: 1 },
    { timeFraction: 0.875, velocity: 0.6, faderGain: 1 },
  ],
};

/**
 * Twiddle (Thumb-Twiddle) — "the index and middle finger on the fader hand
 * are used in conjunction with the thumb to create the cutoffs, or clicks."
 *
 * Wiki diagram: baby scratch sine wave underneath with a SQUARE WAVE fader
 * overlay. ~3 clicks per half-cycle (6 total per full cycle). The uneven
 * finger timing (thumb → index → middle) creates a syncopated stutter
 * distinct from the even chops of transformer.
 *
 * Record motion: interpolated baby scratch curve.
 * Fader: frame-driven step function with 3 clicks per stroke.
 */
const TWIDDLE: ScratchPattern = {
  name: 'Twiddle',
  shortName: 'Twdl',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    // Forward stroke with 3 twiddle clicks (thumb → index → middle)
    { timeFraction: 0,    velocity: 0,    faderGain: 1 },  // direction change
    { timeFraction: 0.05, velocity: 1.0,  faderGain: 1 },  // forward, open
    { timeFraction: 0.09, velocity: 1.5,  faderGain: 0 },  // click 1 (thumb)
    { timeFraction: 0.12, velocity: 1.8,  faderGain: 1 },  // open
    { timeFraction: 0.18, velocity: 2.2,  faderGain: 0 },  // click 2 (index)
    { timeFraction: 0.21, velocity: 2.2,  faderGain: 1 },  // open
    { timeFraction: 0.30, velocity: 1.8,  faderGain: 0 },  // click 3 (middle)
    { timeFraction: 0.33, velocity: 1.5,  faderGain: 1 },  // open
    { timeFraction: 0.45, velocity: 0.3,  faderGain: 1 },  // decelerating
    // Backward stroke with 3 twiddle clicks
    { timeFraction: 0.50, velocity: 0,    faderGain: 1 },  // direction change
    { timeFraction: 0.55, velocity: -0.5, faderGain: 1 },  // backward, open
    { timeFraction: 0.59, velocity: -0.8, faderGain: 0 },  // click 1 (thumb)
    { timeFraction: 0.62, velocity: -1.0, faderGain: 1 },  // open
    { timeFraction: 0.68, velocity: -1.2, faderGain: 0 },  // click 2 (index)
    { timeFraction: 0.71, velocity: -1.0, faderGain: 1 },  // open
    { timeFraction: 0.80, velocity: -0.6, faderGain: 0 },  // click 3 (middle)
    { timeFraction: 0.83, velocity: -0.4, faderGain: 1 },  // open
    { timeFraction: 0.95, velocity: -0.1, faderGain: 1 },  // decelerating
  ],
};

/**
 * 8-Finger Crab — "the record hand is taken off and used to manipulate the
 * fader as well as the fader hand, creating more clicks in one movement."
 *
 * Wiki diagram: dense vertical bars (fader open bursts) over slowly advancing
 * record. Both hands on fader = 8 fingers = 8 taps per beat (double regular
 * crab's 4). Very staccato 20% duty cycle.
 *
 * Fader scheduled via AudioParam (128-chop lookahead, auto-rescheduled).
 */
const EIGHT_FINGER_CRAB: ScratchPattern = {
  name: '8-Finger Crab',
  shortName: '8Crb',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: false,
  frames: [
    { timeMs: 0, velocity: 1.0, faderGain: 1 },
  ],
};

/**
 * 3-Click Flare — flare variant with 3 clicks on the forward stroke.
 *
 * Wiki diagram (progressive flare examples): the rightmost cycles show
 * denser click patterns. "Multiple clicks can occur... making it a 2-click,
 * 3-click flare, etc." Same principle: direction changes on OPEN fader,
 * clicks between direction changes.
 *
 * Forward: open → click 1 → open → click 2 → open → click 3 → open → direction change (OPEN)
 * Backward: continuous open sweep → direction change (OPEN)
 */
const FLARE_3CLICK: ScratchPattern = {
  name: '3-Click Flare',
  shortName: '3Flr',
  durationBeats: 1,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    // Forward stroke with 3 clicks
    { timeFraction: 0,    velocity: 0,    faderGain: 1 },  // direction change — OPEN
    { timeFraction: 0.06, velocity: 2.4,  faderGain: 1 },  // forward, open
    { timeFraction: 0.09, velocity: 2.4,  faderGain: 0 },  // click 1 — close
    { timeFraction: 0.12, velocity: 2.4,  faderGain: 1 },  // click 1 — open
    { timeFraction: 0.18, velocity: 2.2,  faderGain: 0 },  // click 2 — close
    { timeFraction: 0.21, velocity: 2.0,  faderGain: 1 },  // click 2 — open
    { timeFraction: 0.28, velocity: 1.8,  faderGain: 0 },  // click 3 — close
    { timeFraction: 0.31, velocity: 1.5,  faderGain: 1 },  // click 3 — open
    { timeFraction: 0.42, velocity: 0.5,  faderGain: 1 },  // decelerating
    // Backward stroke — smooth return, no clicks, fader stays open
    { timeFraction: 0.50, velocity: 0,    faderGain: 1 },  // direction change — OPEN
    { timeFraction: 0.65, velocity: -1.0, faderGain: 1 },  // backward sweep
    { timeFraction: 0.90, velocity: -0.3, faderGain: 1 },  // decelerating return
  ],
};

/**
 * Laser — "hitting the record, producing a characteristic sound effect not
 * unlike a laser in an old video game."
 *
 * A very fast forward strike that rapidly decelerates. The descending pitch
 * sweep from high speed → near-stop creates the classic "pew" laser sound.
 * Fader closes for silent rewind.
 */
const LASER: ScratchPattern = {
  name: 'Laser',
  shortName: 'Laser',
  durationBeats: 0.25,       // 1/16th note — rhythmic laser hits
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    { timeFraction: 0,    velocity: 5.0,  faderGain: 1 },  // sharp hit — very fast forward
    { timeFraction: 0.20, velocity: 2.5,  faderGain: 1 },  // rapid deceleration (descending pitch)
    { timeFraction: 0.40, velocity: 0.8,  faderGain: 1 },  // slowing further
    { timeFraction: 0.60, velocity: 0.2,  faderGain: 1 },  // nearly stopped
    { timeFraction: 0.73, velocity: -1.0, faderGain: 0 },  // fader cut, silent rewind
  ],
};

/**
 * Phaser — "an extension of the laser technique that makes it completely
 * faderless, whereby the record is held by a second hand whilst the first
 * hand performs the hits. Sound comes to a complete stop faster."
 *
 * Like laser but the opposing hand catches the record, creating a more
 * abrupt stop. The faster deceleration produces a shorter, sharper "zap."
 * Faderless (stays open) — the silence comes from the record actually stopping.
 */
const PHASER_SCRATCH: ScratchPattern = {
  name: 'Phaser',
  shortName: 'Phasr',
  durationBeats: 0.25,       // 1/16th note — tight rhythmic zap
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  frames: [
    { timeFraction: 0,    velocity: 5.0,  faderGain: 1 },  // sharp hit forward
    { timeFraction: 0.17, velocity: 2.0,  faderGain: 1 },  // rapid decel (opposing hand)
    { timeFraction: 0.29, velocity: 0,    faderGain: 1 },  // complete stop (caught by hand)
    { timeFraction: 0.46, velocity: 0,    faderGain: 1 },  // held at stop
    { timeFraction: 0.67, velocity: -0.8, faderGain: 0 },  // silent reset
  ],
};

/**
 * Tweak (Peaking Tweak) — "the record is set spinning with the motor off
 * and the fader open, and its speed is tweaked as it rotates. This allows
 * its pitch to be changed up and down, creating a sort of melody."
 *
 * Wiki diagram: gradually rising line (record spinning forward) with +/-
 * markers indicating periodic pitch tweaks. The DJ creates a melody-like
 * pitch contour by alternately pushing (speed up) and dragging (slow down).
 *
 * 2-beat cycle for the long, flowing feel. trueReverse: false.
 */
const TWEAK: ScratchPattern = {
  name: 'Tweak',
  shortName: 'Tweak',
  durationBeats: 2,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,
  frames: [
    { timeFraction: 0,    velocity: 1.0,  faderGain: 1 },  // normal speed
    { timeFraction: 0.12, velocity: 1.5,  faderGain: 1 },  // tweak up (+)
    { timeFraction: 0.25, velocity: 0.6,  faderGain: 1 },  // tweak down (-)
    { timeFraction: 0.37, velocity: 1.3,  faderGain: 1 },  // tweak up (+)
    { timeFraction: 0.50, velocity: 0.7,  faderGain: 1 },  // tweak down (-)
    { timeFraction: 0.62, velocity: 1.6,  faderGain: 1 },  // bigger tweak up (+)
    { timeFraction: 0.75, velocity: 0.5,  faderGain: 1 },  // tweak down (-)
    { timeFraction: 0.87, velocity: 1.4,  faderGain: 1 },  // tweak up (+)
  ],
};

/**
 * Drag — "moving the record slowly to reduce pitch."
 *
 * Sustained forward motion at gradually decreasing speed, creating a smooth
 * pitch drop. The record slows from normal speed to near-stop, then releases
 * back toward normal. Fader stays open. 2-beat cycle.
 */
const DRAG: ScratchPattern = {
  name: 'Drag',
  shortName: 'Drag',
  durationBeats: 2,
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,
  frames: [
    { timeFraction: 0,    velocity: 1.0,  faderGain: 1 },  // normal speed
    { timeFraction: 0.20, velocity: 0.7,  faderGain: 1 },  // slowing (pitch dropping)
    { timeFraction: 0.40, velocity: 0.4,  faderGain: 1 },  // slower
    { timeFraction: 0.60, velocity: 0.2,  faderGain: 1 },  // very slow (deep pitch drop)
    { timeFraction: 0.75, velocity: 0.15, faderGain: 1 },  // near-stop
    { timeFraction: 0.90, velocity: 0.8,  faderGain: 1 },  // release back toward normal
  ],
};

/**
 * Vibrato — "wobbling pitch around the main note through record or pitch
 * control manipulation."
 *
 * Small, rapid oscillations centered around normal playing speed (1.0).
 * Like a vocalist's vibrato: ±25% speed variation at ~10 Hz. Fader stays
 * open. trueReverse: false (forward-only modulation).
 */
const VIBRATO: ScratchPattern = {
  name: 'Vibrato',
  shortName: 'Vibr',
  durationBeats: 0.25,       // 1/16th note — vibrato oscillation synced to beat subdivisions
  durationMs: null,
  loop: true,
  quantize: false,
  interpolateVelocity: true,
  trueReverse: false,
  frames: [
    { timeFraction: 0,    velocity: 1.25, faderGain: 1 },
    { timeFraction: 0.25, velocity: 0.75, faderGain: 1 },
    { timeFraction: 0.50, velocity: 1.25, faderGain: 1 },
    { timeFraction: 0.75, velocity: 0.75, faderGain: 1 },
  ],
};

/** Original 6 at front (indices 0–5) for backward-compatible keyboard commands */
export const SCRATCH_PATTERNS: ScratchPattern[] = [
  BABY_SCRATCH,       // 0
  TRANSFORMER,        // 1
  FLARE,              // 2
  HYDROPLANE,         // 3
  CRAB,               // 4
  ORBIT,              // 5
  CHIRP,              // 6
  STAB,               // 7
  SCRIBBLE,           // 8
  TEAR,               // 9
  UZI,                // 10
  TWIDDLE,            // 11
  EIGHT_FINGER_CRAB,  // 12
  FLARE_3CLICK,       // 13
  LASER,              // 14
  PHASER_SCRATCH,     // 15
  TWEAK,              // 16
  DRAG,               // 17
  VIBRATO,            // 18
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
      this.patternLastTick = performance.now();

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
    // For Transformer/Crab/8-Finger Crab, estimate fader from chop timing (AudioParam-scheduled, not frame-driven)
    if (pattern === TRANSFORMER || pattern === CRAB || pattern === EIGHT_FINGER_CRAB) {
      const bpm = this.getEffectiveBPM();
      const chopsPerBeat = pattern === EIGHT_FINGER_CRAB ? 8 : 4;
      const chopPeriodMs = (60000 / bpm) / chopsPerBeat;
      const duty = pattern === TRANSFORMER ? 0.40 : pattern === CRAB ? 0.28 : 0.20;
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
      // Skip for Transformer/Crab/8-Finger Crab (AudioParam-scheduled) and when fader LFO is active.
      if (pattern !== TRANSFORMER && pattern !== CRAB && pattern !== EIGHT_FINGER_CRAB && !this.faderLFOActive) {
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
      this.faderLFOTimeoutId = setTimeout(() => {
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
      clearTimeout(this.faderLFOTimeoutId);
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
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      // 4 chops per beat, 40% open duty cycle (crisper than 50%)
      const chopPeriodSec = (60 / bpm) / 4;
      const now = ctx.currentTime;
      const ramp = 0.003;
      const offsetSec = this._getBeatOffsetSec(deck, chopPeriodSec);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(1, now);
      for (let i = 0; i < PATTERN_FADER_LOOKAHEAD; i++) {
        const t = now + offsetSec + i * chopPeriodSec;
        // Beat chop lands here — audio OPEN so beats punch through
        gain.setValueAtTime(1, t);
        // Close in the middle (off-beat)
        const mid = t + chopPeriodSec * 0.40;
        gain.setValueAtTime(1, mid - ramp);
        gain.linearRampToValueAtTime(0, mid);
        // Re-open before next chop
        const reopen = t + chopPeriodSec - ramp;
        gain.setValueAtTime(0, reopen);
        gain.linearRampToValueAtTime(1, reopen + ramp);
      }
      const totalMs = (offsetSec + PATTERN_FADER_LOOKAHEAD * chopPeriodSec) * 1000;
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
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      // 4 finger taps per beat, 28% open duty cycle (very staccato)
      const tapPeriodSec = (60 / bpm) / 4;
      const now = ctx.currentTime;
      const ramp = 0.003;
      const offsetSec = this._getBeatOffsetSec(deck, tapPeriodSec);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(1, now);
      for (let i = 0; i < PATTERN_FADER_LOOKAHEAD; i++) {
        const t = now + offsetSec + i * tapPeriodSec;
        // Tap lands here — audio OPEN
        gain.setValueAtTime(1, t);
        // Close between taps
        const mid = t + tapPeriodSec * 0.28;
        gain.setValueAtTime(1, mid - ramp);
        gain.linearRampToValueAtTime(0, mid);
        // Re-open before next tap
        const reopen = t + tapPeriodSec - ramp;
        gain.setValueAtTime(0, reopen);
        gain.linearRampToValueAtTime(1, reopen + ramp);
      }
      const totalMs = (offsetSec + PATTERN_FADER_LOOKAHEAD * tapPeriodSec) * 1000;
      this.patternFaderTimeoutId = setTimeout(() => {
        this.patternFaderTimeoutId = null;
        if (this.activePattern === CRAB) {
          this.scheduleCrabFader(this.getEffectiveBPM());
        }
      }, Math.max(50, totalMs - 300));
    } catch { /* engine not ready */ }
  }

  scheduleEightFingerCrabFader(bpm: number): void {
    if (this.patternFaderTimeoutId !== null) {
      clearTimeout(this.patternFaderTimeoutId);
      this.patternFaderTimeoutId = null;
    }
    try {
      const deck = this.getDeck();
      const gain = deck.getChannelGainParam();
      const ctx  = Tone.getContext().rawContext as AudioContext;
      // 8 taps per beat (both hands), 20% open duty cycle (very rapid staccato)
      const tapPeriodSec = (60 / bpm) / 8;
      const now = ctx.currentTime;
      const ramp = 0.003;
      const offsetSec = this._getBeatOffsetSec(deck, tapPeriodSec);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(1, now);
      for (let i = 0; i < PATTERN_FADER_LOOKAHEAD; i++) {
        const t = now + offsetSec + i * tapPeriodSec;
        // Tap lands here — audio OPEN
        gain.setValueAtTime(1, t);
        // Close between taps
        const mid = t + tapPeriodSec * 0.20;
        gain.setValueAtTime(1, mid - ramp);
        gain.linearRampToValueAtTime(0, mid);
        // Re-open before next tap
        const reopen = t + tapPeriodSec - ramp;
        gain.setValueAtTime(0, reopen);
        gain.linearRampToValueAtTime(1, reopen + ramp);
      }
      const totalMs = (offsetSec + PATTERN_FADER_LOOKAHEAD * tapPeriodSec) * 1000;
      this.patternFaderTimeoutId = setTimeout(() => {
        this.patternFaderTimeoutId = null;
        if (this.activePattern === EIGHT_FINGER_CRAB) {
          this.scheduleEightFingerCrabFader(this.getEffectiveBPM());
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
