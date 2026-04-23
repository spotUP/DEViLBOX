/**
 * eqSweep — sweeps the return EQ center frequency while held.
 *
 * The classic Tubby technique: boost a resonant peak on the echo/spring
 * return and sweep it by hand. Creates phaser-like motion from pure EQ.
 * Snapshots prior EQ state and restores on release (via DubBus.startEQSweep).
 */

import type { DubMove } from './_types';

export const eqSweep: DubMove = {
  id: 'eqSweep',
  kind: 'hold',
  defaults: { startHz: 300, endHz: 3000, sweepSec: 2.0, gain: 12, q: 4 },

  execute({ bus, params }) {
    const startHz = params.startHz ?? this.defaults.startHz;
    const endHz = params.endHz ?? this.defaults.endHz;
    const sweepSec = params.sweepSec ?? this.defaults.sweepSec;
    const gain = params.gain ?? this.defaults.gain;
    const q = params.q ?? this.defaults.q;

    const stop = bus.startEQSweep(startHz, endHz, gain, q, sweepSec);

    return {
      dispose() {
        stop();
      },
    };
  },
};
