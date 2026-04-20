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
  defaults: { freq: 55, threshold: 0.035, level: 0.85 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const threshold = params.threshold ?? this.defaults.threshold;
    const level = params.level ?? this.defaults.level;
    console.log(`[subHarmonic] fired freq=${freq} threshold=${threshold} level=${level}`);
    const release = bus.startSubHarmonic(freq, threshold, level);
    return { dispose: release };
  },
};
