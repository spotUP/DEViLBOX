/**
 * Gate K1 — personas as behavioural profiles.
 *
 * A persona used to be one number plus a table of per-move weights:
 * `intensityDefault`, and the weights. `intensity` was doing far too much at
 * once — it set how often anything fired, how many moves a bar could hold, and
 * indirectly how bold they were. Turning Perry up made him more frequent AND
 * more extreme AND less patient, none of which are the same knob, and the only
 * way to say "restless but gentle" was not to say it.
 *
 * These axes separate what the single scalar conflated. Each says one thing:
 *
 *  - `activity`    how often the performer does anything at all
 *  - `depth`       how far a gesture goes when it does happen
 *  - `risk`        willingness to do something that might not work
 *  - `restraint`   willingness to leave space — the opposite of activity only
 *                  in the sense that a restrained performer commits to silence
 *                  rather than merely firing less often
 *  - `anticipation` how far ahead it commits to a target
 *  - `patience`    how long it will hold a gesture before letting go
 *  - `timingVariance` how loose its placement is against the grid
 *  - `novelty`     preference for something new over repeating what worked
 *
 * Appetites are separate again, because "loves feedback" and "loves drops" are
 * not the same taste and a single boldness number cannot express both.
 *
 * Pure data and pure derivations: this file turns character into the numbers
 * the other gates already take (an intention policy, an energy budget), so the
 * personas remain one description rather than being re-stated per gate.
 */

import type { IntentionPolicy } from './intention';
import { DEFAULT_INTENTION_POLICY } from './intention';
import type { EnergyBudget } from './moveEnergy';
import { DEFAULT_ENERGY_BUDGET, scaleBudget } from './moveEnergy';
import type { Intention } from './performanceContext';

export interface PersonaBehaviour {
  /** 0..1 — how often it acts at all. */
  activity: number;
  /** 0..1 — how far a gesture goes: send amount, feedback, hold depth. */
  depth: number;
  /** 0..1 — willingness to try something that might not come off. */
  risk: number;
  /** 0..1 — willingness to commit to silence. */
  restraint: number;
  /** 0..1 — how far ahead it commits to a target. */
  anticipation: number;
  /** 0..1 — how long it holds before letting go. */
  patience: number;
  /** 0..1 — looseness against the grid. 0 is machine-tight. */
  timingVariance: number;
  /** 0..1 — new move over the one that just worked. */
  novelty: number;
  /** Intentions this persona reaches for first, most-preferred first. */
  intentionPreference: readonly Intention[];
  /** Appetites, 0..1 each. */
  appetite: {
    feedback: number;
    filter: number;
    drop: number;
  };
  /** How it lets go: on the grid, or when the gesture feels finished. */
  releaseStyle: 'quantized' | 'natural';
}

export const NEUTRAL_BEHAVIOUR: PersonaBehaviour = {
  activity: 0.5,
  depth: 0.5,
  risk: 0.3,
  restraint: 0.5,
  anticipation: 0.5,
  patience: 0.5,
  timingVariance: 0.1,
  novelty: 0.5,
  intentionPreference: ['ACCENT', 'TEXTURE', 'SPACE'],
  appetite: { feedback: 0.5, filter: 0.5, drop: 0.5 },
  releaseStyle: 'quantized',
};

/**
 * The five engineers, as behaviour rather than as weights.
 *
 * These are read from what each is known for, and they are deliberately not
 * all "high" — a persona that is high on everything is just the loud setting.
 */
export const PERSONA_BEHAVIOUR: Readonly<Record<string, PersonaBehaviour>> = {
  // Deliberate, precise, famous for the filter and for space.
  tubby: {
    activity: 0.45, depth: 0.6, risk: 0.2, restraint: 0.75,
    anticipation: 0.8, patience: 0.7, timingVariance: 0.02, novelty: 0.35,
    intentionPreference: ['ACCENT', 'SPACE', 'TRANSITION'],
    appetite: { feedback: 0.5, filter: 0.95, drop: 0.5 },
    releaseStyle: 'quantized',
  },
  // Slow feedback swells, patient builds, an engineer's exactness.
  scientist: {
    activity: 0.5, depth: 0.75, risk: 0.35, restraint: 0.6,
    anticipation: 0.7, patience: 0.9, timingVariance: 0.05, novelty: 0.45,
    intentionPreference: ['BUILD', 'ACCENT', 'TEXTURE'],
    appetite: { feedback: 0.9, filter: 0.6, drop: 0.45 },
    releaseStyle: 'quantized',
  },
  // Restless, surprising, drenched. The one who breaks the rule on purpose.
  perry: {
    activity: 0.8, depth: 0.85, risk: 0.9, restraint: 0.25,
    anticipation: 0.3, patience: 0.35, timingVariance: 0.35, novelty: 0.9,
    intentionPreference: ['TEXTURE', 'ACCENT', 'ANSWER'],
    appetite: { feedback: 0.85, filter: 0.5, drop: 0.7 },
    releaseStyle: 'natural',
  },
  // Lush, wide, submerged — patient with a big wash.
  madProfessor: {
    activity: 0.6, depth: 0.9, risk: 0.5, restraint: 0.4,
    anticipation: 0.6, patience: 0.85, timingVariance: 0.1, novelty: 0.55,
    intentionPreference: ['TEXTURE', 'BUILD', 'SPACE'],
    appetite: { feedback: 0.75, filter: 0.55, drop: 0.5 },
    releaseStyle: 'natural',
  },
  // Sparse, hard, digital-era: fires rarely and hits the downbeat when it does.
  jammy: {
    activity: 0.3, depth: 0.7, risk: 0.25, restraint: 0.9,
    anticipation: 0.75, patience: 0.5, timingVariance: 0.02, novelty: 0.3,
    intentionPreference: ['DROP', 'ACCENT', 'SPACE'],
    appetite: { feedback: 0.4, filter: 0.6, drop: 0.9 },
    releaseStyle: 'quantized',
  },
  custom: NEUTRAL_BEHAVIOUR,
};

/** Behaviour for a persona id. Unknown ids get the neutral profile. */
export function behaviourFor(personaId: string): PersonaBehaviour {
  return PERSONA_BEHAVIOUR[personaId] ?? NEUTRAL_BEHAVIOUR;
}

/**
 * Turn behaviour into an intention policy (Gate E).
 *
 * Restraint decides how readily it commits to silence and for how long;
 * anticipation decides how far ahead it looks for something to accent;
 * patience decides how long it will sit doing nothing before filling.
 */
export function intentionPolicyFor(behaviour: PersonaBehaviour): IntentionPolicy {
  const restBars = Math.round(lerp(1, 4, behaviour.restraint));
  // A restrained persona rests more OFTEN as well as for longer; a restless
  // one has to be pushed further before it will.
  const restEveryPhrases = Math.max(1, Math.round(lerp(4, 1, behaviour.restraint)));
  return {
    ...DEFAULT_INTENTION_POLICY,
    restBars,
    restEveryPhrases,
    accentWindow: behaviour.anticipation >= 0.7 ? '1/4'
      : behaviour.anticipation >= 0.4 ? '1/8' : '1/16',
    // A bold persona accents weaker onsets; a careful one waits for a real hit.
    accentStrength: lerp(0.65, 0.3, behaviour.risk),
    // Depth decides how much wash it will tolerate before asking for space.
    wetCeiling: lerp(0.55, 0.95, behaviour.depth),
    // The feedback ceiling is NOT persona-scaled beyond a narrow band: this is
    // the safety edge, and taste does not get a vote on runaway feedback.
    feedbackCeiling: lerp(0.8, 0.9, behaviour.appetite.feedback),
    // Patience: how long it will leave silence before deciding to fill it.
    textureAfterRows: Math.round(lerp(16, 64, behaviour.patience)),
  };
}

/**
 * Turn behaviour into an energy budget (Gate G).
 *
 * Depth and activity together decide how much may be in the air: a deep but
 * infrequent performer and a shallow but busy one can carry similar totals,
 * which is exactly the distinction the old single scalar could not draw.
 */
export function energyBudgetFor(behaviour: PersonaBehaviour): EnergyBudget {
  const factor = 0.5 + 0.5 * (behaviour.depth * 0.6 + behaviour.activity * 0.4) * 2;
  const budget = scaleBudget(DEFAULT_ENERGY_BUDGET, factor);
  // Appetites shift individual axes without touching the others, so "loves
  // feedback" does not also mean "loves a crowded spectrum".
  return {
    ...budget,
    feedback: budget.feedback * lerp(0.7, 1.2, behaviour.appetite.feedback),
    lowFrequencyRisk: budget.lowFrequencyRisk * lerp(0.8, 1.1, behaviour.depth),
  };
}

/** Hold length for a gesture, in bars, from patience. */
export function holdBarsFor(behaviour: PersonaBehaviour, baseBars: number): number {
  return Math.max(0.25, baseBars * lerp(0.5, 1.8, behaviour.patience));
}

/**
 * Does this persona reach for that intention?
 *
 * Returns a multiplier, not a yes/no: a persona that prefers BUILD still
 * accents, it just reaches for the build first. A hard filter would make four
 * of the five personas incapable of half the vocabulary.
 */
export function intentionAffinity(behaviour: PersonaBehaviour, intention: Intention): number {
  const index = behaviour.intentionPreference.indexOf(intention);
  if (index === 0) return 1.5;
  if (index === 1) return 1.25;
  if (index === 2) return 1.1;
  return 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
