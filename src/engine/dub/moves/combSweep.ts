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
  defaults: { amount: 0.65, rampMs: 80 },

  execute({ bus, params }) {
    const amount = params.amount ?? this.defaults.amount;
    const rampMs = params.rampMs ?? this.defaults.rampMs;
    const stop = bus.startCombSweep(amount, rampMs / 1000);
    return { dispose() { stop(); } };
  },
};
