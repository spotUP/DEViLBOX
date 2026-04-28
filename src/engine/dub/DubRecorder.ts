/**
 * DubRecorder — subscribes to DubRouter fires + releases, writes step
 * curves to useAutomationStore for every live dub move.
 *
 * Changed from original: no longer writes pattern.dubLane.events[].
 * Dub moves are now first-class automation curves:
 *   - parameter = 'dub.' + event.moveId
 *   - channelIndex = event.channelId ?? -1 (global for bus-wide moves)
 *   - mode = 'steps', interpolation = 'linear'
 *
 * Armed state no longer gates writing. DubDeckStrip's REC button now
 * calls clearDubCurvesForCurrentPattern() before a new take.
 *
 * Live events only — lane-replayed events (source='lane') are skipped so
 * replayed dub moves don't re-capture into an infinite loop.
 */

import { subscribeDubRouter, subscribeDubRelease } from './DubRouter';
import { scheduleDubStoreSync } from '@/stores/useDubStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useUIStore } from '@/stores/useUIStore';
import { DUB_MOVE_KINDS } from '@/midi/performance/parameterRouter';
import { encodeDubEffect } from './moveTable';
import { currentSongIsTimeBasedLane } from './laneMode';
import type { AutomationParameter } from '@/types/automation';

/** Width of the 0→1→0 spike written to a curve for trigger-kind moves.
 *  AutomationPlayer's upward-edge detection re-fires the move once per pass
 *  on replay. Small so the spike doesn't bleed into the next row. */
const TRIGGER_SPIKE_WIDTH_ROWS = 0.05;

/** Find or create an automation curve for (patternId, channelIndex, 'dub.moveId').
 *  Returns '' if addCurve triggers a format-violation dialog (deferred). */
function ensureDubCurve(patternId: string, channelIndex: number, moveId: string): string {
  const store = useAutomationStore.getState();
  const param = `dub.${moveId}` as AutomationParameter;
  const existing = store.getCurvesForPattern(patternId, channelIndex).find(c => c.parameter === param);
  if (existing) return existing.id;
  const id = store.addCurve(patternId, channelIndex, param);
  if (id) {
    store.updateCurve(id, { mode: 'steps' });
  }
  return id;
}

/** Invocation → pending-release bookkeeping. `curveId` is present when the
 *  fire also wrote an automation-curve point; the release handler uses it
 *  to stamp a fall-point so the lane replays the release correctly. */
const pendingHolds = new Map<string, {
  curveId?: string;
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

    const isTimeMode = currentSongIsTimeBasedLane();
    if (isTimeMode) return; // time-mode songs have no automation rows

    scheduleDubStoreSync(() => {
      const tracker = useTrackerStore.getState();
      const patternIdx = tracker.currentPatternIndex;
      const pattern = tracker.patterns[patternIdx];
      if (!pattern) return;

      // DUB_MOVE_KINDS occasionally unresolved under test-env module
      // initialization (circular-import adjacent): optional-chain falls
      // through to curve-only if missing.
      const moveKind = DUB_MOVE_KINDS?.[fireEvent.moveId];
      const channelIndex = fireEvent.channelId ?? -1;

      // Write cell effect commands so AutoDub fires are visible inline in
      // the pattern editor, not just in the automation lanes overlay.
      //
      // Coverage:
      //   - Per-channel TRIGGER  → cell on the firing channel (DUB_EFFECT_PERCHANNEL)
      //   - Global TRIGGER       → cell on channel 0 (DUB_EFFECT_GLOBAL). Channel 0
      //                             is the conventional "effects column anchor" —
      //                             the decoder is channel-agnostic for global
      //                             slots so this is purely visual placement.
      //
      // HOLD moves are intentionally skipped here. A cell-fired hold would leak
      // its disposer (DubEffectScanner discards the return value of fireFromEffectCommand),
      // so the move would never release on replay. The automation curve (written
      // below for ALL moves) handles the fire+release pair correctly via
      // AutomationPlayer's edge detection.
      //
      // Skipped:
      //   - moveKind === 'hold' (release tracking required)
      //   - Move not encodable in DUB_MOVE_TABLE (index ≥ 32)
      //   - Pattern row out of range
      const cellRow = Math.floor(fireEvent.row);
      const isGlobal = fireEvent.channelId === undefined;
      const targetChannel = isGlobal ? 0 : (fireEvent.channelId as number);
      const canWriteCell =
        moveKind === 'trigger'
        && cellRow >= 0 && cellRow < pattern.length
        && targetChannel >= 0 && targetChannel < pattern.channels.length;
      let cellWritten = false;
      if (canWriteCell) {
        const encoded = encodeDubEffect(fireEvent.moveId, isGlobal ? undefined : targetChannel);
        if (encoded) {
          tracker.setCell(targetChannel, cellRow, { effTyp: encoded.effTyp, eff: encoded.eff });
          cellWritten = true;
        }
      }

      // Write automation step curve for HOLD moves and any TRIGGER move that
      // didn't get a cell write (move not encodable, channel out of range,
      // etc.). Skipping the curve when a cell exists prevents double-fire on
      // replay — DubEffectScanner fires the cell, AutomationPlayer fires the
      // curve, both with source='lane' and no inter-path dedup. One source
      // of truth per row.
      if (moveKind !== undefined && !cellWritten) {
        const curveId = ensureDubCurve(pattern.id, channelIndex, fireEvent.moveId);
        if (curveId) {
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

        // Record the pairing so a later release stamps a fall-point on the curve.
        pendingHolds.set(fireEvent.invocationId, {
          curveId: curveId || undefined,
        });
      }
    });
  });

  const unsubRelease = subscribeDubRelease((releaseEvent) => {
    if (releaseEvent.source !== 'live') return;
    const pending = pendingHolds.get(releaseEvent.invocationId);
    if (!pending) return;
    pendingHolds.delete(releaseEvent.invocationId);

    // Hold/global curves get a fall-to-0 at the release row. On replay,
    // AutomationPlayer sees the downward crossing and calls the move's
    // release path (routeParameterToEngine → disposer).
    if (pending.curveId) {
      scheduleDubStoreSync(() => {
        useAutomationStore.getState().addPoint(pending.curveId!, releaseEvent.row, 0);
      });
    }
  });

  return () => {
    unsubFire();
    unsubRelease();
    pendingHolds.clear();
  };
}

/** Clear all dub.* automation curves for the current pattern.
 *  Called by DubDeckStrip's REC arm button to start a clean take. */
export function clearDubCurvesForCurrentPattern(): void {
  const tracker = useTrackerStore.getState();
  const pattern = tracker.patterns[tracker.currentPatternIndex];
  if (!pattern) return;
  const store = useAutomationStore.getState();
  const dubCurves = store.getCurves().filter(
    c => c.patternId === pattern.id && c.parameter.startsWith('dub.'),
  );
  dubCurves.forEach(c => store.removeCurve(c.id));
}
