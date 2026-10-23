export const AUTOMATION_LANE_WIDTH = 56; // base width for a single automation lane
// Minimum per-lane width when multiple lanes share space.
// Set to ~LANE_WIDTH so each lane in a multi-lane channel gets its own full
// dedicated draw width instead of being squeezed into the single-lane area.
export const AUTOMATION_LANE_MIN = 52;

/**
 * Width a channel reserves at its right edge for automation lanes. Zero when the
 * channel has no lane in use, so unused channels sit tight; one lane gets the
 * base width, several share lanes * AUTOMATION_LANE_MIN. Single source for the
 * layout in usePatternEditor and PatternEditorCanvas (headers, meters, scopes,
 * worker renderer and hit-testing all read the resulting offsets/widths).
 */
export function automationLaneReserve(laneCount: number): number {
  if (laneCount <= 0) return 0;
  if (laneCount === 1) return AUTOMATION_LANE_WIDTH;
  return Math.max(AUTOMATION_LANE_WIDTH, laneCount * AUTOMATION_LANE_MIN + 4);
}
