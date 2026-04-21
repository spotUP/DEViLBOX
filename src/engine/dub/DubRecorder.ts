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

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Width of the 0→1→0 spike written to a curve for trigger-kind moves.
 *  AutomationPlayer's upward-edge detection then re-fires the move once
 *  per pass on replay. Small so the spike doesn't bleed into the next row. */
const TRIGGER_SPIKE_WIDTH_ROWS = 0.05;

function paramKeyForMove(moveId: string, channelId?: number): string {
  return channelId === undefined ? `dub.${moveId}` : `dub.${moveId}.ch${channelId}`;
}

/** Look up (or lazily create) the global-lane curve for a move's paramKey
 *  on this pattern. Global FX lane = channelIndex=-1 sentinel; addGlobalCurve
 *  wraps that so we don't need to know the sentinel here. */
function ensureGlobalCurve(patternId: string, paramKey: string): string {
  const store = useAutomationStore.getState();
  const existing = store.getGlobalCurves(patternId).find(c => c.parameter === paramKey);
  if (existing) return existing.id;
  return store.addGlobalCurve(patternId, paramKey as import('@/types/automation').AutomationParameter);
}

/** Invocation → pending-release bookkeeping. `curveId` is present when the
 *  fire also wrote an automation-curve point; the release handler uses it
 *  to stamp a fall-point so the lane replays the release correctly. */
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
      // so they're visible inline in the pattern editor, not just in the
      // dub-lane timeline. Conditions:
      //   - Move has a channel (per-channel slot encoding)
      //   - Kind is 'trigger' (holds need duration which a single cell
      //     can't express — those go to an automation curve below)
      //   - Move is encodable (index < 32; encode picks base/_X slot)
      //   - Target row + channel in range
      // DUB_MOVE_KINDS occasionally unresolved under test-env module
      // initialization (circular-import adjacent): optional-chain falls
      // through to curve/lane-only if missing.
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

      // Global moves (no channel) and hold-kind moves (any channel) → write
      // to an automation curve on the Global FX lane. A single cell can't
      // represent a hold's duration; global moves don't fit a channel
      // column. Curves are the canonical home for both.
      //
      // Encoding:
      //   - trigger (global): spike 0→1 at fireRow, fall to 0 a hair later.
      //     AutomationPlayer's upward-edge detection re-fires the move on
      //     replay via routeParameterToEngine → DubRouter.fire.
      //   - hold (global or per-channel): rise to 1 at fireRow; the release
      //     handler writes the fall-to-0 at releaseRow. Edge detection
      //     triggers fire on rise and release on fall.
      const needsCurve = moveKind !== undefined
        && (fireEvent.channelId === undefined || moveKind === 'hold');
      let curveId: string | undefined;
      if (needsCurve && moveKind) {
        const paramKey = paramKeyForMove(fireEvent.moveId, fireEvent.channelId);
        curveId = ensureGlobalCurve(pattern.id, paramKey);
        const autoStore = useAutomationStore.getState();
        autoStore.addPoint(curveId, fireEvent.row, 1);
        if (moveKind === 'trigger') {
          autoStore.addPoint(curveId, fireEvent.row + TRIGGER_SPIKE_WIDTH_ROWS, 0);
        }
      }

      // Record the pairing so a later release stamps durationRows on this
      // event and a fall-point on the curve. If no release arrives
      // (trigger), the entry sits until the next startDubRecorder lifecycle
      // prunes it — bounded by live-move count so no real leak.
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
      if (!pattern || !pattern.dubLane) return;
      const existing = pattern.dubLane;
      const idx = existing.events.findIndex(e => e.id === pending.eventId);
      if (idx < 0) return;  // user already deleted it
      const updated = { ...existing.events[idx], durationRows: safeDuration };
      const events = existing.events.slice();
      events[idx] = updated;
      tracker.setPatternDubLane(pending.patternIdx, { ...existing, events });

      // Hold/global curves get a fall-to-0 at the release row. On replay,
      // AutomationPlayer sees the downward crossing and calls the move's
      // release path (routeParameterToEngine → disposer).
      if (pending.curveId) {
        useAutomationStore.getState().addPoint(pending.curveId, releaseEvent.row, 0);
      }
    });
  });

  return () => {
    unsubFire();
    unsubRelease();
    pendingHolds.clear();
  };
}
