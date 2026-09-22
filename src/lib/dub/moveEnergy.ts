/**
 * Gate G — per-move energy cost and the runtime accounting that decays.
 *
 * The existing restraint is a boolean and two timers: a rule is `wet: true` or
 * it is not, one wet fire per bar, and a fixed block afterwards. That cannot
 * tell a `sonarPing` from a `springSlam`, so the cheap move is rationed like
 * the expensive one and two moves that would sit together perfectly well are
 * refused because they share a flag.
 *
 * Here each move declares what it actually costs, and the ledger tracks what
 * has been spent and lets it decay. Two moves may layer when their combined
 * cost stays inside the budget; dense combinations are restrained because the
 * numbers say so, not because a bar counter said one was enough.
 *
 * The hard safety governor stays separate and persona-independent: this is
 * taste, and taste never gets to decide whether feedback is allowed to run
 * away. Personas scale the BUDGET, not the ceiling.
 *
 * Pure: no engine, no stores, no time source of its own — the caller passes
 * the clock in, so tests are deterministic and a seek cannot confuse it.
 */

/** What one fire of a move puts into the air. All 0..1 unless noted. */
export interface MoveEnergyCost {
  /** Wet signal it adds — echo, spring, reverb tail. */
  wet: number;
  /** How much it drives regeneration. High values ring on after release. */
  feedback: number;
  /** How much of the spectrum it fills. A wash scores high, a ping low. */
  spectralDensity: number;
  /** Risk it adds in the low end, where headroom is thinnest. */
  lowFrequencyRisk: number;
  /**
   * How long its contribution takes to fall away after release, in seconds.
   * Not the hold length — the TAIL. A throw is short to press and long to
   * disappear, which is exactly the asymmetry the old bar counter missed.
   */
  decaySec: number;
}

const DEFAULT_COST: MoveEnergyCost = {
  wet: 0.25, feedback: 0.1, spectralDensity: 0.25, lowFrequencyRisk: 0.05, decaySec: 2,
};

/**
 * Costs per move.
 *
 * Numbers are relative to each other, not absolute physics: what matters is
 * that `springSlam` costs several times a `sonarPing`, and that anything
 * feeding the echo's own regeneration carries feedback cost even when its wet
 * contribution is modest.
 */
export const MOVE_ENERGY: Readonly<Record<string, MoveEnergyCost>> = {
  // Throws — the bread and butter. Short press, long tail.
  echoThrow:        { wet: 0.55, feedback: 0.45, spectralDensity: 0.35, lowFrequencyRisk: 0.10, decaySec: 4 },
  channelThrow:     { wet: 0.50, feedback: 0.40, spectralDensity: 0.30, lowFrequencyRisk: 0.10, decaySec: 4 },
  skankEchoThrow:   { wet: 0.50, feedback: 0.40, spectralDensity: 0.30, lowFrequencyRisk: 0.05, decaySec: 4 },
  skankFloatThrow:  { wet: 0.45, feedback: 0.35, spectralDensity: 0.30, lowFrequencyRisk: 0.05, decaySec: 5 },
  delayTimeThrow:   { wet: 0.40, feedback: 0.45, spectralDensity: 0.30, lowFrequencyRisk: 0.05, decaySec: 3 },
  dubStab:          { wet: 0.35, feedback: 0.25, spectralDensity: 0.25, lowFrequencyRisk: 0.05, decaySec: 2 },

  // Reverb-forward moves: the ones that turn a version into a wash.
  springSlam:       { wet: 0.80, feedback: 0.30, spectralDensity: 0.70, lowFrequencyRisk: 0.10, decaySec: 6 },
  springKick:       { wet: 0.45, feedback: 0.20, spectralDensity: 0.35, lowFrequencyRisk: 0.20, decaySec: 3 },
  ghostReverb:      { wet: 0.75, feedback: 0.25, spectralDensity: 0.60, lowFrequencyRisk: 0.05, decaySec: 5 },
  backwardReverb:   { wet: 0.60, feedback: 0.20, spectralDensity: 0.55, lowFrequencyRisk: 0.05, decaySec: 4 },
  reverseEcho:      { wet: 0.60, feedback: 0.35, spectralDensity: 0.50, lowFrequencyRisk: 0.05, decaySec: 4 },
  echoBuildUp:      { wet: 0.70, feedback: 0.60, spectralDensity: 0.45, lowFrequencyRisk: 0.10, decaySec: 6 },
  madProfPingPong:  { wet: 0.55, feedback: 0.50, spectralDensity: 0.45, lowFrequencyRisk: 0.05, decaySec: 5 },

  // Colour with little tail of its own.
  sonarPing:        { wet: 0.20, feedback: 0.10, spectralDensity: 0.15, lowFrequencyRisk: 0.00, decaySec: 2 },
  stereoDoubler:    { wet: 0.15, feedback: 0.05, spectralDensity: 0.30, lowFrequencyRisk: 0.00, decaySec: 1 },
  tapeWobble:       { wet: 0.10, feedback: 0.05, spectralDensity: 0.20, lowFrequencyRisk: 0.05, decaySec: 1 },
  ringMod:          { wet: 0.15, feedback: 0.05, spectralDensity: 0.55, lowFrequencyRisk: 0.00, decaySec: 1 },
  voltageStarve:    { wet: 0.10, feedback: 0.05, spectralDensity: 0.45, lowFrequencyRisk: 0.05, decaySec: 1 },
  toast:            { wet: 0.30, feedback: 0.20, spectralDensity: 0.30, lowFrequencyRisk: 0.00, decaySec: 3 },
  dubSiren:         { wet: 0.40, feedback: 0.30, spectralDensity: 0.40, lowFrequencyRisk: 0.00, decaySec: 3 },
  tubbyScream:      { wet: 0.45, feedback: 0.40, spectralDensity: 0.45, lowFrequencyRisk: 0.00, decaySec: 3 },

  // Low end — cheap in wet terms, expensive where the headroom is.
  subSwell:         { wet: 0.15, feedback: 0.05, spectralDensity: 0.20, lowFrequencyRisk: 0.75, decaySec: 3 },
  subHarmonic:      { wet: 0.10, feedback: 0.05, spectralDensity: 0.15, lowFrequencyRisk: 0.80, decaySec: 2 },
  oscBass:          { wet: 0.10, feedback: 0.05, spectralDensity: 0.20, lowFrequencyRisk: 0.70, decaySec: 2 },
  crushBass:        { wet: 0.10, feedback: 0.05, spectralDensity: 0.40, lowFrequencyRisk: 0.60, decaySec: 1 },
  // Adds no signal at all — it lifts what is already playing — so its wet and
  // feedback cost are near nothing. Nearly all of its cost is where a low
  // shelf actually spends: the headroom under 120 Hz. That is also the axis
  // `bassEmphasisShape` reads back to decide HOW MANY dB to ask for.
  bassEmphasis:     { wet: 0.05, feedback: 0.00, spectralDensity: 0.10, lowFrequencyRisk: 0.45, decaySec: 2 },

  // Filters and EQ: they take away more than they add.
  filterDrop:       { wet: 0.05, feedback: 0.00, spectralDensity: 0.00, lowFrequencyRisk: 0.00, decaySec: 1 },
  hpfRise:          { wet: 0.05, feedback: 0.00, spectralDensity: 0.00, lowFrequencyRisk: 0.00, decaySec: 1 },
  eqSweep:          { wet: 0.05, feedback: 0.00, spectralDensity: 0.10, lowFrequencyRisk: 0.10, decaySec: 1 },
  combSweep:        { wet: 0.25, feedback: 0.20, spectralDensity: 0.40, lowFrequencyRisk: 0.05, decaySec: 2 },

  // Silence-makers: they REDUCE what is in the air, so they cost nothing to
  // layer. This is the distinction the old `wet` boolean could not express.
  channelMute:      { wet: 0, feedback: 0, spectralDensity: 0, lowFrequencyRisk: 0, decaySec: 0 },
  masterDrop:       { wet: 0, feedback: 0, spectralDensity: 0, lowFrequencyRisk: 0, decaySec: 0 },
  versionDrop:      { wet: 0, feedback: 0, spectralDensity: 0, lowFrequencyRisk: 0, decaySec: 0 },
  riddimSection:    { wet: 0, feedback: 0, spectralDensity: 0, lowFrequencyRisk: 0, decaySec: 0 },
  tapeStop:         { wet: 0, feedback: 0, spectralDensity: 0, lowFrequencyRisk: 0, decaySec: 0 },
  transportTapeStop:{ wet: 0, feedback: 0, spectralDensity: 0, lowFrequencyRisk: 0, decaySec: 0 },
  snareCrack:       { wet: 0.30, feedback: 0.20, spectralDensity: 0.25, lowFrequencyRisk: 0.05, decaySec: 2 },
  radioRiser:       { wet: 0.25, feedback: 0.10, spectralDensity: 0.40, lowFrequencyRisk: 0.00, decaySec: 2 },

  // Delay character changes: they re-colour the tail rather than add to it.
  delayPresetDotted:  { wet: 0.10, feedback: 0.15, spectralDensity: 0.10, lowFrequencyRisk: 0, decaySec: 2 },
  delayPresetTriplet: { wet: 0.10, feedback: 0.15, spectralDensity: 0.10, lowFrequencyRisk: 0, decaySec: 2 },
  delayPreset380:     { wet: 0.10, feedback: 0.15, spectralDensity: 0.10, lowFrequencyRisk: 0, decaySec: 2 },
  delayPresetQuarter: { wet: 0.10, feedback: 0.15, spectralDensity: 0.10, lowFrequencyRisk: 0, decaySec: 2 },
  delayPreset8th:     { wet: 0.10, feedback: 0.20, spectralDensity: 0.15, lowFrequencyRisk: 0, decaySec: 2 },
  delayPreset16th:    { wet: 0.10, feedback: 0.25, spectralDensity: 0.20, lowFrequencyRisk: 0, decaySec: 2 },
  delayPresetDoubler: { wet: 0.15, feedback: 0.25, spectralDensity: 0.20, lowFrequencyRisk: 0, decaySec: 2 },
};

/** Cost of a move. An unknown move gets a middling cost, never a free ride. */
export function energyCostOf(moveId: string): MoveEnergyCost {
  return MOVE_ENERGY[moveId] ?? DEFAULT_COST;
}

// ─────────────────────────── The ledger ──────────────────────────────────

export interface EnergyBudget {
  /** Wet the performer is willing to have in the air at once. */
  wet: number;
  feedback: number;
  spectralDensity: number;
  lowFrequencyRisk: number;
}

/** Persona-neutral default. Personas scale this; none of them scale a ceiling. */
export const DEFAULT_ENERGY_BUDGET: EnergyBudget = {
  wet: 1.0,
  feedback: 0.9,
  spectralDensity: 1.2,
  lowFrequencyRisk: 0.9,
};

export interface EnergyReading {
  wet: number;
  feedback: number;
  spectralDensity: number;
  lowFrequencyRisk: number;
}

interface Entry {
  cost: MoveEnergyCost;
  /** Seconds at which the contribution began decaying (release, or fire for
   *  a one-shot). Null while the move is still held: a hold does not fade. */
  releasedAtSec: number | null;
  firedAtSec: number;
  moveId: string;
}

/**
 * What is currently in the air, with decay.
 *
 * A held move contributes its full cost for as long as it is held; once
 * released it fades over its own `decaySec`. Linear decay, deliberately: an
 * exponential never reaches zero, so a session would accumulate a permanent
 * floor of imaginary energy and the performer would grow quieter all evening.
 */
export class EnergyLedger {
  private entries = new Map<string, Entry>();

  /** Record a fire. `id` is the gesture or invocation id. */
  add(id: string, moveId: string, nowSec: number, held: boolean): void {
    this.entries.set(id, {
      cost: energyCostOf(moveId),
      firedAtSec: nowSec,
      releasedAtSec: held ? null : nowSec,
      moveId,
    });
  }

  /** Record a release: the contribution starts fading from here. */
  release(id: string, nowSec: number): void {
    const entry = this.entries.get(id);
    if (entry && entry.releasedAtSec === null) entry.releasedAtSec = nowSec;
  }

  /** Forget everything — song change, transport stop. */
  clear(): void {
    this.entries.clear();
  }

  /** Drop entries that have fully decayed. Called by `read`. */
  private prune(nowSec: number): void {
    for (const [id, entry] of this.entries) {
      if (entry.releasedAtSec === null) continue;
      if (nowSec - entry.releasedAtSec >= entry.cost.decaySec) this.entries.delete(id);
    }
  }

  /** Energy in the air right now. */
  read(nowSec: number): EnergyReading {
    this.prune(nowSec);
    const total: EnergyReading = { wet: 0, feedback: 0, spectralDensity: 0, lowFrequencyRisk: 0 };
    for (const entry of this.entries.values()) {
      const f = fade(entry, nowSec);
      if (f <= 0) continue;
      total.wet += entry.cost.wet * f;
      total.feedback += entry.cost.feedback * f;
      total.spectralDensity += entry.cost.spectralDensity * f;
      total.lowFrequencyRisk += entry.cost.lowFrequencyRisk * f;
    }
    return total;
  }

  /**
   * May this move be added on top of what is already in the air?
   *
   * Compatible gestures layer: two cheap moves inside the budget are allowed
   * where the old one-wet-per-bar rule refused them. Dense ones are refused
   * with the axis that refused them, so the fire log can say why.
   */
  admits(
    moveId: string,
    nowSec: number,
    budget: EnergyBudget = DEFAULT_ENERGY_BUDGET,
  ): { ok: true } | { ok: false; axis: keyof EnergyBudget; would: number; budget: number } {
    const current = this.read(nowSec);
    const cost = energyCostOf(moveId);
    const axes: Array<keyof EnergyBudget> = ['wet', 'feedback', 'spectralDensity', 'lowFrequencyRisk'];
    for (const axis of axes) {
      // A move is judged only on the axes it actually contributes to. Without
      // this, a mix already over budget would refuse `channelMute` — a move
      // that takes sound AWAY — because the total was high, which is exactly
      // backwards: when it is too loud, the silencing moves are the ones you
      // want available.
      if (cost[axis] <= 0) continue;
      const would = current[axis] + cost[axis];
      if (would > budget[axis]) return { ok: false, axis, would, budget: budget[axis] };
    }
    return { ok: true };
  }

  /** Ids currently contributing, for diagnostics. */
  activeIds(): readonly string[] {
    return Array.from(this.entries.keys());
  }
}

/** 1 while held, falling linearly to 0 across `decaySec` after release. */
function fade(entry: Entry, nowSec: number): number {
  if (entry.releasedAtSec === null) return 1;
  if (entry.cost.decaySec <= 0) return 0;
  const elapsed = nowSec - entry.releasedAtSec;
  if (elapsed <= 0) return 1;
  if (elapsed >= entry.cost.decaySec) return 0;
  return 1 - elapsed / entry.cost.decaySec;
}

/** Scale a budget — how personas differ. Clamped so none can lift a ceiling. */
export function scaleBudget(budget: EnergyBudget, factor: number): EnergyBudget {
  const f = Math.max(0.25, Math.min(1.5, Number.isFinite(factor) ? factor : 1));
  return {
    wet: budget.wet * f,
    feedback: budget.feedback * f,
    spectralDensity: budget.spectralDensity * f,
    lowFrequencyRisk: budget.lowFrequencyRisk * f,
  };
}
