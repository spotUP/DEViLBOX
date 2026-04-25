/**
 * tubbyScream — route the spring reverb RETURN back into the reverb's OWN
 * input through a sweepable bandpass filter, driving the reverb into
 * self-feedback at the bandpass center frequency. As the center sweeps,
 * the oscillation pitch tracks, producing the classic Tubby "crying metal"
 * scream that ramps up as the feedback escalates.
 *
 * Source: Dub Scrolls (Yaniko / Dubcreator) — "route reverb return back
 * into reverb input, boost midrange, sweep centre frequency." That's
 * exactly what this does.
 *
 * Hold move. Release kills the feedback loop and rescues the bus from
 * runaway oscillation.
 */

import type { DubMove } from './_types';

export const tubbyScream: DubMove = {
  id: 'tubbyScream',
  kind: 'hold',
  // feedbackAmount must stay below ~1.8 — above that the loop saturates into
  // harsh metallic noise ("subway brake" artefact) instead of a warm squeal.
  // sweepHz kept at 1600 Hz — going higher produces harsh metallic overtones;
  // real Tubby screams were warm mid-range feedback, not piercing shrieks.
  defaults: { centerHz: 700, sweepHz: 1600, sweepSec: 3.5, feedbackAmount: 1.6 },

  execute({ bus, params }) {
    const centerHz = params.centerHz ?? this.defaults.centerHz;
    const sweepHz = params.sweepHz ?? this.defaults.sweepHz;
    const sweepSec = params.sweepSec ?? this.defaults.sweepSec;
    const feedbackAmount = params.feedbackAmount ?? this.defaults.feedbackAmount;
    const release = bus.startTubbyScream(centerHz, sweepHz, sweepSec, feedbackAmount);
    return { dispose: release };
  },
};
