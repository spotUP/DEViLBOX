/**
 * Resolve the JA Press vinyl-wear level the dub bus should actually apply.
 *
 * The vinyl chain is wired POST-MASTER in DubBus (`this.master -> vinylEffect
 * -> vinylOutputNode`), so none of the disable path's measures reach it: the
 * input gate closing, echo intensity and spring wet going to zero, and
 * `return_.gain` dropping all sit upstream of it. Left alone, the vinyl
 * colouring and its surface noise keep running after the bus is switched off.
 *
 * That is not merely wrong, it is unrecoverable from the UI: the JA slider is
 * `disabled={!busEnabled}`, so a user who disables the bus to stop the noise
 * has just locked the only control that would silence it.
 *
 * Invariant: disabling the bus silences everything the bus generates. The
 * user's chosen level is kept, not zeroed, so re-enabling restores it.
 */
export function resolveVinylLevel(enabled: boolean, desiredLevel10: number, spinning = true): number {
  if (!enabled) return 0;
  if (!spinning) return 0;
  return Math.max(0, Math.min(10, desiredLevel10));
}

/**
 * How long after the programme goes quiet the record keeps turning.
 *
 * Long enough that a breakdown, a drop or a bar of rests inside a running
 * performance does not stop the surface noise; short enough that a stopped
 * transport reads as a stopped record. A dub tail is not programme — it is
 * measured after the insert, and the record stops while it still rings.
 */
export const VINYL_SPIN_HOLD_MS = 2500;

/** Below this RMS the programme counts as silence for the record. About -60 dB. */
export const VINYL_PROGRAMME_FLOOR_RMS = 1e-3;

/**
 * Is the record turning?
 *
 * The vinyl chain sits post-master and makes its own surface noise, so
 * nothing upstream stops it: "the vinyl noise keep playing when i stop the
 * song" (2026-09-23). A stopped record makes no noise. The record turns
 * while the tracker transport runs, and for `holdMs` after programme was
 * last heard — the second clause is what keeps it turning for the DJ decks
 * and the pads, which have no tracker transport, and through silence
 * inside a running song.
 */
export function isRecordSpinning(
  transportPlaying: boolean,
  msSinceProgramme: number,
  holdMs = VINYL_SPIN_HOLD_MS,
): boolean {
  if (transportPlaying) return true;
  return Number.isFinite(msSinceProgramme) && msSinceProgramme >= 0 && msSinceProgramme < holdMs;
}
