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
 *
 * Mute + send go through the transient helpers, never through the store
 * directly. Snapshotting the live store value here and writing it back on
 * release is what pinned sends at 1.0 and left channels muted after AutoDub
 * ran — by the time a global ghost fires, a per-channel throw has usually
 * already driven the same channel's store send to 1.0 via the cold-path
 * activation. See `src/lib/dub/channelSendBaseline.ts`.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';
import {
  beginDubTransient,
  setDubTransient,
  endDubTransient,
} from '@/lib/dub/dubChannelTransient';

export const ghostReverb: DubMove = {
  id: 'ghostReverb',
  kind: 'hold',
  defaults: {},

  execute({ channelId }) {
    const store = useMixerStore.getState();

    if (channelId !== undefined) {
      // Per-channel: ghost only this channel
      if (!store.channels[channelId]) return null;
      beginDubTransient(channelId);
      setDubTransient(channelId, { muted: true, dubSend: 1.0 });
      let released = false;
      return {
        dispose() {
          if (released) return;
          released = true;
          try {
            endDubTransient(channelId);
          } catch (err) { console.error(`[ghostReverb] restore failed ch${channelId}:`, err); }
        },
      };
    }

    // Global: ghost all channels that already have a non-zero send
    const ghosted: number[] = [];
    store.channels.forEach((ch, idx) => {
      if (!ch || (ch.dubSend ?? 0) === 0) return;
      ghosted.push(idx);
      beginDubTransient(idx);
      setDubTransient(idx, { muted: true, dubSend: 1.0 });
    });

    if (ghosted.length === 0) return null;

    let released = false;
    return {
      dispose() {
        if (released) return;
        released = true;
        try {
          for (const idx of ghosted) endDubTransient(idx);
        } catch (err) { console.error('[ghostReverb] restore-all failed:', err); }
      },
    };
  },
};
