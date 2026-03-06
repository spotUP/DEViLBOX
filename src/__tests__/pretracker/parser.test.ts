/**
 * PreTrackerParser unit tests
 * Tests metadata extraction from PreTracker module files
 *
 * Phase 10: Minimal test suite for TrackerModule structure
 */

import { describe, it, expect } from 'vitest';
import { PreTrackerParser } from '../../lib/import/PreTrackerParser';

describe('PreTrackerParser', () => {
  it('should parse a minimal PreTracker buffer without throwing', () => {
    // Create a buffer that meets minimum size requirements
    const testData = new ArrayBuffer(1024);
    const module = PreTrackerParser.parse(testData);

    // Verify basic module structure
    expect(module.format).toBe('pretracker');
    expect(module.channels).toBe(4);
    expect(module.instruments.length).toBeGreaterThan(0);
  });

  it('should reject buffers that are too small', () => {
    const tooSmall = new ArrayBuffer(10);
    expect(() => PreTrackerParser.parse(tooSmall)).toThrow('too small');
  });
});
