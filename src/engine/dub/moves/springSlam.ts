/**
 * springSlam — instant splash of spring reverb over the dub return. When
 * channelId is undefined, splashes every channel feeding the bus. When a
 * channelId is provided, momentarily solos that channel's dub tap for
 * the slam window so only THAT channel's audio gets splashed — the
 * other channels continue dry through the main mix untouched.
 *
 * Mechanic: momentarily cranks spring wet to `amount` for `holdMs`, then
 * restores the user's baseline. Classic dub "splash" hit — a drum or stab
 * gets a sudden halo of metal-tank reverb that snaps back to dry.
 */

import type { DubMove } from './_types';

export const springSlam: DubMove = {
  id: 'springSlam',
  kind: 'trigger',
  defaults: { amount: 1.0, holdMs: 400 },

  execute({ bus, channelId, params }) {
    const amount = params.amount ?? this.defaults.amount;
    const holdMs = params.holdMs ?? this.defaults.holdMs;

    // Per-channel: solo the target tap for the slam window, restore after.
    if (channelId !== undefined) {
      const releaseSolo = bus.soloChannelTap(channelId, 0.003);
      bus.slamSpring(amount, holdMs);
      setTimeout(() => {
        try { releaseSolo(); } catch { /* ok */ }
      }, holdMs);
      return null;
    }

    bus.slamSpring(amount, holdMs);
    return null;
  },
};
