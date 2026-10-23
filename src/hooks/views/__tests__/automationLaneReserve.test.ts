import { describe, it, expect } from 'vitest';
import { automationLaneReserve, AUTOMATION_LANE_WIDTH, AUTOMATION_LANE_MIN } from '../automationLaneReserve';

describe('automationLaneReserve', () => {
  it('collapses to zero for a channel with no lane in use', () => {
    expect(automationLaneReserve(0)).toBe(0);
  });
  it('returns the base width for one lane', () => {
    expect(automationLaneReserve(1)).toBe(AUTOMATION_LANE_WIDTH);
  });
  it('grows with the lane count', () => {
    expect(automationLaneReserve(3)).toBe(Math.max(AUTOMATION_LANE_WIDTH, 3 * AUTOMATION_LANE_MIN + 4));
  });
});
