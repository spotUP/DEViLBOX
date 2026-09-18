/**
 * channelMute — hold the target channel's main-mix audio to silence.
 *
 * Mechanic: while the move is held, the target channel is muted in the
 * mixer (audible mix goes dark for that channel). Release restores the
 * prior mute state. Classic "hole in the mix" move — punch out a hihat
 * for a bar, drop the bass on the breakdown, etc.
 *
 * Per-channel. Release hands the channel back to the user's own mute state,
 * so a channel the user had muted stays muted — and, when moves nest, only
 * the last one out restores. Reading the live mute here and writing it back
 * is what left channels muted after AutoDub ran; see
 * `src/lib/dub/channelSendBaseline.ts`.
 */

import type { DubMove } from './_types';
import {
  beginDubTransient,
  setDubTransient,
  endDubTransient,
} from '@/lib/dub/dubChannelTransient';

export const channelMute: DubMove = {
  id: 'channelMute',
  kind: 'hold',
  defaults: {},

  execute({ channelId }) {
    if (channelId === undefined) return null;

    beginDubTransient(channelId);
    setDubTransient(channelId, { muted: true });

    let released = false;
    return {
      dispose() {
        if (released) return;
        released = true;
        try { endDubTransient(channelId); }
        catch (err) { console.error(`[channelMute] restore failed ch${channelId}:`, err); }
      },
    };
  },
};
