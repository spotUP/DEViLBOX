/**
 * DubRecorder — subscribes to DubRouter fires + releases, writes events to
 * the current pattern's dubLane when useDubStore.armed.
 *
 * Pure observer: never blocks the audio path. All store writes are
 * rAF-batched via scheduleDubStoreSync so rapid-fire performing doesn't
 * stampede zustand updates. Events are inserted sorted by row so
 * DubLanePlayer can advance a cursor in O(1)/tick.
 *
 * Held moves: DubRouter emits a DubReleaseEvent with a matching
 * invocationId when the move's disposer fires. We track pending
 * invocations → event id, and on release compute
 * `durationRows = releaseRow − fireRow` and stamp it on the stored event.
 * Lane editor then renders the event as a proper rectangle.
 *
 * Live events only — lane-replayed events (source='lane') are skipped so
 * armed overdub doesn't re-capture its own playback into an infinite loop.
 */

import { subscribeDubRouter, subscribeDubRelease } from './DubRouter';
import { useDubStore, scheduleDubStoreSync } from '@/stores/useDubStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import type { DubEvent } from '@/types/dub';

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Invocation → { eventId, patternIdx, fireRow } for pending-release pairing.
 *  Patterns can change between fire and release if the user jumps patterns
 *  mid-hold, so we remember which pattern owns the event. */
const pendingHolds = new Map<string, { eventId: string; patternIdx: number; fireRow: number }>();

/**
 * Start the recorder. Subscribes to DubRouter fires + releases for the
 * lifetime of the tracker view; returns a composite unsubscribe.
 */
export function startDubRecorder(): () => void {
  const unsubFire = subscribeDubRouter((fireEvent) => {
    if (fireEvent.source !== 'live') return;   // don't re-record lane playback
    if (!useDubStore.getState().armed) return;

    const eventId = uuid();
    const event: DubEvent = {
      id: eventId,
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
      const events = existing.events.slice();
      let i = 0;
      while (i < events.length && events[i].row <= event.row) i++;
      events.splice(i, 0, event);

      tracker.setPatternDubLane(patternIdx, { ...existing, events });
      useDubStore.getState().markCaptured();

      // Record the pairing so a later release can stamp durationRows on
      // this exact event. We don't know here whether the move is trigger-
      // or hold-kind — if no release ever arrives (trigger), the entry
      // just sits in the map until the next `startDubRecorder` lifecycle
      // prunes it. Bounded by live-move count so no real leak.
      pendingHolds.set(fireEvent.invocationId, {
        eventId,
        patternIdx,
        fireRow: fireEvent.row,
      });
    });
  });

  const unsubRelease = subscribeDubRelease((releaseEvent) => {
    if (releaseEvent.source !== 'live') return;
    const pending = pendingHolds.get(releaseEvent.invocationId);
    if (!pending) return;
    pendingHolds.delete(releaseEvent.invocationId);

    const durationRows = Math.max(0.01, releaseEvent.row - pending.fireRow);
    // Pattern wraps around (loop or user seek) → releaseRow < fireRow. Fall
    // back to a minimum-visible duration in that case; the lane editor can
    // still render it and the user can drag-resize to correct.
    const safeDuration = durationRows > 0 ? durationRows : 0.5;

    scheduleDubStoreSync(() => {
      const tracker = useTrackerStore.getState();
      const pattern = tracker.patterns[pending.patternIdx];
      if (!pattern || !pattern.dubLane) return;
      const existing = pattern.dubLane;
      const idx = existing.events.findIndex(e => e.id === pending.eventId);
      if (idx < 0) return;  // user already deleted it
      const updated = { ...existing.events[idx], durationRows: safeDuration };
      const events = existing.events.slice();
      events[idx] = updated;
      tracker.setPatternDubLane(pending.patternIdx, { ...existing, events });
    });
  });

  return () => {
    unsubFire();
    unsubRelease();
    pendingHolds.clear();
  };
}
