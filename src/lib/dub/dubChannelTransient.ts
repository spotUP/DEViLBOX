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
  // The restore above is a transient write, so it re-marks the mute as ours.
  // It is not: it hands the user's own state back. Without this, a channel the
  // user had muted before the move would be reported stranded and unmuted by
  // the watchdog — a repair that breaks the thing it is guarding.
  dubSendBaselines.clearMoveMute(channelId);
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
      dubSendBaselines.clearMoveMute(channelId);
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
      dubSendBaselines.clearMoveMute(channelId);
    } catch (err) {
      console.error(`[dubTransient] reap failed ch${channelId}:`, err);
    }
  }
  return reaped.length;
}

/**
 * Channels a move muted that nothing is holding any more.
 *
 * The rescue paths above both walk OPEN transients, so a mute that escaped its
 * transient is invisible to them — which is how the song came back muted with
 * only effects firing, and nothing in the registry able to say why. This is
 * the missing report, and it reads the live store so it cannot itself go
 * stale.
 */
export function strandedDubMutes(): number[] {
  const channels = useMixerStore.getState().channels;
  return dubSendBaselines.strandedMoveMutes((id) => channels[id]?.muted === true);
}

/**
 * Hand every stranded mute back to the user.
 *
 * A mute with no transient behind it has no owner and no end, so unmuting is
 * the only state that can be right. Returns the channels it freed so a caller
 * can say what happened rather than silently repairing.
 */
export function releaseStrandedDubMutes(): number[] {
  const stranded = strandedDubMutes();
  if (stranded.length === 0) return [];
  const store = useMixerStore.getState();
  for (const channelId of stranded) {
    console.warn(
      `[dubTransient] ch${channelId} was left muted by a move with nothing holding it — unmuting`,
    );
    try {
      store.setChannelMute(channelId, false, { transient: true });
    } catch (err) {
      console.error(`[dubTransient] stranded-mute release failed ch${channelId}:`, err);
    }
    dubSendBaselines.clearMoveMute(channelId);
  }
  return stranded;
}
