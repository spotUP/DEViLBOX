/**
 * delayTimeThrow — pitch-whoosh on the echo tail via a rapid rate sweep.
 *
 * Mechanic: ramp the echo delay time from baseline → target over downMs,
 * hold at target for holdMs, then return to baseline over upMs. Echoes
 * in flight get pitch-shifted as the buffer read-head speed changes,
 * producing the classic "tail falls off a cliff" sound. Used as a
 * transition accent — fire once at a bar boundary for a dramatic
 * pitch dive / rise.
 *
 * Global move. The one-shot owns its own timeline; no disposer.
 */

import type { DubMove } from './_types';

export const delayTimeThrow: DubMove = {
  id: 'delayTimeThrow',
  kind: 'trigger',
  defaults: { targetMs: 60, downMs: 120, holdMs: 200, upMs: 300 },

  execute({ bus, params }) {
    const targetMs = params.targetMs ?? this.defaults.targetMs;
    const downMs = params.downMs ?? this.defaults.downMs;
    const holdMs = params.holdMs ?? this.defaults.holdMs;
    const upMs = params.upMs ?? this.defaults.upMs;
    bus.throwEchoTime(targetMs, downMs, holdMs, upMs);
    return null;
  },
};
