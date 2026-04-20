/**
 * echoBuildUp — canonical offbeat-guitar dub gesture: slowly open a
 * channel's dub send over 2 bars so echoes accumulate, then mute the
 * dry source so only the echoes carry. Research quote: "slowly open
 * the aux send over 2 bars letting echoes accumulate until they start
 * to overcrowd; then mute the offbeat track and the delays fade."
 *
 * Per-channel trigger. Owns its own timeline — after build + mute +
 * post-mute settle, it restores the original send and mute state.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';

export const echoBuildUp: DubMove = {
  id: 'echoBuildUp',
  kind: 'trigger',
  defaults: { buildSec: 3.2, muteSec: 2.5 },

  execute({ channelId, params, bpm }) {
    if (channelId === undefined) return null;
    const buildSec = params.buildSec ?? (60 / Math.max(30, bpm)) * 8;  // ~2 bars
    const muteSec = params.muteSec ?? (60 / Math.max(30, bpm)) * 8;

    const store = useMixerStore.getState();
    const priorSend = store.channels[channelId]?.dubSend ?? 0;
    const priorMute = store.channels[channelId]?.muted ?? false;

    // Ramp send from current to 1.0 over buildSec via stepped setTimeouts.
    const steps = 24;
    const stepMs = (buildSec * 1000) / steps;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    for (let i = 1; i <= steps; i++) {
      const v = priorSend + (1.0 - priorSend) * (i / steps);
      timers.push(setTimeout(() => {
        useMixerStore.getState().setChannelDubSend(channelId, v);
      }, stepMs * i));
    }
    // At buildup peak: mute the dry, let the echo tail carry.
    timers.push(setTimeout(() => {
      if (!priorMute) useMixerStore.getState().setChannelMute(channelId, true);
    }, buildSec * 1000));
    // After muteSec: unmute + restore send.
    timers.push(setTimeout(() => {
      if (!priorMute) useMixerStore.getState().setChannelMute(channelId, false);
      useMixerStore.getState().setChannelDubSend(channelId, priorSend);
    }, (buildSec + muteSec) * 1000));

    return {
      dispose() {
        for (const t of timers) clearTimeout(t);
        if (!priorMute) useMixerStore.getState().setChannelMute(channelId, false);
        useMixerStore.getState().setChannelDubSend(channelId, priorSend);
      },
    };
  },
};
