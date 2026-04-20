/**
 * stereoDoubler — Dan D.N.A.'s 20 ms cross-fed stereo widener from the
 * Dub Scrolls: mono bus content gets a ~20ms delayed copy panned opposite,
 * with cross-feedback between the two channels. Result: a drier mono source
 * reads as wide artificial stereo. Distinct from M/S matrix widening — this
 * creates spatial imaging via Haas-effect + comb rather than mid/side.
 *
 * Hold move. Held = doubler active; release = fade out over 200 ms.
 */

import type { DubMove } from './_types';

export const stereoDoubler: DubMove = {
  id: 'stereoDoubler',
  kind: 'hold',
  defaults: { delayMs: 25, feedback: 0.55, wet: 0.9 },

  execute({ bus, params }) {
    const delayMs = params.delayMs ?? this.defaults.delayMs;
    const feedback = params.feedback ?? this.defaults.feedback;
    const wet = params.wet ?? this.defaults.wet;
    const release = bus.startStereoDoubler(delayMs, feedback, wet);
    return { dispose: release };
  },
};
