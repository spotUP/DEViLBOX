// src/lib/tracker/followScroll.ts
/**
 * Minimal horizontal scroll offset that keeps a channel fully visible.
 *
 * All coordinates are in channel-content scroll space: 0 means the first
 * channel sits flush against the left edge of the scrollable area (i.e. just
 * right of the fixed line-number gutter).
 *
 * Used to make the tracker's horizontal scrollbar follow the cursor when Tab
 * (or an arrow key) moves the cursor to a channel that is currently off-screen.
 * The returned value is the new `scrollLeft`, clamped to `[0, maxScroll]`.
 * When the channel already fits inside the viewport the current `scrollLeft`
 * is returned unchanged, so callers can skip the write when nothing moves.
 *
 * @param channelLeft  Channel's left edge in scroll space.
 * @param channelWidth Channel's width in pixels.
 * @param scrollLeft   Current horizontal scroll offset.
 * @param viewWidth    Visible width of the channel area (container minus gutter).
 * @param maxScroll    Maximum scroll offset (content width minus viewport).
 */
export function computeChannelFollowScroll(
  channelLeft: number,
  channelWidth: number,
  scrollLeft: number,
  viewWidth: number,
  maxScroll: number,
): number {
  const channelRight = channelLeft + channelWidth;
  const viewRight = scrollLeft + viewWidth;

  let next = scrollLeft;
  if (channelLeft < scrollLeft) {
    // Channel starts left of the viewport — reveal its left edge.
    next = channelLeft;
  } else if (channelRight > viewRight) {
    // Channel ends right of the viewport — reveal its right edge. If the
    // channel is wider than the viewport this still lands its right edge in
    // view, which is where a rightward Tab puts the cursor.
    next = channelRight - viewWidth;
  }

  return Math.max(0, Math.min(maxScroll, next));
}
