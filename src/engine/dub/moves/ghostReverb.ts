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
 * Per-channel: when channelId given, ghosts that channel only.
 * Global (no channelId): ghosts ALL channels that have a non-zero send.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';

export const ghostReverb: DubMove = {
  id: 'ghostReverb',
  kind: 'hold',
  defaults: {},

  execute({ channelId }) {
    const store = useMixerStore.getState();

    if (channelId !== undefined) {
      // Per-channel: ghost only this channel
      const ch = store.channels[channelId];
      if (!ch) return null;
      const wasMuted = ch.muted;
      const priorDubSend = ch.dubSend;
      if (!wasMuted) store.setChannelMute(channelId, true);
      store.setChannelDubSend(channelId, 1.0);
      console.log(`[ghostReverb] MUTE ch${channelId} send→1.0 (wasMuted=${wasMuted} priorSend=${priorDubSend.toFixed(2)})`);
      return {
        dispose() {
          console.log(`[ghostReverb] RESTORE ch${channelId} send→${priorDubSend.toFixed(2)}`);
          try {
            const s = useMixerStore.getState();
            if (!wasMuted) s.setChannelMute(channelId, false);
            s.setChannelDubSend(channelId, priorDubSend);
          } catch (err) { console.error(`[ghostReverb] restore failed ch${channelId}:`, err); }
        },
      };
    }

    // Global: ghost all channels that already have a non-zero send
    const snapshots: Array<{ idx: number; wasMuted: boolean; priorSend: number }> = [];
    store.channels.forEach((ch, idx) => {
      if (!ch || (ch.dubSend ?? 0) === 0) return;
      snapshots.push({ idx, wasMuted: ch.muted, priorSend: ch.dubSend });
      if (!ch.muted) store.setChannelMute(idx, true);
      store.setChannelDubSend(idx, 1.0);
    });

    if (snapshots.length === 0) return null;
    console.log(`[ghostReverb] MUTE-ALL channels=${snapshots.map(s => s.idx).join(',')}`);

    return {
      dispose() {
        console.log(`[ghostReverb] RESTORE-ALL channels=${snapshots.map(s => s.idx).join(',')}`);
        try {
          const s = useMixerStore.getState();
          for (const { idx, wasMuted, priorSend } of snapshots) {
            if (!wasMuted) s.setChannelMute(idx, false);
            s.setChannelDubSend(idx, priorSend);
          }
        } catch (err) { console.error('[ghostReverb] restore-all failed:', err); }
      },
    };
  },
};
