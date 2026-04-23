/**
 * springKick — physically "kick" the spring reverb tank.
 *
 * Unlike springSlam (which is a splash — crank wet + inject a 300ms
 * thump+shang layered excitation), springKick models the literal act of
 * kicking the reverb unit: a single 5ms wideband impulse at massive
 * amplitude hits the spring input and excites ALL resonant modes at once.
 * The result is a thunderous, explosive crash that decays naturally through
 * the spring algorithm — King Tubby's trademark "thunder" effect.
 *
 * Differences from springSlam:
 * - springSlam: shaped layers (55Hz sine + bandpass noise), long (300ms),
 *   routes to both input and return for guaranteed audibility.
 * - springKick: single ultrashort broadband impulse (5ms), routes ONLY
 *   into the spring input so the character comes entirely from the spring's
 *   own resonance. Much more violent and unpredictable.
 */

import type { DubMove } from './_types';

export const springKick: DubMove = {
  id: 'springKick',
  kind: 'trigger',
  defaults: { amount: 1.0, holdMs: 600 },

  execute({ bus, params }) {
    const amount = params.amount ?? this.defaults.amount;
    const holdMs = params.holdMs ?? this.defaults.holdMs;

    bus.kickSpring(amount, holdMs);
    return null;
  },
};
