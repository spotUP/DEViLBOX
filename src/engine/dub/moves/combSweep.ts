/**
 * combSweep — activates the liquid comb-filter / phaser sweep while held.
 *
 * Ramps sweepOutput.gain to `amount`, restores on release. The LFO is always
 * running at the bus's current sweepRateHz; this move just opens the gate.
 * With comb mode: short-delay modulation gives the classic dub "underwater"
 * swirl on drums and bass. With phaser mode: all-pass cascade spin.
 *
 * Works as a toggle in the dub deck UI (hold-style, toggled on/off by the
 * operator) or fires automatically via AutoDub on percussion/skank channels.
 */

import type { DubMove } from './_types';

export const combSweep: DubMove = {
  id: 'combSweep',
  kind: 'hold',
  // amount: wet level. rateHz: LFO speed — 0.8 Hz gives one full sweep per bar
  // at most reggae tempos, clearly audible. depthMs: 8ms is a deep, rich comb.
  defaults: { amount: 0.75, rampMs: 80, rateHz: 0.8, depthMs: 8 },

  execute({ bus, params }) {
    const stop = bus.startCombSweep(
      params.amount  ?? this.defaults.amount,
      (params.rampMs ?? this.defaults.rampMs) / 1000,
      params.rateHz  ?? this.defaults.rateHz,
      params.depthMs ?? this.defaults.depthMs,
    );
    return { dispose() { stop(); } };
  },
};
