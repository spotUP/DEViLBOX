/**
 * subSwell — one-octave-down sub-harmonic swell, triggered for a beat or
 * two to add Bill-Laswell-style bottom-end weight to the mix. Fires a
 * clean 55 Hz sine through a short envelope, routed directly to return
 * so it lands audibly regardless of bus content.
 */

import type { DubMove } from './_types';

export const subSwell: DubMove = {
  id: 'subSwell',
  kind: 'trigger',
  defaults: { freq: 55, durationMs: 400, level: 0.8 },

  execute({ bus, params }) {
    const freq = params.freq ?? this.defaults.freq;
    const durationMs = params.durationMs ?? this.defaults.durationMs;
    const level = params.level ?? this.defaults.level;
    bus.fireSubSwell(freq, durationMs, level);
    return null;
  },
};
