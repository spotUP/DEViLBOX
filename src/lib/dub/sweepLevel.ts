/**
 * The dub bus's liquid sweep (comb or phaser) as colour, not level.
 *
 * The sweep is a parallel branch added onto the main path in front of the
 * tape stage. Its own level rises steeply with feedback, and the sum at full
 * amount stacked on the main path: measured 2026-09-30 with pink noise, the
 * branch alone at amount 1 ran -0.4 dB (comb, feedback 0) to +6.5 dB (0.85)
 * and -1.8 dB (phaser, 0) to +17.4 dB (0.95) over its input - a big part of
 * "the echo/reverb is still on overdrive drowning everything".
 *
 * Two parts, both measured, not modelled (a 1/(1 - fb^2) model under-reads
 * both engines' resonant build-up):
 *   - the branch is normalised by the inverse of its measured gain at the
 *     current feedback (tables below, interpolated), so it runs at unity;
 *   - dry and branch mix equal-power, so a full-amount sweep is a 50/50-style
 *     blend (full notch depth) at unity level instead of an added copy.
 */

/** [feedback, branch gain dB at amount 1] - comb (sweepFeedback 0..0.85). */
export const COMB_BRANCH_DB: ReadonlyArray<readonly [number, number]> = [
  [0, -0.4], [0.15, -0.3], [0.3, -0.2], [0.45, 0.2], [0.6, 1.0], [0.7, 1.7], [0.78, 3.0], [0.85, 6.5],
];
/** [feedback, branch gain dB at amount 1] - phaser (phaserFeedback 0..0.95). */
export const PHASER_BRANCH_DB: ReadonlyArray<readonly [number, number]> = [
  [0, -1.8], [0.2, -0.2], [0.4, 1.9], [0.55, 4.1], [0.65, 6.0], [0.75, 8.4], [0.85, 11.9], [0.95, 17.4],
];

function interp(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return table[table.length - 1][1];
}

/** The linear gain that brings the sweep branch to unity at this feedback. */
export function sweepBranchNorm(mode: 'comb' | 'phaser', feedback: number): number {
  const db = interp(mode === 'phaser' ? PHASER_BRANCH_DB : COMB_BRANCH_DB, Math.max(0, feedback));
  return Math.pow(10, -db / 20);
}

/** Equal-power dry / sweep mix for a sweep amount 0..1. */
export function sweepMix(amount: number): { dry: number; wet: number } {
  const a = Math.max(0, Math.min(1, amount));
  const n = Math.sqrt(1 + a * a);
  return { dry: 1 / n, wet: a / n };
}
