/**
 * PreTrackerParser unit tests
 * Tests metadata extraction from PreTracker module files
 *
 * Phase 10: Minimal test suite for TrackerModule structure
 */

import { describe, it, expect } from 'vitest';
import { PreTrackerParser } from '../../lib/import/PreTrackerParser';

describe('PreTrackerParser', () => {
  it('should parse a valid PreTracker file', () => {
    // Create minimal test data
    const testData = new ArrayBuffer(1024);
    const module = PreTrackerParser.parse(testData);

    // Verify spec compliance
    expect(module.format).toBe('pretracker');
    expect(module.channels).toBe(4);
    expect(module.instruments.length).toBeGreaterThan(0);
  });
});
