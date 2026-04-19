/**
 * DubRecorder — subscribes to DubRouter fires, writes events to the current
 * pattern's dubLane when useDubStore.armed.
 *
 * Pure observer: never blocks the audio path. All store writes are
 * rAF-batched via scheduleDubStoreSync so rapid-fire performing doesn't
 * stampede zustand updates. Events are inserted sorted by row so
 * DubLanePlayer can advance a cursor in O(1)/tick.
 *
 * Live events only — lane-replayed events (source='lane') are skipped so
 * armed overdub doesn't re-capture its own playback into an infinite loop.
 */

import { subscribeDubRouter } from './DubRouter';
import { useDubStore, scheduleDubStoreSync } from '@/stores/useDubStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import type { DubEvent } from '@/types/dub';

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Start the recorder. Subscribes to DubRouter for the lifetime of the
 * tracker view; returns an unsubscribe for cleanup on unmount.
 */
export function startDubRecorder(): () => void {
  return subscribeDubRouter((fireEvent) => {
    if (fireEvent.source !== 'live') return;   // don't re-record lane playback
    if (!useDubStore.getState().armed) return;

    const event: DubEvent = {
      id: uuid(),
      moveId: fireEvent.moveId,
      channelId: fireEvent.channelId,
      row: fireEvent.row,
      params: { ...fireEvent.params },
    };

    scheduleDubStoreSync(() => {
      const tracker = useTrackerStore.getState();
      const patternIdx = tracker.currentPatternIndex;
      const pattern = tracker.patterns[patternIdx];
      if (!pattern) return;

      const existing = pattern.dubLane ?? { enabled: true, events: [] };
      // Insert-sorted by row. Linear scan is fine — typical pattern has
      // O(10) events; binary search is cosmetic overhead here.
      const events = existing.events.slice();
      let i = 0;
      while (i < events.length && events[i].row <= event.row) i++;
      events.splice(i, 0, event);

      tracker.setPatternDubLane(patternIdx, { ...existing, events });
      useDubStore.getState().markCaptured();
    });
  });
}
