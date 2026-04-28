/**
 * tapeStop — press-and-hold HOLD move.
 *
 * While held: LPF sweeps down to 100 Hz and return gain drops to 0 so the
 * bus goes silent (the bus-audio "tape stop" — dry signal continues in the
 * main mix). On release: LPF and return gain ramp back to baseline.
 *
 * The transport keeps playing throughout — only the dub bus return is muted.
 * A full pitch-and-speed tape-stop needs per-engine speed ramp support and
 * lives separately as transportTapeStop.
 */

import type { DubMove } from './_types';

export const tapeStop: DubMove = {
  id: 'tapeStop',
  kind: 'hold',
  defaults: { downSec: 0.4 },

  execute({ bus, params }) {
    const downSec = (params.downSec as number | undefined) ?? (this.defaults.downSec as number);
    console.log(`[tapeStop] MUTE bus return (downSec=${downSec})`);
    const restore = bus.startTapeHold(downSec);
    return {
      dispose() {
        console.log('[tapeStop] RESTORE bus return');
        restore();
      },
    };
  },
};
