/**
 * Who owns a stage value right now: the settings store, or a held move.
 *
 * A move that writes an AudioParam directly — rather than through
 * `setSettings` — leaves the settings mirror holding the value from BEFORE the
 * gesture. That is fine until anything runs an apply, because an apply
 * re-derives every stage from the merged settings rather than only from the
 * keys the incoming write actually mentioned. The mirror therefore wins, the
 * resting value is re-applied, and the move's effect is silently muted under a
 * performer's finger.
 *
 * This is not hypothetical: it is why Liquid (`combSweep`, which writes
 * `sweepOutput.gain` via `_setSweepAmount`) was reported inaudible while its
 * phaser branch carried 0.126 RMS. Any pad-grid settings push re-derived the
 * wet mix from the store's `sweepAmount: 0` and set `sweepOutput.gain` to 0.
 * Same shape as the Sub Harmonic Bed, whose setup line decayed its own gain to
 * zero a tenth of a second after starting.
 *
 * The rule is narrow on purpose: a held claim blocks settings from driving the
 * key REGARDLESS of whether the incoming write mentions it. Filtering the
 * claimed key out of the incoming patch is not sufficient, because the merged
 * settings fall back to `this.settings` — the stale resting value — and that
 * fallback is the actual source of the revert.
 */

/**
 * True when a live claim means the settings mirror must not drive `key`.
 *
 * `ownedKeys` is any iterable of claimed keys; passing the live map's entries
 * keeps the caller from having to materialise a Set on every apply.
 */
export function heldMoveBlocksSettingsDrive(ownedKeys: Iterable<string>, key: string): boolean {
  for (const owned of ownedKeys) {
    if (owned === key) return true;
  }
  return false;
}