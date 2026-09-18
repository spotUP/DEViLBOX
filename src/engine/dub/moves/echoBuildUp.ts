/**
 * echoBuildUp — canonical offbeat-guitar dub gesture: slowly open a
 * channel's dub send over 2 bars so echoes accumulate, then mute the
 * dry source so only the echoes carry. Research quote: "slowly open
 * the aux send over 2 bars letting echoes accumulate until they start
 * to overcrowd; then mute the offbeat track and the delays fade."
 *
 * Per-channel trigger. Owns its own timeline — after build + mute +
 * post-mute settle, the transient closes and the channel returns to the
 * user's send and mute.
 *
 * The whole ramp is ONE transient: it opens at fire and closes once, whether
 * the timeline finished or a dispose cut it short. Restoring from a value
 * sampled at fire time is what ratcheted sends upward when moves overlapped —
 * see `src/lib/dub/channelSendBaseline.ts`.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';
import {
  beginDubTransient,
  setDubTransient,
  endDubTransient,
} from '@/lib/dub/dubChannelTransient';

export const echoBuildUp: DubMove = {
  id: 'echoBuildUp',
  kind: 'trigger',
  defaults: { buildSec: 3.2, muteSec: 2.5 },

  execute({ channelId, params, bpm }) {
    if (channelId === undefined) return null;
    const buildSec = params.buildSec ?? (60 / Math.max(30, bpm)) * 8;  // ~2 bars
    const muteSec = params.muteSec ?? (60 / Math.max(30, bpm)) * 8;

    const startSend = useMixerStore.getState().channels[channelId]?.dubSend ?? 0;
    beginDubTransient(channelId);

    // Ramp send from current to 1.0 over buildSec via stepped setTimeouts.
    const steps = 24;
    const stepMs = (buildSec * 1000) / steps;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      for (const t of timers) clearTimeout(t);
      endDubTransient(channelId);
    };

    for (let i = 1; i <= steps; i++) {
      const v = startSend + (1.0 - startSend) * (i / steps);
      timers.push(setTimeout(() => {
        if (closed) return;
        setDubTransient(channelId, { dubSend: v });
      }, stepMs * i));
    }
    // At buildup peak: mute the dry, let the echo tail carry.
    timers.push(setTimeout(() => {
      if (closed) return;
      setDubTransient(channelId, { muted: true });
    }, buildSec * 1000));
    // After muteSec: hand the channel back to the user's send and mute.
    timers.push(setTimeout(close, (buildSec + muteSec) * 1000));

    return { dispose: close };
  },
};
