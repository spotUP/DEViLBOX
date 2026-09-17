/**
 * dubGrid — where are we on the musical grid, and when is the next boundary?
 *
 * Two things live here that were previously private to DubRouter or duplicated
 * in DubActions:
 *
 *   1. Resolving the current fractional row across every playback engine.
 *   2. Snapping a moment to the next beat subdivision.
 *
 * Why this matters for dub: a throw has a short capture window — the default
 * is half a beat, 250 ms at 120 BPM. Hand-timing that against offbeat stabs is
 * luck, so a press that lands slightly early or late captures silence and the
 * gesture appears to do nothing. `throwQuantize` exists to fix exactly that,
 * but it was only ever consumed by the DJ deck path in DubActions; tracker
 * channel throws fired immediately regardless of the setting.
 *
 * The deck path snaps against a deck's analysed beat grid. Tracker playback
 * has something more direct — the row counter — so the two resolve position
 * differently and agree on the answer.
 */

import { useTransportStore } from '@/stores/useTransportStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { getTrackerReplayer } from '@/engine/TrackerReplayer';
import type { DubBusSettings } from '@/types/dub';
import * as Tone from 'tone';

/** Tracker convention: 4 rows per beat at the default speed of 6 ticks/row.
 *  Rows per beat is really `24 / ticksPerRow`; deriving it from live speed is
 *  tracked separately (the MusicalClock work) and would change bar maths
 *  everywhere, so this stays at the convention until that lands. */
export const ROWS_PER_BEAT = 4;

/**
 * Current fractional row position, tried in order of authority:
 *
 *   1. The active replayer's audio-synced state — correct for libopenmpt,
 *      UADE, Hively and Furnace, where the transport store is not driven.
 *      Interpolates within the row so the result is fractional, not stepped.
 *   2. `useWasmPositionStore` — WASM engines (Hively/AHX, JamCracker,
 *      PreTracker) push position from their worklet and never touch the
 *      transport store. Without this every fire reports row 0.
 *   3. `useTransportStore` — Tone.js-only sessions.
 */
export function getCurrentRow(): number {
  try {
    const replayer = getTrackerReplayer();
    if (replayer) {
      const state = replayer.getStateAtTime(Tone.now(), true /* peek */);
      if (state && typeof state.row === 'number') {
        const duration = state.duration;
        if (duration > 0) {
          const progress = Math.min(Math.max((Tone.now() - state.time) / duration, 0), 1);
          return state.row + progress;
        }
        return state.row;
      }
    }
  } catch { /* replayer not ready */ }

  try {
    const wasm = useWasmPositionStore.getState();
    if (wasm.active && typeof wasm.row === 'number') return wasm.row;
  } catch { /* store not ready */ }

  return useTransportStore.getState().currentRow ?? 0;
}

/**
 * Milliseconds until the next `quantize` boundary, measured from the live row
 * position. Returns 0 when quantization is off, when the grid cannot be
 * resolved, or when we are already close enough that waiting would feel like
 * a dropped press — the caller then fires immediately rather than eating it.
 *
 * Boundaries, expressed as a position within the beat:
 *   '1/16'    every quarter-beat  — tight grid
 *   '1/8'     the next half-beat
 *   'offbeat' the next "&" between beats (the King Tubby placement: the hit
 *             lands off the beat so its echoes fill the onbeats)
 *   'bar'     the next downbeat only, for the largest gestures
 */
export function msToNextGridBoundary(
  quantize: DubBusSettings['throwQuantize'],
  bpm: number,
  rowNow: number = getCurrentRow(),
): number {
  if (quantize === 'off') return 0;
  if (!Number.isFinite(rowNow) || !Number.isFinite(bpm)) return 0;

  const beatMs = 60000 / Math.max(30, Math.min(300, bpm || 120));
  const beatPos = rowNow / ROWS_PER_BEAT;

  let beatsAway: number;
  if (quantize === 'bar') {
    const barPos = beatPos / 4;              // 4/4 until MusicalClock lands
    beatsAway = (Math.floor(barPos) + 1 - barPos) * 4;
  } else {
    const phase = beatPos - Math.floor(beatPos);
    const targets =
      quantize === '1/16' ? [0.25, 0.5, 0.75, 1]
      : quantize === '1/8' ? [0.5, 1]
      : /* 'offbeat' */      [0.5, 1];
    const next = targets.find((t) => t > phase + 1e-6) ?? 1;
    beatsAway = next - phase;
  }

  // Interval between boundaries, so "how late am I" can be judged against it.
  const intervalBeats =
    quantize === 'bar' ? 4
    : quantize === '1/16' ? 0.25
    : 0.5;

  // Snap to the NEAREST boundary, not the next one.
  //
  // Forward-only snapping makes the control feel broken: press a few
  // milliseconds AFTER a boundary and you wait almost a full interval for the
  // following one. At 'offbeat' that is most of a beat of apparent input lag,
  // and it is worst precisely when the player was closest to in time.
  //
  // So if the boundary we just passed is nearer than the one ahead, fire now —
  // the press was late, and a late hit played immediately still lands inside
  // the capture window. Only genuinely early presses wait.
  const beatsSincePrev = intervalBeats - beatsAway;
  if (beatsSincePrev < beatsAway) return 0;

  const ms = beatsAway * beatMs;
  return ms < 4 ? 0 : ms;
}
