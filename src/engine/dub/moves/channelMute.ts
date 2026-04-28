/**
 * channelMute — hold the target channel's main-mix audio to silence.
 *
 * Mechanic: while the move is held, the target channel is muted in the
 * mixer (audible mix goes dark for that channel). Release restores the
 * prior mute state. Classic "hole in the mix" move — punch out a hihat
 * for a bar, drop the bass on the breakdown, etc.
 *
 * Per-channel. If the channel was already muted before the move fired,
 * the release won't un-mute it (we save the original state).
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';

export const channelMute: DubMove = {
  id: 'channelMute',
  kind: 'hold',
  defaults: {},

  execute({ channelId }) {
    if (channelId === undefined) return null;

    const store = useMixerStore.getState();
    const wasMuted = store.channels[channelId]?.muted ?? false;
    if (!wasMuted) store.setChannelMute(channelId, true);

    return {
      dispose() {
        if (!wasMuted) {
          try { useMixerStore.getState().setChannelMute(channelId, false); }
          catch (err) { console.error(`[channelMute] restore failed ch${channelId}:`, err); }
        }
      },
    };
  },
};
