/**
 * Temporary dub-bus settings for a measurement, applied without persisting.
 *
 * `measure_dub_bus_stages` probes the bus with settings the performer did not
 * choose (`{ returnGain: 0.85 }` to see what a closed return is hiding, a
 * different echo engine to compare levels). It used to write them through
 * `setDubBus`, which persists the whole voicing to localStorage on every call:
 * every probe was saved, and a reload between applying and restoring stranded
 * the probe on disk as the user's own settings. That is how a session ended
 * up with the return at zero, the echo dry and a 40 ms rate — a dead bus that
 * reloaded dead every time after.
 *
 * A probe belongs to the probe. It goes to the ENGINE and nowhere else:
 *
 *   - `claimSettingKeys` first, because `_applySettings` drops keys a move (or
 *     a probe) owns, which is what stops the store→engine mirror in
 *     `DubDeckStrip` from reverting the override mid-measurement.
 *   - `enabled` is claimed too, for the same reason: the mirror would push the
 *     store's `enabled: false` straight back over the probe's.
 *   - The store is never written, so the only thing a reload can lose is the
 *     measurement that was running.
 *
 * The claim is dropped for the probe's own write and taken straight back, which
 * is the idiom every move that owns settings uses (`bassEmphasis` is the
 * reference). Restoring drops it and does not take it back.
 */

/** The slice of `DubBus` a probe needs — narrower than the class, so a test can
 *  stand one in without an AudioContext. */
export interface EphemeralDubSettingsTarget {
  setSettings(settings: Record<string, unknown>): void;
  claimSettingKeys(keys: readonly string[]): () => void;
}

/**
 * Apply `override` to the bus for the duration of a measurement.
 *
 * Follows the write idiom `bassEmphasis` uses: hold the claim so the mirror
 * cannot push the store's values over the probe, drop it for the write itself
 * (a claimed key is DROPPED on write — see `_applySettings`), then take it
 * back. The window in between is synchronous, so no mirror push can land in it.
 *
 * @param bus     the live dub bus
 * @param saved   the settings to put back when the returned function is called
 * @param override the probe's settings; `enabled` is forced on, because a
 *                 silent bus has nothing to measure
 * @returns a restore function, safe to call more than once
 */
export function applyEphemeralDubSettings(
  bus: EphemeralDubSettingsTarget,
  saved: Record<string, unknown>,
  override: Record<string, unknown>,
): () => void {
  const keys = [...Object.keys(override), 'enabled'];
  let unclaim = bus.claimSettingKeys(keys);
  const write = (patch: Record<string, unknown>): void => {
    unclaim();
    bus.setSettings(patch);
    unclaim = bus.claimSettingKeys(keys);
  };

  write({ ...saved, ...override, enabled: true });

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    unclaim();
    bus.setSettings(saved);
  };
}
