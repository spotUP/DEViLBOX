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
export function resolveVinylLevel(enabled: boolean, desiredLevel10: number): number {
  if (!enabled) return 0;
  return Math.max(0, Math.min(10, desiredLevel10));
}
