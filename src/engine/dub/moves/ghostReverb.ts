/**
 * ghostReverb — the classic dub "pre-fader send" technique.
 *
 * While held: mutes the channel's dry output but cranks its dub send
 * to 100%. You hear ONLY the wet reverb/echo return, no dry signal.
 * Essential for spaced-out intros and drops — a drum hit becomes a
 * spectral echo ghost floating in space.
 *
 * The Dubroom tutorial (Messian Dread, Ch.14): "Set channel fader to
 * zero but send to reverb via pre-aux. You hear ONLY the wet reverb."
 *
 * On release, restores both the original mute state and dub send level.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';

export const ghostReverb: DubMove = {
  id: 'ghostReverb',
  kind: 'hold',
  defaults: {},

  execute({ channelId }) {
    if (channelId === undefined) return null;

    const store = useMixerStore.getState();
    const ch = store.channels[channelId];
    if (!ch) return null;

    // Snapshot current state
    const wasMuted = ch.muted;
    const priorDubSend = ch.dubSend;

    // Mute dry, crank wet
    if (!wasMuted) store.setChannelMute(channelId, true);
    store.setChannelDubSend(channelId, 1.0);

    return {
      dispose() {
        try {
          const s = useMixerStore.getState();
          if (!wasMuted) s.setChannelMute(channelId, false);
          s.setChannelDubSend(channelId, priorDubSend);
        } catch { /* ok */ }
      },
    };
  },
};
