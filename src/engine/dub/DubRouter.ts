/**
 * DubRouter — the single entry point for firing dub moves.
 *
 * Every consumer (on-screen button click, keyboard handler, MIDI CC handler,
 * DubLanePlayer during pattern playback) calls `fire(moveId, channelId,
 * params, source)`. The router looks the move up in the registry, executes
 * it against the current DubBus, and publishes the fire event to
 * subscribers (DubRecorder subscribes to capture into the lane when armed).
 *
 * One code path = zero drift between live performance and recorded playback.
 * The REC indicator flashes, the UI highlights, and the audio fires through
 * exactly the same sequence regardless of who pulled the trigger.
 */

import { echoThrow } from './moves/echoThrow';
import { dubStab } from './moves/dubStab';
import { filterDrop } from './moves/filterDrop';
import { dubSiren } from './moves/dubSiren';
import { springSlam } from './moves/springSlam';
import type { DubMove, DubMoveContext } from './moves/_types';
import type { DubBus } from './DubBus';
import { useTransportStore } from '@/stores/useTransportStore';

const MOVES: Record<string, DubMove> = {
  echoThrow,
  dubStab,
  filterDrop,
  dubSiren,
  springSlam,
  // Future moves register here: channelMute, channelThrow, backwardReverb,
  // toast, tapeStop, tapeWobble, snareCrack, delayTimeThrow, masterDrop.
};

/**
 * What every subscriber sees when a move fires. `row` is the tracker's
 * row-level position at fire time, quantized by the caller if they wanted
 * grid placement. DubRecorder uses this as the stored `beat` on DubEvent.
 */
export interface DubFireEvent {
  moveId: string;
  channelId?: number;
  params: Record<string, number>;
  row: number;
  source: 'live' | 'lane';
}

type Subscriber = (event: DubFireEvent) => void;
const subscribers = new Set<Subscriber>();

let _bus: DubBus | null = null;

/** Set by the TrackerView mount effect. Null when no tracker view is active. */
export function setDubBusForRouter(bus: DubBus | null): void {
  _bus = bus;
}

/** Subscribe to fire events. Returns an unsubscribe fn. */
export function subscribeDubRouter(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * Fire a move. Returns the move's disposer (null for pure one-shots), so the
 * caller can cancel a held move on release or bail out on panic.
 *
 * No-op + warn if the move id is unknown or no DubBus has been registered.
 */
export function fire(
  moveId: string,
  channelId: number | undefined,
  params: Record<string, number> = {},
  source: 'live' | 'lane' = 'live',
): { dispose(): void } | null {
  const move = MOVES[moveId];
  if (!move) {
    console.warn(`[DubRouter] unknown moveId "${moveId}" — ignoring`);
    return null;
  }
  if (!_bus) {
    console.warn(`[DubRouter] no bus registered — "${moveId}" ignored (tracker view not mounted?)`);
    return null;
  }

  const merged = { ...move.defaults, ...params };
  const transport = useTransportStore.getState();
  const bpm = transport.bpm || 120;
  const row = transport.currentRow ?? 0;

  const ctx: DubMoveContext = { bus: _bus, channelId, params: merged, bpm, source };
  const disposer = move.execute(ctx);

  const event: DubFireEvent = { moveId, channelId, params: merged, row, source };
  for (const fn of subscribers) {
    try {
      fn(event);
    } catch (err) {
      console.warn('[DubRouter] subscriber failed:', err);
    }
  }

  return disposer;
}
