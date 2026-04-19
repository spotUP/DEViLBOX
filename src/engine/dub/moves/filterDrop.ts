/**
 * filterDrop — sweep the bus LPF from open down to a target frequency, hold
 * while the caller keeps the move alive, then sweep back open on release.
 *
 * Thin wrapper over DubBus.filterDrop() — exposes the underlying method
 * as a router-firable move so it shows up in the recorder lane, MIDI CC
 * bindings, and the on-screen dub button row. Global move (channelId
 * ignored).
 */

import type { DubMove } from './_types';

export const filterDrop: DubMove = {
  id: 'filterDrop',
  kind: 'hold',
  defaults: { targetHz: 220, downSec: 0.4, upSec: 0.6 },

  execute({ bus, params }) {
    const targetHz = params.targetHz ?? this.defaults.targetHz;
    const downSec = params.downSec ?? this.defaults.downSec;
    const upSec = params.upSec ?? this.defaults.upSec;

    const release = bus.filterDrop(targetHz, downSec, upSec);
    return { dispose: release };
  },
};
