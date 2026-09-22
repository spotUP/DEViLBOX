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
import { subscribeChannelSend } from '@/lib/dub/channelSendStream';
import { scheduleDubStoreSync } from '@/stores/useDubStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useUIStore } from '@/stores/useUIStore';
import { DUB_MOVE_KINDS } from '@/midi/performance/parameterRouter';
import { encodeDubEffect } from './moveTable';
import { currentSongIsTimeBasedLane } from './laneMode';
import type { AutomationParameter } from '@/types/automation';

/** Songs whose pattern editor renders from a native data structure rather
 *  than `pattern.channels[ch].rows[row]` — Zxx cells written to the standard
 *  store are never displayed for these. Force curve-only output so AutoDub
 *  fires still appear visually (in the per-channel automation lanes / global
 *  lane) even when the cell column is dark. */
function songRendersFromNativeData(): boolean {
  try {
    const fmt = useFormatStore.getState();
    return !!(
      fmt.hivelyNative
      || fmt.musiclineFileData
      || fmt.tfmxFileData
    );
  } catch {
    return false;
  }
}

/**
 * The parameter a fader ride is recorded as.
 *
 * Named like a move (`dub.<something>`) so it lands in the same lane, replays
 * through the same dispatch, and saves in the same curves. The channel it
 * belongs to lives in the curve's `channelIndex`, exactly as a per-channel
 * move's does.
 */
const CHANNEL_SEND_PARAM = 'channelSend';

/**
 * How much the fader must move before a point is written.
 *
 * A ride arrives at roughly 60 writes a second. Recording every one produces
 * thousands of points describing a curve that three would describe as well,
 * and a lane nobody can edit afterwards. A hundredth of the fader's travel is
 * below what anyone can hear as a step.
 */
const SEND_POINT_EPSILON = 0.01;

/**
 * Rows between forced points during a slow ride.
 *
 * Without this, a fader creeping across a bar writes nothing until it has
 * moved a whole hundredth, and the curve between two distant points is a
 * straight line that did not happen. An eighth of a row is fine enough that
 * the line never strays from the gesture.
 */
const SEND_POINT_MAX_ROW_GAP = 0.125;

/** Width of the 0→1→0 spike written to a curve for trigger-kind moves.
 *  AutomationPlayer's upward-edge detection re-fires the move once per pass
 *  on replay. Small so the spike doesn't bleed into the next row. */
const TRIGGER_SPIKE_WIDTH_ROWS = 0.05;

/** Last point written per channel, so a ride is thinned rather than transcribed. */
const lastSendPoint = new Map<number, { row: number; value: number }>();

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

    // AutoDub's own output is not a performance to capture.
    //
    // The recorder is always on, and it recorded anything tagged `live` —
    // which includes `origin: 'ai'`, AutoDub performing. On a song whose
    // editor renders from native data (AHX, MusicLine, GTUltra, TFMX) a cell
    // cannot be written, so capture falls to the automation CURVE path and
    // writes a point at the row being played. `AutomationPlayer` then reads
    // that same row on the same pass and fires it again with `source: 'lane'`.
    //
    // Measured 2026-09-22 on jennipha.ahx — every AutoDub move doubled:
    //
    //     [DubRouter] echoThrow ch0 source=live origin=ai
    //     [DubRouter] echoThrow ch0 source=lane origin=lane
    //
    // Two consequences. Every gesture landed twice, which is the "one big
    // reverb wash". And a HOLD fired twice but released once left an instance
    // running with nothing to close it — a held `transportTapeStop` kept the
    // song in slow motion after the user let go, and `combSweep` left a comb
    // filter self-oscillating.
    //
    // The existing `source !== 'live'` guard closed the lane -> record -> lane
    // loop. This closes the ai -> record -> lane one, which the same reasoning
    // always demanded. Recording exists to capture what the USER played; a
    // deliberate capture of an AutoDub take would need an explicit arm, not
    // silent rewriting of the song with automation nobody asked for.
    if (fireEvent.origin === 'ai') return;

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
      //   - Per-channel TRIGGER  → cell on the firing channel
      //                             (DUB_EFFECT_PERCHANNEL/_X). Cell IS the
      //                             source of truth — curve is skipped to
      //                             prevent double-fire.
      //   - Per-channel HOLD     → curve only (channelIndex = firing channel).
      //                             Cell-fired holds leak their disposer
      //                             (DubEffectScanner drops the return value
      //                             of fireFromEffectCommand) so the move
      //                             would never release on replay.
      //   - Global (any kind)    → curve on the GLOBAL lane (channelIndex=-1).
      //                             Bus-wide moves don't belong on a specific
      //                             channel; the global lane is the right
      //                             home, matching where continuous bus
      //                             params (echoWet, hpfCutoff) already live.
      //
      // Skipped:
      //   - Move not encodable in DUB_MOVE_TABLE (index ≥ 32) — cell write
      //     simply no-ops; curve still goes to global / per-channel lane.
      //   - Pattern row out of range
      const cellRow = Math.floor(fireEvent.row);
      const isGlobal = fireEvent.channelId === undefined;
      const canWriteCell =
        moveKind === 'trigger'
        && !isGlobal
        && cellRow >= 0 && cellRow < pattern.length
        && (fireEvent.channelId as number) >= 0
        && (fireEvent.channelId as number) < pattern.channels.length
        // Skip cells when the pattern editor doesn't render from
        // pattern.channels (Hively/AHX, MusicLine, GTUltra, TFMX) — the
        // cell would be invisible. Curve-only output makes AutoDub fires
        // show up in the per-channel automation lane instead.
        && !songRendersFromNativeData();
      let cellWritten = false;
      if (canWriteCell) {
        const chId = fireEvent.channelId as number;
        const encoded = encodeDubEffect(fireEvent.moveId, chId);
        if (encoded) {
          tracker.setCell(chId, cellRow, { effTyp: encoded.effTyp, eff: encoded.eff });
          cellWritten = true;
        }
      }

      // Write automation step curve when no cell was written. For triggers
      // this only happens for globals (curve on -1 = global lane) or moves
      // not encodable; for holds it's the always-on path. Skipping the curve
      // when a cell exists prevents double-fire on replay — DubEffectScanner
      // fires the cell, AutomationPlayer fires the curve, both with
      // source='lane' and no inter-path dedup.
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

  /**
   * X5 — the fader ride.
   *
   * Discrete moves recorded fine and a continuous send ride captured nothing,
   * because nothing published the writes. Now the mixer store does, and this
   * is a third subscription alongside fire and release rather than a second
   * recording mechanism bolted next to them.
   *
   * Riding the send is a dub gesture in its own right — arguably the primary
   * one — so a take without it is half a performance, and the M1
   * replay-reproduces check could only ever agree with the half that existed.
   */
  const unsubSend = subscribeChannelSend((write) => {
    if (write.source !== 'live') return;          // playback, not a hand
    if (currentSongIsTimeBasedLane()) return;     // no automation rows to write on
    if (write.channelId < 0) return;

    const previous = lastSendPoint.get(write.channelId);
    if (previous) {
      const moved = Math.abs(write.value - previous.value);
      const waited = write.row - previous.row;
      // Thin the stream, but never let a slow ride become a straight line
      // between two far-apart points.
      if (moved < SEND_POINT_EPSILON && waited < SEND_POINT_MAX_ROW_GAP) return;
      // A backwards row means the song looped or the user seeked; the gap
      // rule cannot reason across that, so take the point.
    }
    lastSendPoint.set(write.channelId, { row: write.row, value: write.value });

    scheduleDubStoreSync(() => {
      const tracker = useTrackerStore.getState();
      const pattern = tracker.patterns[tracker.currentPatternIndex];
      if (!pattern) return;
      const curveId = ensureSendCurve(pattern.id, write.channelId);
      if (!curveId) return;
      useAutomationStore.getState().addPoint(curveId, write.row, write.value);
      if (!useUIStore.getState().showAutomationLanes) {
        useUIStore.getState().toggleAutomationLanes();
      }
    });
  });

  return () => {
    unsubFire();
    unsubRelease();
    unsubSend();
    pendingHolds.clear();
    lastSendPoint.clear();
  };
}

/**
 * The send curve for a channel.
 *
 * A `curve` with linear interpolation, rather than the `steps` mode the moves
 * use: a fader ride is a continuous movement, and stepping between the thinned
 * points would replay a smooth gesture as a staircase.
 */
function ensureSendCurve(patternId: string, channelIndex: number): string {
  const store = useAutomationStore.getState();
  const param = `dub.${CHANNEL_SEND_PARAM}` as AutomationParameter;
  const existing = store.getCurvesForPattern(patternId, channelIndex)
    .find(c => c.parameter === param);
  if (existing) return existing.id;
  const id = store.addCurve(patternId, channelIndex, param);
  if (id) store.updateCurve(id, { mode: 'curve', interpolation: 'linear' });
  return id;
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
