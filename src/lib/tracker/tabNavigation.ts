/**
 * FT2/PT Tab navigation — the single source of truth for which channel Tab and
 * Shift+Tab jump to. Both directions land on the target channel's note column
 * and wrap at the ends. Neither direction is gated on the current column: taking
 * no column argument here structurally guarantees the FT2 symmetry (previously
 * Shift+Tab only moved channel when the cursor already sat on the note column,
 * while forward Tab always moved — an asymmetry).
 *
 * Pure so it can be unit-tested without the keyboard pipeline.
 */

/**
 * Target channel index for a Tab (`shift=false`) or Shift+Tab (`shift=true`)
 * press, wrapping around the ends of the channel range.
 */
export function nextTabChannel(current: number, channelCount: number, shift: boolean): number {
  if (channelCount <= 0) return 0;
  if (shift) {
    return current > 0 ? current - 1 : channelCount - 1;
  }
  return current < channelCount - 1 ? current + 1 : 0;
}
