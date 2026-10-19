/**
 * FT2/PT Tab navigation — the single source of truth for which channel Tab and
 * Shift+Tab jump to. Both directions land on the target channel's note column
 * and wrap at the ends. Neither direction is gated on the current column: taking
 * no column argument here structurally guarantees the FT2 symmetry (previously
 * Shift+Tab only moved channel when the cursor already sat on the note column,
 * while forward Tab always moved — an asymmetry).
 *
 * Tab moves between the channels the grid shows (visibleChannels.ts): a hidden
 * channel is skipped, never revealed. Revealing one changed the visible set and
 * with it the fit-all-channels scale, so the grid zoomed on every Tab (owner
 * 2026-10-20). Arrow-right off the last shown channel is the way to open one.
 *
 * Pure so it can be unit-tested without the keyboard pipeline.
 */
import { isChannelVisible } from './visibleChannels';

/**
 * Target channel index for a Tab (`shift=false`) or Shift+Tab (`shift=true`)
 * press, wrapping around the ends of the channel range and skipping the
 * channels `mask` hides. Without a mask every channel counts as shown.
 */
export function nextTabChannel(current: number, channelCount: number, shift: boolean, mask?: readonly boolean[]): number {
  if (channelCount <= 0) return 0;
  const dir = shift ? -1 : 1;
  for (let step = 1; step <= channelCount; step++) {
    const i = (((current + dir * step) % channelCount) + channelCount) % channelCount;
    if (isChannelVisible(mask, i)) return i;
  }
  return current;
}
