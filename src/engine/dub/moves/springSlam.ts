/**
 * springSlam — instant splash of spring reverb over the current dub return.
 *
 * Mechanic: momentarily cranks spring wet to `amount` for `holdMs`, then
 * restores the user's baseline. Classic dub "splash" hit — a drum or stab
 * gets a sudden halo of metal-tank reverb that snaps back to dry. Thin
 * wrapper over DubBus.slamSpring(). Global move (channelId ignored).
 */

import type { DubMove } from './_types';

export const springSlam: DubMove = {
  id: 'springSlam',
  kind: 'trigger',
  defaults: { amount: 1.0, holdMs: 400 },

  execute({ bus, params }) {
    const amount = params.amount ?? this.defaults.amount;
    const holdMs = params.holdMs ?? this.defaults.holdMs;
    bus.slamSpring(amount, holdMs);
    // Pure one-shot — no disposer; slamSpring owns its own restore timer.
    return null;
  },
};
