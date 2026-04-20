/**
 * tapeStop — the bus-tail version of the classic reel-to-reel slowdown.
 *
 * Real tape-stop is a transport-level speed ramp (pitch drops with speed).
 * That requires per-engine coordination across libopenmpt / UADE / Hively /
 * Furnace and none of their worklets currently expose a smooth speed ramp,
 * so this move does a bus-only approximation that still reads as "dub
 * collapses into silence":
 *   - LPF sweeps down to 80 Hz (all high-end vanishes)
 *   - Echo rate ramps ×2.5 (tail slows and pitches down)
 *   - Return gain drops to 0 in the final 15% for a muffled disappearance
 * After the hold window everything snaps back to baseline.
 *
 * Global move, one-shot. A real transport tape-stop can come in a later
 * phase alongside a cross-engine speed abstraction.
 */

import type { DubMove } from './_types';

export const tapeStop: DubMove = {
  id: 'tapeStop',
  kind: 'trigger',
  defaults: { downSec: 0.6, holdSec: 0.15 },

  execute({ bus, params }) {
    const downSec = params.downSec ?? this.defaults.downSec;
    const holdSec = params.holdSec ?? this.defaults.holdSec;
    console.log(`[tapeStop] fired downSec=${downSec} holdSec=${holdSec} (bus-only — dry mix unaffected)`);
    bus.tapeStop(downSec, holdSec);
    return null;
  },
};
