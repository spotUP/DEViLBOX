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
  defaults: { freq: 55, threshold: 0.06, level: 0.7 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const threshold = params.threshold ?? this.defaults.threshold;
    const level = params.level ?? this.defaults.level;
    const release = bus.startSubHarmonic(freq, threshold, level);
    return { dispose: release };
  },
};
