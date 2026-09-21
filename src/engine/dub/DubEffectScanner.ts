/**
 * DubEffectScanner — on every row tick, scan the current pattern's cells
 * for dub effect-command slots (effTyp 33/34/35) and fire them through the
 * normal DubRouter path. Runs AFTER DubLanePlayer, so lane events fire
 * before the same row's cell-level triggers — deterministic ordering.
 *
 * Scope: all eight effect columns. The replayer dispatches effTyp2..effTyp8
 * for ordinary effects, so a dub cell in any of them must fire too — scanning
 * only columns 1-2 made a visible Zxx cell silently do nothing (plan F2b).
 *
 * Row dedupe: the tick fires once per unique integer row. If the transport
 * floats and calls us twice for the same row (jitter, precision wobble),
 * we skip the second call. Monotonic-forward assumption holds because
 * `onRowAdvance` in useTransportStore only bumps `state.currentRow` when
 * the row changes.
 */

import { fireFromEffectCommand } from './DubRouter';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { isDubEffectTypeForDisplay } from './moveTable';

let _lastRowFired = -1;

/**
 * Which effTyp values this scanner dispatches.
 *
 * Deliberately the SAME range the display paths use: a cell that renders as
 * `Zxx` must also fire. This used to be a local `36..40` constant and was an
 * independent ceiling — declaring a slot pair without also editing this file
 * produced cells that drew correctly and silently never fired. Sourcing the
 * range from moveTable removes that failure mode.
 */
function isDubEffTyp(effTyp: number | undefined): boolean {
  if (effTyp === undefined) return false;
  return isDubEffectTypeForDisplay(effTyp);
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
      // All eight effect columns, in column order so firing is deterministic.
      //
      // Plan item F2b, decided on evidence 2026-09-18: this used to scan only
      // columns 1-2, documented as "slots 3-8 are Furnace import-only and never
      // dispatched by the replayer". That is not true — TrackerReplayer
      // dispatches effTyp2..effTyp8 (see its per-row effect loop), so a dub
      // move typed into column 3 rendered as Zxx, sat in a column the replayer
      // honours for every other effect, and silently never fired. Consistency
      // with the replayer is the rule; a visible cell must do something.
      for (const [eTyp, eVal] of [
        [cell.effTyp,  cell.eff],  [cell.effTyp2, cell.eff2],
        [cell.effTyp3, cell.eff3], [cell.effTyp4, cell.eff4],
        [cell.effTyp5, cell.eff5], [cell.effTyp6, cell.eff6],
        [cell.effTyp7, cell.eff7], [cell.effTyp8, cell.eff8],
      ] as const) {
        if (isDubEffTyp(eTyp)) fireFromEffectCommand(eTyp!, eVal ?? 0, ch);
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

/**
 * Scan dub effect-command cells on every row.
 *
 * Registered here for the same reason as the lane player: the transport's
 * `require()` call never ran, so `Z00` typed into a cell did nothing.
 * Lane events are registered first and hooks fire in insertion order, which
 * keeps the documented interleaving — lane events, then effect commands.
 */
import { registerRowHook } from '@/lib/dev/rowTickHooks';
registerRowHook('dubEffectScanner', (row) => scanDubEffectsForRow(row));
