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
import { useAutomationStore } from '@/stores/useAutomationStore';
import type { DubEvent } from '@/types/dub';
import { encodeDubEffect } from './moveTable';
import { DUB_MOVE_KINDS } from '@/midi/performance/parameterRouter';

/** Min spacing between a trigger's rise and fall point — enough for the
 *  router's 0.5-crossing edge detector to see the transition on the next
 *  tick without the fall overwriting the rise at fractional-row identity. */
const TRIGGER_SPIKE_WIDTH_ROWS = 0.05;

/**
 * Param key for a dub move on the automation store. Per-channel moves use
 * `dub.<moveId>.ch<N>` (matches `parseDubMoveParam` in the router); global
 * moves drop the suffix.
 */
function paramKeyForMove(moveId: string, channelId?: number): string {
  return channelId === undefined ? `dub.${moveId}` : `dub.${moveId}.ch${channelId}`;
}

/**
 * Ensure a global-scope automation curve exists for this param and return
 * its id. Creates a new curve at `channelIndex = -1` if one doesn't exist.
 */
function ensureGlobalCurve(patternId: string, paramKey: string): string {
  const store = useAutomationStore.getState();
  const existing = store.getGlobalCurves(patternId).find(c => c.parameter === paramKey);
  if (existing) return existing.id;
  return store.addGlobalCurve(patternId, paramKey);
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Invocation → { eventId, patternIdx, fireRow, curveId } for pending-release
 *  pairing. Patterns can change between fire and release if the user jumps
 *  patterns mid-hold, so we remember which pattern owns the event. `curveId`
 *  is set when the fire wrote an automation curve rise-point that needs a
 *  matching fall-point on release. */
const pendingHolds = new Map<string, {
  eventId: string;
  patternIdx: number;
  fireRow: number;
  curveId?: string;
  patternId?: string;
}>();

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

      // Also write a Zxx effect-command cell for per-channel TRIGGER moves
      // so they're visible inline in the pattern editor. The encoder picks
      // the right effTyp slot based on move-index range (0-15 → slot 37,
      // 16-31 → slot 40) so every move in DUB_MOVE_TABLE can be captured
      // inline, not just the first 16. Conditions:
      //   - Move has a channel (per-channel encoding)
      //   - Kind is 'trigger' (holds need duration — fall through to
      //     dubLane / Global FX automation curve)
      //   - Target row + channel are valid for the current pattern
      // DUB_MOVE_KINDS occasionally unresolved under test-env module
      // initialization (circular-import adjacent): guard with `?.` so a
      // missing kind falls through to dubLane-only without crashing.
      const moveKind = DUB_MOVE_KINDS?.[fireEvent.moveId];
      const cellRow = Math.floor(fireEvent.row);
      if (
        fireEvent.channelId !== undefined
        && moveKind === 'trigger'
        && cellRow >= 0 && cellRow < pattern.length
        && fireEvent.channelId >= 0 && fireEvent.channelId < pattern.channels.length
      ) {
        const encoded = encodeDubEffect(fireEvent.moveId, fireEvent.channelId);
        if (encoded) {
          tracker.setCell(fireEvent.channelId, cellRow, {
            effTyp: encoded.effTyp,
            eff: encoded.eff,
          });
        }
      }

      // Automation-curve writes for cases the cell path doesn't cover:
      //   - Global moves (no channelId) — no cell target, goes on the
      //     Global FX lane as a curve point.
      //   - Hold moves (any channel scope) — cells can't express release
      //     timing, so holds always land on a curve regardless of channel.
      // For a trigger we write a 0→1 spike (rise point + fall point ~0.05
      // rows later) so the router's edge detector sees it exactly once.
      // For a hold we write only the rise point; the release subscriber
      // below adds the fall point at the actual release row.
      const needsCurve = moveKind
        && (fireEvent.channelId === undefined || moveKind === 'hold');
      let curveId: string | undefined;
      if (needsCurve && moveKind) {
        try {
          const paramKey = paramKeyForMove(fireEvent.moveId, fireEvent.channelId);
          curveId = ensureGlobalCurve(pattern.id, paramKey);
          const store = useAutomationStore.getState();
          store.addPoint(curveId, fireEvent.row, 1);
          if (moveKind === 'trigger') {
            store.addPoint(curveId, fireEvent.row + TRIGGER_SPIKE_WIDTH_ROWS, 0);
          }
        } catch (err) {
          console.warn('[DubRecorder] curve write failed:', err);
          curveId = undefined;
        }
      }

      // Record the pairing so a later release can stamp durationRows on
      // the dubLane event AND the automation curve's fall point. If no
      // release ever arrives (trigger), the entry just sits in the map
      // until the next `startDubRecorder` lifecycle prunes it — bounded
      // by live-move count so no real leak.
      pendingHolds.set(fireEvent.invocationId, {
        eventId,
        patternIdx,
        fireRow: fireEvent.row,
        curveId,
        patternId: pattern.id,
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
      if (!pattern) return;

      // Dub-lane durationRows update (legacy back-compat path).
      if (pattern.dubLane) {
        const existing = pattern.dubLane;
        const idx = existing.events.findIndex(e => e.id === pending.eventId);
        if (idx >= 0) {
          const updated = { ...existing.events[idx], durationRows: safeDuration };
          const events = existing.events.slice();
          events[idx] = updated;
          tracker.setPatternDubLane(pending.patternIdx, { ...existing, events });
        }
      }

      // Automation-curve fall point — if the fire wrote a rise point for
      // a hold, drop the matching 1→0 at the release row. The router's
      // edge detector sees a downward 0.5-crossing and calls the move's
      // disposer on the next replay pass.
      if (pending.curveId) {
        try {
          useAutomationStore.getState().addPoint(pending.curveId, releaseEvent.row, 0);
        } catch (err) {
          console.warn('[DubRecorder] curve release write failed:', err);
        }
      }
    });
  });

  return () => {
    unsubFire();
    unsubRelease();
    pendingHolds.clear();
  };
}
