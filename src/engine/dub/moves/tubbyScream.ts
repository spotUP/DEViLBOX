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
  defaults: { centerHz: 900, sweepHz: 2600, sweepSec: 3.0, feedbackAmount: 2.2 },

  execute({ bus, params }) {
    const centerHz = params.centerHz ?? this.defaults.centerHz;
    const sweepHz = params.sweepHz ?? this.defaults.sweepHz;
    const sweepSec = params.sweepSec ?? this.defaults.sweepSec;
    const feedbackAmount = params.feedbackAmount ?? this.defaults.feedbackAmount;
    const release = bus.startTubbyScream(centerHz, sweepHz, sweepSec, feedbackAmount);
    return { dispose: release };
  },
};
