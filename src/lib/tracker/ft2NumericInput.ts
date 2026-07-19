/**
 * FT2 toolbar numeric-field parsing — the single source of truth for turning a
 * typed string (BPM, speed, octave, etc.) into a committed value.
 *
 * FastTracker II lets you click a numeric toolbar field and type a value
 * directly instead of only nudging it with the up/down arrows. The commit rule
 * is shared by the input's Enter/blur handlers, so it lives here as a pure
 * function that can be unit-tested without a DOM.
 */

export type FT2NumericFormat = 'decimal' | 'hex';

/**
 * Parse a raw typed string into a clamped numeric value.
 *
 * Returns `null` when the string is empty or contains any character invalid for
 * the format (so the caller can reject the edit and keep the previous value).
 * A valid number is clamped into [min, max].
 */
export function parseFT2NumericInput(
  raw: string,
  format: FT2NumericFormat,
  min: number,
  max: number,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const pattern = format === 'hex' ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/;
  if (!pattern.test(trimmed)) return null;

  const parsed = parseInt(trimmed, format === 'hex' ? 16 : 10);
  if (Number.isNaN(parsed)) return null;

  return Math.max(min, Math.min(max, parsed));
}
