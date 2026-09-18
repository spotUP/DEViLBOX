/**
 * filterDrop — sweep the bus LPF from open down to a target frequency, hold
 * while the caller keeps the move alive, then sweep back open on release.
 * Per-channel variant (channelId passed): solos that channel's dub tap
 * while held so the LPF sweep only affects that channel's audio on the
 * bus; others continue dry through the main mix.
 *
 * It also accepts a new `targetHz` mid-flight (Gate F4). That is what lets a
 * gesture trace a `ramp` or `sweep` across a hold whose length the player is
 * still deciding: the move owns what a frequency does to the sound, the
 * gesture owns how the hand moves, and neither has to know the other's shape.
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
      update(next: Record<string, number>) {
        if (next.targetHz === undefined) return;
        // Glide over one shape tick, so consecutive values join up into a
        // continuous sweep instead of forty discrete steps.
        bus.setLpfCutoffNow(next.targetHz, 0.025);
      },
      dispose() {
        try { releaseFilter(); } catch { /* ok */ }
        if (releaseSolo) { try { releaseSolo(); } catch { /* ok */ } }
      },
    };
  },
};
