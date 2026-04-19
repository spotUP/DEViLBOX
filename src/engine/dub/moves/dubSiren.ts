/**
 * dubSiren — drive the echo feedback into self-oscillation for the classic
 * King Tubby siren / wobble. Held for as long as the caller keeps the move
 * alive; release ramps feedback back to zero over ~200 ms.
 *
 * Thin wrapper over DubBus.setSirenFeedback() — exposes it as a router-firable
 * move so it shows up in the recorder lane, MIDI bindings, and on-screen UI.
 * Global move (channelId ignored). The bus itself caps feedback at 0.95 so
 * the loop can't blow up regardless of what the caller passes.
 */

import type { DubMove } from './_types';

export const dubSiren: DubMove = {
  id: 'dubSiren',
  kind: 'hold',
  defaults: { amount: 0.85, rampSec: 0.08 },

  execute({ bus, params }) {
    const amount = params.amount ?? this.defaults.amount;
    const rampSec = params.rampSec ?? this.defaults.rampSec;

    const release = bus.setSirenFeedback(amount, rampSec);
    return { dispose: release };
  },
};
