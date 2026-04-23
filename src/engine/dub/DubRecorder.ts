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
import { useUIStore } from '@/stores/useUIStore';
import type { DubEvent, DubLane } from '@/types/dub';
import { encodeDubEffect } from './moveTable';
import { DUB_MOVE_KINDS } from '@/midi/performance/parameterRouter';
import { currentSongIsTimeBasedLane } from './laneMode';

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
  /** Set only for time-mode lanes — release handler computes durationSec
   *  from (releaseTimeSec - fireTimeSec) instead of rows. */
  fireTimeSec?: number;
  curveId?: string;
  patternId?: string;
}>();

/**
 * Start the recorder. Subscribes to DubRouter fires + releases for the
 * lifetime of the tracker view; returns a composite unsubscribe.
 */
export function startDubRecorder(): () => void {
  const unsubFire = subscribeDubRouter((fireEvent) => {
    if (fireEvent.source !== 'live') {
      // Lane-replayed fire — skip (would loop forever if we re-captured it)
      return;
    }
    if (!useDubStore.getState().armed) {
      // Recorder not armed. Log once per fire so the user can see Auto Dub
      // is firing but capture is off. Noisy in prod — keep only while
      // diagnosing the "nothing appears in pattern editor" report.
      console.log(`[DubRecorder] skip (not armed) — ${fireEvent.moveId} ch${fireEvent.channelId ?? 'G'}`);
      return;
    }

    const eventId = uuid();
    const isTimeMode = currentSongIsTimeBasedLane();
    const event: DubEvent = {
      id: eventId,
      moveId: fireEvent.moveId,
      channelId: fireEvent.channelId,
      row: isTimeMode ? 0 : fireEvent.row,
      ...(isTimeMode ? { timeSec: fireEvent.timeSec } : {}),
      params: { ...fireEvent.params },
    };

    scheduleDubStoreSync(() => {
      const tracker = useTrackerStore.getState();
      const patternIdx = tracker.currentPatternIndex;
      const pattern = tracker.patterns[patternIdx];
      if (!pattern) return;

      // Row-mode lanes keep the existing baseline {enabled:true, events:[]}.
      // Time-mode lanes tag themselves with kind='time' so the player and UI
      // know to switch scheduling/rendering. Existing row-mode lanes never
      // grow a `kind` field (absence = 'row' via back-compat default).
      const defaultLane: DubLane = isTimeMode
        ? { enabled: true, events: [], kind: 'time' }
        : { enabled: true, events: [] };
      const existing: DubLane = pattern.dubLane ?? defaultLane;
      // If a previous session left a row-mode lane in place on a song that's
      // now time-mode (user loaded a raw SID), promote it rather than silently
      // treating new time-events as row-events. Preserves any prior events by
      // attaching timeSec=row*(60/bpm) heuristic? No — safer to leave row
      // events alone; the recorder only writes new events.
      const promoted: DubLane = (isTimeMode && existing.kind !== 'time')
        ? { ...existing, kind: 'time' }
        : existing;
      const events = promoted.events.slice();
      if (isTimeMode) {
        // Insert sorted by timeSec (falls back to row=0 so comparator is stable)
        const t = event.timeSec ?? 0;
        let i = 0;
        while (i < events.length && (events[i].timeSec ?? 0) <= t) i++;
        events.splice(i, 0, event);
      } else {
        let i = 0;
        while (i < events.length && events[i].row <= event.row) i++;
        events.splice(i, 0, event);
      }

      tracker.setPatternDubLane(patternIdx, { ...promoted, events });
      useDubStore.getState().markCaptured();

      // Time-mode lanes skip all the pattern-cell + automation-curve writes —
      // raw SIDs / SC68 have no structured pattern data to mirror the event
      // into, and no automation lanes exist for formats without rows.
      if (isTimeMode) {
        pendingHolds.set(fireEvent.invocationId, {
          eventId,
          patternIdx,
          fireRow: 0,
          fireTimeSec: fireEvent.timeSec,
          curveId: undefined,
          patternId: pattern.id,
        });
        return;
      }

      // ── Row-mode path (unchanged behavior) ──────────────────────────────
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
      const canWriteCell =
        fireEvent.channelId !== undefined
        && moveKind === 'trigger'
        && cellRow >= 0 && cellRow < pattern.length
        && fireEvent.channelId >= 0 && fireEvent.channelId < pattern.channels.length;
      if (canWriteCell) {
        const chId = fireEvent.channelId as number; // canWriteCell proved != undefined
        const encoded = encodeDubEffect(fireEvent.moveId, chId);
        if (encoded) {
          console.log(
            `[DubRecorder] cell ← ${fireEvent.moveId} ch${chId} row${cellRow} `
            + `(effTyp=${encoded.effTyp} eff=0x${encoded.eff.toString(16).padStart(2, '0')} `
            + `patIdx=${patternIdx})`,
          );
          tracker.setCell(chId, cellRow, {
            effTyp: encoded.effTyp,
            eff: encoded.eff,
          });
        } else {
          console.warn(`[DubRecorder] encodeDubEffect returned null for ${fireEvent.moveId}`);
        }
      } else {
        // Log why we skipped — this is the critical diagnostic.
        const reasons: string[] = [];
        if (fireEvent.channelId === undefined) reasons.push('no channelId (global move)');
        if (moveKind !== 'trigger') reasons.push(`kind=${moveKind ?? 'undefined'}`);
        if (cellRow < 0 || cellRow >= pattern.length) reasons.push(`row ${cellRow} out of 0..${pattern.length}`);
        if (fireEvent.channelId !== undefined && (fireEvent.channelId < 0 || fireEvent.channelId >= pattern.channels.length)) {
          reasons.push(`ch ${fireEvent.channelId} out of 0..${pattern.channels.length}`);
        }
        console.log(
          `[DubRecorder] skip-cell ${fireEvent.moveId} ch${fireEvent.channelId ?? 'G'} row${cellRow} — ${reasons.join(', ')}`,
        );
      }

      // Write automation curve for ALL move types so automation lanes
      // show a visual representation of dub activity. Previously only
      // global and hold moves created curves; per-channel triggers were
      // cell-only and invisible in the automation lanes overlay.
      const needsCurve = moveKind !== undefined;
      let curveId: string | undefined;
      if (needsCurve && moveKind) {
        const paramKey = paramKeyForMove(fireEvent.moveId, fireEvent.channelId);
        curveId = ensureGlobalCurve(pattern.id, paramKey);
        const autoStore = useAutomationStore.getState();
        autoStore.addPoint(curveId, fireEvent.row, 1);
        if (moveKind === 'trigger') {
          autoStore.addPoint(curveId, fireEvent.row + TRIGGER_SPIKE_WIDTH_ROWS, 0);
        }
        // Auto-show automation lanes so recorded curves are immediately visible
        if (!useUIStore.getState().showAutomationLanes) {
          useUIStore.getState().toggleAutomationLanes();
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

    // Time-mode lanes compute durationSec from elapsed seconds.
    const isTimeMode = pending.fireTimeSec !== undefined;
    const durationRows = Math.max(0.01, releaseEvent.row - pending.fireRow);
    // Pattern wraps around (loop or user seek) → releaseRow < fireRow. Fall
    // back to a minimum-visible duration in that case; the lane editor can
    // still render it and the user can drag-resize to correct.
    const safeDurationRows = durationRows > 0 ? durationRows : 0.5;
    const durSec = isTimeMode
      ? Math.max(0.05, releaseEvent.timeSec - (pending.fireTimeSec ?? 0))
      : 0;

    scheduleDubStoreSync(() => {
      const tracker = useTrackerStore.getState();
      const pattern = tracker.patterns[pending.patternIdx];
      if (!pattern || !pattern.dubLane) return;
      const existing = pattern.dubLane;
      const idx = existing.events.findIndex(e => e.id === pending.eventId);
      if (idx < 0) return;  // user already deleted it
      const updated = isTimeMode
        ? { ...existing.events[idx], durationSec: durSec }
        : { ...existing.events[idx], durationRows: safeDurationRows };
      const events = existing.events.slice();
      events[idx] = updated;
      tracker.setPatternDubLane(pending.patternIdx, { ...existing, events });

      // Hold/global curves get a fall-to-0 at the release row. On replay,
      // AutomationPlayer sees the downward crossing and calls the move's
      // release path (routeParameterToEngine → disposer). Time-mode lanes
      // have no curveId (no automation plumbing), so this is a no-op there.
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
