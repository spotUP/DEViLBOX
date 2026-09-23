/**
 * tapeWobble — continuous LFO on the echo delay time. Held for as long
 * as the caller keeps the move alive; release restores the baseline rate
 * smoothly.
 *
 * Mechanic: sinusoidal modulation of echo.setRate() at `rateHz` with
 * `depthMs` amplitude around the user's baseline. Emulates the wow a
 * drifting tape head adds on every platter rotation — seasick flutter
 * independent of the RE-201's own fixed wow parameter. Classic dub
 * performance move for "tape going out of tune" drama during a drop.
 *
 * Global move.
 */

import type { DubMove } from './_types';

export const tapeWobble: DubMove = {
  id: 'tapeWobble',
  kind: 'hold',
  /**
   * Twice the depth it had.
   *
   * 35 ms of deviation on a 300 ms echo is a half-step of pitch at most, and
   * against a dense return it read as nothing (2026-09-23). 70 ms is a tape
   * machine with a tired capstan, which is the point.
   */
  defaults: { depthMs: 70, rateHz: 2.5 },

  execute({ bus, params }) {
    const depthMs = params.depthMs ?? this.defaults.depthMs;
    const rateHz = params.rateHz ?? this.defaults.rateHz;
    const release = bus.startTapeWobble(depthMs, rateHz);
    const releaseGesture = bus.holdWetGesture();
    return { dispose() { releaseGesture(); release(); } };
  },
};
