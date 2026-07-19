/**
 * FT2 volume-column nibble editing — the single source of truth for how a typed
 * hex digit updates the packed volume byte.
 *
 * The volume column packs a command class in the high nibble (0x1x = set volume,
 * 0x6x = volume slide down, 0x7x = slide up, 0xAx = vibrato, ...) and a value in
 * the low nibble. FT2 edits each nibble independently: typing on the value
 * (low) nibble replaces ONLY that nibble and preserves the existing command
 * class — it never fabricates a set-volume command on an empty cell.
 *
 * Pure so it can be unit-tested without the input pipeline.
 */

/** Invalid set-volume params (0x51-0x5F) clamp down to 0x50 (max volume, 64). */
function clampSetVolume(value: number): number {
  return value >= 0x51 && value <= 0x5f ? 0x50 : value;
}

/** Apply a hex digit to the high (command-class) nibble, keeping the low nibble. */
export function applyVolumeHighNibble(currentValue: number, nibble: number): number {
  return clampSetVolume((nibble << 4) | (currentValue & 0x0f));
}

/**
 * Apply a hex digit to the low (value) nibble, keeping the high-nibble command.
 *
 * This is the M7 fix: the previous code special-cased `currentValue < 0x10` and
 * forced the byte to `0x10 + digit`, fabricating a set-volume command and
 * discarding whatever command class the user meant. FT2 replaces only the value
 * nibble.
 */
export function applyVolumeLowNibble(currentValue: number, nibble: number): number {
  return clampSetVolume((currentValue & 0xf0) | nibble);
}
