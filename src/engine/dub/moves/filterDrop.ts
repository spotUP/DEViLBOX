/**
 * filterDrop — sweep the bus LPF from open down to a target frequency, hold
 * while the caller keeps the move alive, then sweep back open on release.
 * Per-channel variant (channelId passed): solos that channel's dub tap
 * while held so the LPF sweep only affects that channel's audio on the
 * bus; others continue dry through the main mix.
 */

import type { DubMove } from './_types';

export const filterDrop: DubMove = {
  id: 'filterDrop',
  kind: 'hold',
  defaults: { targetHz: 220, downSec: 0.4, upSec: 0.6 },

  execute({ bus, channelId, params }) {
    const targetHz = params.targetHz ?? this.defaults.targetHz;
    const downSec = params.downSec ?? this.defaults.downSec;
    const upSec = params.upSec ?? this.defaults.upSec;

    const releaseFilter = bus.filterDrop(targetHz, downSec, upSec);
    const releaseSolo = channelId !== undefined
      ? bus.soloChannelTap(channelId, 0.005)
      : null;

    return {
      dispose() {
        try { releaseFilter(); } catch { /* ok */ }
        if (releaseSolo) { try { releaseSolo(); } catch { /* ok */ } }
      },
    };
  },
};
