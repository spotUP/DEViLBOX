/**
 * The one way a dub move changes a channel's send / mute state.
 *
 * Moves must never write `useMixerStore.channels[i].dubSend` or `.muted`
 * directly: the store value is what the user set, and a move only borrows it.
 * Every move (and the cold-path throw activation in `DubBus.openChannelTap`)
 * goes begin → set… → end, and the baseline registry decides what "end" means
 * when transients nest.
 *
 * See `channelSendBaseline.ts` for why this exists.
 */

import { useMixerStore } from '@/stores/useMixerStore';
import { dubSendBaselines } from './channelSendBaseline';

/** Open a transient on a channel, capturing the user's state if it is the first. */
export function beginDubTransient(channelId: number): void {
  const ch = useMixerStore.getState().channels[channelId];
  dubSendBaselines.begin(channelId, {
    dubSend: ch?.dubSend ?? 0,
    muted: ch?.muted ?? false,
  });
}

/** Apply a transient change. Never touches the baseline. */
export function setDubTransient(
  channelId: number,
  patch: { dubSend?: number; muted?: boolean },
): void {
  const store = useMixerStore.getState();
  if (patch.muted !== undefined) store.setChannelMute(channelId, patch.muted, { transient: true });
  if (patch.dubSend !== undefined) {
    store.setChannelDubSend(channelId, patch.dubSend, { transient: true });
  }
}

/**
 * Close a transient. Restores the user's send + mute when this was the last
 * one holding the channel; does nothing while another transient is still open
 * (that one restores when it closes).
 */
export function endDubTransient(channelId: number): void {
  const baseline = dubSendBaselines.end(channelId);
  if (!baseline) return;
  const store = useMixerStore.getState();
  store.setChannelMute(channelId, baseline.muted, { transient: true });
  store.setChannelDubSend(channelId, baseline.dubSend, { transient: true });
}

/**
 * Hand every held channel back to the user, whatever is holding it.
 *
 * Transport stop, AutoDub disable, panic. A gesture is a shape in time; after
 * a stop there is no time it belongs to, and a channel left muted or fully
 * sent outlives the performance that did it.
 */
export function releaseAllDubTransients(): number {
  const restored = dubSendBaselines.releaseAll();
  const store = useMixerStore.getState();
  for (const { channelId, baseline } of restored) {
    try {
      store.setChannelMute(channelId, baseline.muted, { transient: true });
      store.setChannelDubSend(channelId, baseline.dubSend, { transient: true });
    } catch (err) {
      console.error(`[dubTransient] release-all failed ch${channelId}:`, err);
    }
  }
  return restored.length;
}

/**
 * Close transients that have been open too long to be real.
 *
 * The failure this exists for is not hypothetical: on 2026-09-18 every channel
 * sat muted at the source with the song rendering silence, because the code
 * that would have closed the transients was gone. Cheap to run, and it only
 * ever acts on state that is already wrong.
 */
export function reapOrphanedDubTransients(): number {
  const reaped = dubSendBaselines.reapOrphans();
  if (reaped.length === 0) return 0;
  const store = useMixerStore.getState();
  for (const { channelId, baseline } of reaped) {
    console.warn(
      `[dubTransient] ch${channelId} was held for too long — restoring the user's state`,
    );
    try {
      store.setChannelMute(channelId, baseline.muted, { transient: true });
      store.setChannelDubSend(channelId, baseline.dubSend, { transient: true });
    } catch (err) {
      console.error(`[dubTransient] reap failed ch${channelId}:`, err);
    }
  }
  return reaped.length;
}
