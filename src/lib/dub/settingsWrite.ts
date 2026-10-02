/**
 * Does a dub bus settings write change anything?
 *
 * `DubBus._applySettings` drops writes that change nothing: the store→engine
 * mirror re-pushes the same settings dozens of times a second during a
 * crossfader sweep, and each would otherwise schedule a burst of ramps.
 *
 * "Changes nothing" has to be judged against what the engine is DOING, not
 * only against the desired-state mirror. `dubPanic()` mutes the engine
 * (`enabled = false`) without touching `settings.enabled`, so after a panic
 * the desired state says on while the engine is off. Compared against the
 * mirror alone, the write that turns it back on looks identical to the
 * mirror's own re-pushes and was dropped, leaving the bus dead behind a panel
 * that read ON (2026-10-02).
 *
 * `engineEnabled` is the caller's actual state. While a panic drain is running
 * the caller passes the desired value instead, so a mirror re-push cannot cut
 * the drain short; the drain timer re-converges the engine when it ends.
 */
import type { DubBusSettings } from '@/types/dub';

export function settingsWriteChangesBus(
  current: DubBusSettings,
  patch: Partial<DubBusSettings>,
  engineEnabled: boolean,
): boolean {
  for (const key of Object.keys(patch) as (keyof DubBusSettings)[]) {
    const now = key === 'enabled' ? engineEnabled : current[key];
    if (now !== patch[key]) return true;
  }
  return false;
}
