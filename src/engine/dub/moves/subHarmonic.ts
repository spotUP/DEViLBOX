/**
 * subHarmonic — Bill-Laswell-style thickness. While held, an envelope
 * follower watches the bus input level; every transient above threshold
 * triggers a short one-octave-down sine pulse (default 55 Hz) that lands
 * on every kick/snare. Routes direct to return so the sub reads as
 * added weight under the mix.
 *
 * Not a continuous drone — this is beat-synced sub thickening that
 * follows the music's own transients.
 */

import type { DubMove } from './_types';

export const subHarmonic: DubMove = {
  id: 'subHarmonic',
  kind: 'hold',
  // Threshold lowered 0.06 → 0.035 and level 0.7 → 0.85 after the
  // 2026-04-20 sweep showed the move produced no audible contribution on
  // the reference test song (kicks peaked around 0.05 — right on the edge
  // of the old threshold). New values trigger on every visible transient
  // and the sub pulse is loud enough to read clearly against the mix.
  /**
   * The sub is an ADD into the return, so its level competes with the whole
   * core wet chain rather than replacing any of it.
   *
   * `level` is INTENT for `generatedPeakFor`, which clamps it to 0..1 — so
   * this read 1.4 for a long while and 1.4 is exactly 1.0. The comment beside
   * it claimed 1.4 "puts the octave-down where a listener feels it", and
   * nothing did. That false belief is why the move was mis-diagnosed twice
   * (2026-09-21, 2026-10-01): the number being pushed up could not have done
   * anything, so the level had to be raised somewhere that could — which was
   * the RMS reference in programmeLevel.ts, now corrected. Real full intent
   * is 1; the level itself is set by the presence factor.
   */
  defaults: { freq: 55, threshold: 0.035, level: 1 },

  execute({ bus, params }) {
    const level = params.level ?? this.defaults.level;
    // The mode is read from the bus rather than passed in: `DubMoveContext.params`
    // is numeric, and the deck's select already writes the authoritative value
    // into the bus settings. One source of truth, no second copy to drift.
    if (bus.subHarmonicMode === 'continuous') {
      // `level` is passed straight through, and the BED maps it to its own
      // range inside `startSubBassBed`. It cannot be defaulted here: the router
      // merges `move.defaults` into `params` before execute runs
      // (DubRouter.ts:250), so `params.level` is ALWAYS set — a `?? 0.35` in
      // this function never fires, which is how the bed shipped running at
      // full unity and read as a heavy bass boost.
      console.log(`[subHarmonic] continuous sub bed, level=${level}`);
      // No wet gesture: the bed is its own layer after the return, and a
      // gesture would lift the echo wash under it (WET_GESTURE_LIFT).
      const stopBed = bus.startSubBassBed(level);
      return { dispose() { stopBed(); } };
    }
    const freq = params.freq ?? this.defaults.freq;
    const threshold = params.threshold ?? this.defaults.threshold;
    console.log(`[subHarmonic] fired freq=${freq} threshold=${threshold} level=${level}`);
    const release = bus.startSubHarmonic(freq, threshold, level);
    return { dispose() { release(); } };
  },
};
