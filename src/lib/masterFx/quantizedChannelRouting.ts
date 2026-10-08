/**
 * Master FX channel buttons, quantized.
 *
 * A click on a channel button (or ALL / NO DRUMS) moves an effect between the
 * whole mix and isolation slots, which rebuilds the chain. Done mid-beat that
 * is a click in the music, so with Quantize on (the default) the change waits
 * for the next BEAT of the playing song. Beat, not bar: it is the DJ decks'
 * default, and a bar is up to two seconds of apparent dead button.
 *
 * Reuses the Dub Deck's grid (`msToNextGridBoundary`, live row and speed from
 * the replayer) and its way of waiting (a setTimeout from that distance) -
 * there is no scheduler of its own here.
 *
 * The button shows the pick at once (`usePendingChannelRouting`); only the
 * routing waits. Further clicks before the boundary fold into the same wait.
 */
import { create } from 'zustand';
import type { EffectConfig } from '@typedefs/instrument';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useTransportStore } from '@stores/useTransportStore';
import { getCurrentRow, msToNextGridBoundary } from '@/engine/dub/dubGrid';

/** What a click asks for: the channels an effect processes, or a role that finds them. */
export interface ChannelRouting {
  selectedChannels: number[] | undefined;
  channelRole: EffectConfig['channelRole'];
}

interface PendingRoutingState {
  /** Picks waiting for their boundary, by effect id. */
  pending: Record<string, ChannelRouting>;
}

export const usePendingChannelRouting = create<PendingRoutingState>(() => ({ pending: {} }));

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function setPending(effectId: string, routing: ChannelRouting | null): void {
  usePendingChannelRouting.setState((s) => {
    const next = { ...s.pending };
    if (routing) next[effectId] = routing; else delete next[effectId];
    return { pending: next };
  });
}

/** Milliseconds a click waits now: 0 when Quantize is off, nothing plays, or the grid is unknown. */
export function channelRoutingWaitMs(): number {
  if (!useSettingsStore.getState().masterFxQuantize) return 0;
  const { isPlaying, bpm } = useTransportStore.getState();
  if (!isPlaying) return 0;
  return msToNextGridBoundary('beat', bpm || 120, getCurrentRow(), undefined, true);
}

/**
 * Ask for a routing. `apply` writes it to the store (and so to the audio);
 * it runs now or at the next beat.
 */
export function requestChannelRouting(
  effectId: string,
  routing: ChannelRouting,
  apply: (effectId: string, routing: ChannelRouting) => void,
): void {
  const waitMs = channelRoutingWaitMs();
  if (waitMs <= 0) {
    const t = timers.get(effectId);
    if (t !== undefined) { clearTimeout(t); timers.delete(effectId); }
    setPending(effectId, null);
    apply(effectId, routing);
    return;
  }
  setPending(effectId, routing);
  if (timers.has(effectId)) return; // the latest pick rides the wait already running
  timers.set(effectId, setTimeout(() => {
    timers.delete(effectId);
    const latest = usePendingChannelRouting.getState().pending[effectId];
    setPending(effectId, null);
    if (latest) apply(effectId, latest);
  }, waitMs));
}
