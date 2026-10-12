/**
 * Scratch DJ data model (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 10, 11, 20, 83, 84; ledger SCR-P1.1).
 *
 * Pure types. Every later scratch module (catalogue, fader model, styles,
 * placement, executor) consumes these; nothing here touches an engine.
 */

/** The 22 Up Rough gesture ids (section 9) + throws `drop`, `dropPhrase`
 *  (section 41) + the DEViLBOX extras uzi, eightFingerCrab, threeClickFlare = 27. */
export type ScratchGestureId =
  | 'baby' | 'babySlow'
  | 'forwardStab' | 'backwardStab'
  | 'chirp' | 'chirpDouble'
  | 'transformer4' | 'transformer8'
  | 'flare1' | 'flare2'
  | 'orbit'
  | 'crab' | 'scribble'
  | 'hydroplane'
  | 'tearForward' | 'tearReverse'
  | 'twiddle'
  | 'drag'
  | 'laser' | 'phaser'
  | 'tweak' | 'vibrato'
  | 'uzi' | 'eightFingerCrab' | 'threeClickFlare'
  | 'drop' | 'dropPhrase';

/** Musical role of a planned scratch event (section 83). */
export type ScratchRole =
  | 'INTRO' | 'THEME' | 'ANSWER' | 'ACCENT' | 'FILL' | 'FEATURE' | 'TRANSITION' | 'OUTRO';

export const SCRATCH_ROLES: readonly ScratchRole[] = [
  'INTRO', 'THEME', 'ANSWER', 'ACCENT', 'FILL', 'FEATURE', 'TRANSITION', 'OUTRO',
];

/** Style palettes (section 32). */
export type ScratchDJStyle = 'oldSchool' | 'boomBap' | 'electro' | 'battle' | 'loFi';

export const SCRATCH_DJ_STYLES: readonly ScratchDJStyle[] = [
  'oldSchool', 'boomBap', 'electro', 'battle', 'loFi',
];

/** Difficulty ladder (section 31): 1 foundation, 2 musical, 3 advanced, 4 battle. */
export type ScratchLevel = 1 | 2 | 3 | 4;

/**
 * One OPEN window of the fader inside a gesture cycle (section 19), as
 * fractions of the cycle. `curve` names the fader the window is performed on
 * (section 20): the deck's channel fader for articulation, the mixer
 * crossfader for deck trading and A/B cuts. Never substituted for one another.
 */
export interface ScratchFaderWindow {
  open: readonly [start: number, end: number];
  curve: 'deck' | 'crossfader';
}

/**
 * Hand path point (section 17; Up Rough `GESTURES[...].hand`): `t` fraction of
 * the cycle, `position` in stroke units (A = 1 stroke, 1500 samples at
 * 22,050 Hz in the reference), `grip` 0..1 how firmly the hand holds the record.
 */
export interface ScratchHandPathPoint {
  t: number;
  position: number;
  grip: number;
}

export type ScratchHandPath = readonly ScratchHandPathPoint[];

/** Velocity keyframe (section 10 `ScratchVelocityPoint`): `t` fraction of the
 *  cycle, `velocity` playback-rate multiplier (negative = backward). */
export interface ScratchVelocityPoint {
  t: number;
  velocity: number;
}

/** Section 10 gesture data model, extended with the execution fields the
 *  DEViLBOX pattern player needs (`cycleBeats`, `interpolateVelocity`). */
export interface ScratchGesture {
  id: ScratchGestureId;
  /** Full English UI label (CLAUDE.md: never an abbreviation). */
  name: string;
  /** The gesture's one length in 16th steps: placed by the planner, released on by the
   *  executor, run by the stroke (`cycleBeats` is derived from it). */
  durationSteps: number;
  /** Calm -> busy rank read from the definition: fader windows + hand reversals. */
  activity: number;
  difficulty: ScratchLevel;
  styles: readonly ScratchDJStyle[];
  roles: readonly ScratchRole[];
  handPath?: ScratchHandPath;
  velocityCurve: readonly ScratchVelocityPoint[];
  faderWindows: readonly ScratchFaderWindow[];
  /** Fader offset in ms; negative = the cut leads the hand (chirp/flare timing). */
  cutLeadMs?: number;
  /** true = backward phases really read the record backward (ring buffer);
   *  false = negative velocity is a slow forward (speed modulation only). */
  trueReverse: boolean;
  /** The gesture is a stroke from a musical home point the executor re-cues
   *  to (section 11/18); false for continuous-platter techniques and throws. */
  returnsToAnchor: boolean;
  recommendedBpm?: { min?: number; max?: number };
  /** 0..1 = activity normalised over the catalogue. */
  intensity: number;
  /** The hand path goes behind the anchor: the source needs a safe reverse range. */
  requiresReverse: boolean;
  /** May be performed on a scratch-crate record (section 38/39). */
  allowsSampleSource: boolean;
  /** Derived: durationSteps / 4 / strokes - one stroke cycle of the pattern player. */
  cycleBeats: number;
  /** Linear interpolation between velocity keyframes. */
  interpolateVelocity: boolean;
  /** One-shot (throws): the pattern does not loop. */
  loop: boolean;
}

/** Scratch anchor on a source (section 11): seconds into the record. */
export interface ScratchAnchor {
  /** Home point the gesture starts from (the vowel centre for a vocal). */
  position: number;
  /** Whole usable region [start, end] in seconds. */
  safe: readonly [number, number];
  safeForward: readonly [number, number];
  safeReverse: readonly [number, number];
}

/** Deck anchor (section 84): seconds into the deck's track. */
export interface DeckScratchAnchor {
  position: number;
  safe: readonly [number, number];
  /** Beat of the deck's grid the anchor sits on (P3.1). */
  beat?: number;
  kind?: DeckAnchorKind;
}

/** What the deck anchor marks (section 84; the extracted song material of section 87). */
export type DeckAnchorKind = 'downbeat' | 'snare' | 'vocalOnset' | 'hit' | 'kick' | 'stab' | 'fill' | 'phraseHit';

/** Section 84 source model. */
export type ScratchSource =
  | { type: 'CRATE'; recordId: string; anchor: ScratchAnchor }
  | { type: 'DECK'; deck: 'A' | 'B'; anchor: DeckScratchAnchor }
  | { type: 'TRACKER_CHANNEL'; deck: 'A' | 'B'; channelId: number; segmentId: string; anchor: number }
  | { type: 'TRACKER_SAMPLE'; deck: 'A' | 'B'; sampleId: string; anchor: number };

/** Section 83 planned event: the planner owns it, the executor turns it into audio. */
export interface ScratchEvent {
  executeAtBeat: number;
  durationBeats: number;
  role: ScratchRole;
  source: ScratchSource;
  anchor: ScratchAnchor | DeckScratchAnchor;
  gesture: ScratchGestureId;
  /** 0..1 stroke energy. */
  velocity: number;
  humanizeMs: number;
  intensity: number;
  deck?: 'A' | 'B';
  returnToAnchor: boolean;
}

/** The slice of a crate record the gesture compatibility rule needs
 *  (section 38/39); the full record type lands with the catalogue (P2.1). */
export interface ScratchRecordGestureHints {
  /** Up Rough `recommended_gestures` (snake_case reference ids). */
  recommendedGestures: readonly string[];
  /** `source_is_pre_scratched`: FX / accent / transition one-shots only. */
  preScratched: boolean;
}
