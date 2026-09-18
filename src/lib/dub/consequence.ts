/**
 * Gate J — the consequence model.
 *
 * The performer had no idea whether anything it did worked. Each tick chose a
 * move, fired it, and forgot it; the next decision was made in exactly the
 * same state of ignorance as the last. A throw that landed on a channel which
 * turned out to be silent, a drop that removed nothing because the part had
 * already stopped, a wash that buried the very thing it was meant to lift —
 * all of them looked identical to a success from the inside.
 *
 * A consequence is measured, not assumed. Every field here comes from a
 * reading taken before the move and one taken after:
 *
 *  - `targetAudibility` — did the channel the move aimed at actually get
 *    louder or quieter? Per-channel levels, so an echo throw at a channel that
 *    was not playing is detectable as the no-op it was.
 *  - `contrast` — did the mix's overall level MOVE? Dub lives on contrast; a
 *    move that changes nothing measurable did nothing musically either.
 *  - `masking` — did the band the move occupies get more crowded without the
 *    mix getting louder? That is the signature of burying something.
 *  - `wetEnergyChange` / `feedbackChange` — from the Gate G ledger.
 *  - `structuralImpact` — how much of the arrangement's audible width changed.
 *
 * Nothing here is inferred from the move's own metadata: that would only tell
 * us what the move was SUPPOSED to do, which is the assumption this gate
 * exists to replace.
 *
 * Pure: two readings in, a verdict out.
 */

/** A measurement of the mix at one instant. */
export interface MixReading {
  /** Whole-mix RMS, 0..1. */
  rms: number;
  /** Band energies, 0..1 each. */
  sub: number;
  bass: number;
  mid: number;
  high: number;
  /** Per-channel level, by channel index. Sparse is fine. */
  channelLevels: ReadonlyMap<number, number>;
  /** Channels audible at all — the arrangement's width. */
  audibleChannels: number;
  /** From the Gate G ledger. */
  wet: number;
  feedback: number;
}

export interface Consequence {
  /** Change in the target channel's level, -1..1. Null when no target. */
  targetAudibility: number | null;
  /** How much the mix's level moved, 0..1. */
  contrast: number;
  /** 0..1 — the mix got busier without getting louder. */
  masking: number;
  wetEnergyChange: number;
  feedbackChange: number;
  /** -1..1 — fraction of the arrangement's audible width gained or lost. */
  structuralImpact: number;
  /** What the measurements add up to. */
  verdict: ConsequenceVerdict;
  reason: string;
}

export type ConsequenceVerdict =
  /** It did what a move should do: something changed, audibly. */
  | 'effective'
  /** Nothing measurable happened. */
  | 'inaudible'
  /** It made the mix busier without making it clearer. */
  | 'muddying'
  /** It removed more than it added — which is a success for a drop and a
   *  failure for an accent, so the CALLER decides what to do about it. */
  | 'subtractive';

export interface ConsequenceOptions {
  /** Channel the move was aimed at, if any. */
  targetChannel?: number;
  /** Level change below which nothing is considered to have happened. */
  audibilityFloor?: number;
}

/**
 * Compare two readings.
 *
 * `after` should be taken far enough past the fire for the move to have
 * arrived — an echo throw's contribution is not in the mix on the same frame
 * it was fired — and that is the caller's responsibility, since only the
 * caller knows what it fired.
 */
export function measureConsequence(
  before: MixReading,
  after: MixReading,
  options: ConsequenceOptions = {},
): Consequence {
  const floor = options.audibilityFloor ?? 0.02;

  const targetAudibility = options.targetChannel === undefined
    ? null
    : (after.channelLevels.get(options.targetChannel) ?? 0)
      - (before.channelLevels.get(options.targetChannel) ?? 0);

  const contrast = Math.abs(after.rms - before.rms);

  // Busier without louder: band energy climbed while the overall level did
  // not. The mid band carries most of what a listener identifies a part by,
  // so it is weighted highest.
  const bandGrowth =
    Math.max(0, after.mid - before.mid) * 0.5 +
    Math.max(0, after.high - before.high) * 0.25 +
    Math.max(0, after.bass - before.bass) * 0.25;
  const levelGrowth = Math.max(0, after.rms - before.rms);
  const masking = clamp01(bandGrowth - levelGrowth * 2);

  const wetEnergyChange = after.wet - before.wet;
  const feedbackChange = after.feedback - before.feedback;

  const widthBefore = Math.max(1, before.audibleChannels);
  const structuralImpact = (after.audibleChannels - before.audibleChannels) / widthBefore;

  const verdict = judge({
    contrast, masking, structuralImpact, targetAudibility, floor,
    wetEnergyChange,
  });

  return {
    targetAudibility,
    contrast,
    masking,
    wetEnergyChange,
    feedbackChange,
    structuralImpact,
    verdict,
    reason: explain(verdict, { contrast, masking, structuralImpact, targetAudibility }),
  };
}

function judge(m: {
  contrast: number;
  masking: number;
  structuralImpact: number;
  targetAudibility: number | null;
  wetEnergyChange: number;
  floor: number;
}): ConsequenceVerdict {
  // Something left the mix: that is what a drop is for, and a failure for
  // anything else. The caller knows which it asked for.
  if (m.structuralImpact <= -0.2) return 'subtractive';

  // Busier, not clearer.
  if (m.masking >= 0.15) return 'muddying';

  // Nothing moved: not the level, not the target, not the wet energy. A move
  // that changes none of those did nothing, whatever it was supposed to do.
  const targetMoved = m.targetAudibility !== null && Math.abs(m.targetAudibility) >= m.floor;
  if (m.contrast < m.floor && !targetMoved && Math.abs(m.wetEnergyChange) < m.floor) {
    return 'inaudible';
  }

  return 'effective';
}

function explain(
  verdict: ConsequenceVerdict,
  m: { contrast: number; masking: number; structuralImpact: number; targetAudibility: number | null },
): string {
  switch (verdict) {
    case 'inaudible':
      return `nothing moved (contrast ${m.contrast.toFixed(3)})`;
    case 'muddying':
      return `busier without louder (masking ${m.masking.toFixed(2)})`;
    case 'subtractive':
      return `${Math.round(Math.abs(m.structuralImpact) * 100)}% of the arrangement left`;
    case 'effective':
      return m.targetAudibility !== null
        ? `target moved ${m.targetAudibility >= 0 ? 'up' : 'down'} ${Math.abs(m.targetAudibility).toFixed(3)}`
        : `mix moved ${m.contrast.toFixed(3)}`;
  }
}

/**
 * Weight adjustment for a move, given how it went last time.
 *
 * Deliberately gentle and asymmetric. A move that did nothing is pushed down
 * hard, because repeating a no-op is the worst thing the performer can do with
 * a bar. A move that muddied is pushed down less — it DID something, it was
 * just the wrong thing here, and the same move in a drier mix may be right.
 * A move that worked gets no boost at all: rewarding success is how a rule
 * engine ends up playing its favourite move forever, and Gate K4 already
 * distinguishes a motif from a rut.
 */
export function consequenceWeight(consequence: Consequence | undefined): number {
  if (!consequence) return 1;
  switch (consequence.verdict) {
    case 'inaudible': return 0.3;
    case 'muddying': return 0.6;
    case 'subtractive': return 1;
    case 'effective': return 1;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}
