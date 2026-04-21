/**
 * DubEffectScanner — on every row tick, scan the current pattern's cells
 * for dub effect-command slots (effTyp 33/34/35) and fire them through the
 * normal DubRouter path. Runs AFTER DubLanePlayer, so lane events fire
 * before the same row's cell-level triggers — deterministic ordering.
 *
 * Scope: primary effect columns only (`effTyp`, `effTyp2`). Slots 3-8 are
 * Furnace import-only and never dispatched by the replayer today — if we
 * ever wire them, add here.
 *
 * Row dedupe: the tick fires once per unique integer row. If the transport
 * floats and calls us twice for the same row (jitter, precision wobble),
 * we skip the second call. Monotonic-forward assumption holds because
 * `onRowAdvance` in useTransportStore only bumps `state.currentRow` when
 * the row changes.
 */

import { fireFromEffectCommand } from './DubRouter';
import { useTrackerStore } from '@/stores/useTrackerStore';

const DUB_EFFECT_MIN = 33;
const DUB_EFFECT_MAX = 35;

let _lastRowFired = -1;

function isDubEffTyp(effTyp: number | undefined): boolean {
  if (effTyp === undefined) return false;
  return effTyp >= DUB_EFFECT_MIN && effTyp <= DUB_EFFECT_MAX;
}

/**
 * Scan the currently-playing pattern at `row` for dub effect commands
 * and fire each through `DubRouter.fireFromEffectCommand`. Safe to call
 * when no song loaded — degrades to a no-op.
 */
export function scanDubEffectsForRow(row: number): void {
  if (row === _lastRowFired) return;
  _lastRowFired = row;

  try {
    const trackerState = useTrackerStore.getState();
    const patIdx = trackerState.currentPatternIndex ?? 0;
    const pattern = trackerState.patterns[patIdx];
    if (!pattern || !pattern.channels) return;

    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const cell = pattern.channels[ch].rows[row];
      if (!cell) continue;
      // Primary slot
      if (isDubEffTyp(cell.effTyp)) {
        fireFromEffectCommand(cell.effTyp, cell.eff ?? 0, ch);
      }
      // Secondary slot — classic trackers support two effect columns
      if (isDubEffTyp(cell.effTyp2)) {
        fireFromEffectCommand(cell.effTyp2!, cell.eff2 ?? 0, ch);
      }
    }
  } catch {
    // Tracker store not ready — swallow and retry next tick.
  }
}

/** Reset row-dedupe state on transport stop/seek. */
export function resetDubEffectScanner(): void {
  _lastRowFired = -1;
}
