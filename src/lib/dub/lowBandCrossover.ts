/**
 * The BASS control as a low-band saturator.
 *
 * Every earlier shape of this control was linear: a shelf, then a shelf plus
 * a parallel band. Linear lift raises the low band's PEAKS by exactly the dB
 * it adds, and on a tune whose energy is nearly all under the corner that hit
 * the clipper ("clips/dists"), then the trim ride pulled the whole mix down
 * to make room ("the bass kills all other audio"), then the ride was told to
 * spend the boost first and only ~1.5 dB of the requested 12 fit
 * (measured 2026-09-22, amanda.ahx with AutoDub). At a fixed ceiling, heavy
 * bass and untouched mids cannot both be linear.
 *
 * So the low band is split off with a Linkwitz-Riley crossover, lifted, and
 * SATURATED: its peaks are bounded by a soft clip while its weight goes up,
 * and the high band passes untouched. That is how a dub desk gets heavy —
 * the bass is driven into the console's iron, not into the mix's headroom.
 * No lookahead, no latency, no pumping.
 *
 * The curve is fixed and normalised to ±1; drive and ceiling are gains
 * around it: y = ceiling · sat(x · drive / ceiling). For small x that is
 * x · drive, the lift; for large x it is bounded by `ceiling`. At rest the
 * ceiling is full scale and the curve's knee is well above programme
 * peaks, so an enabled bus with BASS at 0 is transparent. As BASS rises the
 * ceiling comes down to `LOW_CEILING_AT_TOP`, leaving room for the high
 * band on the same peak.
 *
 * Pure. A dB in, two gains out.
 */

/** Curve knee, normalised: linear below, soft above. */
export const LOW_SAT_KNEE = 0.7;
/** Bound on the low band's peak at rest (transparent) and once the control is up. */
export const LOW_CEILING_AT_REST = 1.0;
export const LOW_CEILING_AT_TOP = 0.5;   // 0.6 left the sum with the high band and the return over the ride's target; the ride then spent the lift (measured +2.5 of 12 dB, 2026-09-22)
/**
 * The ceiling reaches its working value this far up the control and stays
 * there. A ceiling that kept falling to the top made the output at a real
 * bass level FALL over the last third of the travel — the cap shrank faster
 * than the lift grew — so the control got lighter as it went up.
 */
export const LOW_CEILING_SETTLE_DB = 3;

export interface LowBandGains {
  /** Gain into the saturator, linear. */
  drive: number;
  /** Gain out of it, linear — and the bound on the band's peak. */
  ceiling: number;
}

export function lowBandGainsFor(bassDb: number): LowBandGains {
  const db = Number.isFinite(bassDb) ? bassDb : 0;
  const lift = Math.pow(10, db / 20);
  const t = Math.max(0, Math.min(LOW_CEILING_SETTLE_DB, db)) / LOW_CEILING_SETTLE_DB;
  const ceiling = LOW_CEILING_AT_REST - (LOW_CEILING_AT_REST - LOW_CEILING_AT_TOP) * t;
  return { drive: lift / ceiling, ceiling };
}
