import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clonePattern } from '../clonePattern';
import { useTrackerStore } from '@stores/useTrackerStore';

// Mock stores
vi.mock('@stores/useTrackerStore');

describe('clonePattern command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deep clones current pattern', () => {
    const mockPattern = {
      name: 'Pattern 1',
      length: 64,
      channels: [
        { rows: [{ note: 49, instrument: 1, volume: 64, effTyp: 0, eff: 0 }] }
      ]
    };

    const mockAddPattern = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({
      patterns: [mockPattern],
      currentPatternIndex: 0,
      addPattern: mockAddPattern,
    }));

    clonePattern();

    expect(mockAddPattern).toHaveBeenCalledTimes(1);

    // Verify it's a deep clone (not the same reference)
    const clonedPattern = mockAddPattern.mock.calls[0][0];
    expect(clonedPattern).not.toBe(mockPattern);
    expect(clonedPattern.name).toBe('Pattern 1 (copy)');
    expect(clonedPattern.length).toBe(64);
  });

  it('increments copy number for multiple clones', () => {
    const mockPattern = {
      name: 'Pattern 1',
      length: 64,
      channels: []
    };

    const existingPatterns = [
      mockPattern,
      { ...mockPattern, name: 'Pattern 1 (copy)' },
      { ...mockPattern, name: 'Pattern 1 (copy 2)' },
    ];

    const mockAddPattern = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({
      patterns: existingPatterns,
      currentPatternIndex: 0,
      addPattern: mockAddPattern,
    }));

    clonePattern();

    const clonedPattern = mockAddPattern.mock.calls[0][0];
    expect(clonedPattern.name).toBe('Pattern 1 (copy 3)');
  });

  it('returns true when successful', () => {
    const mockPattern = {
      name: 'Test',
      length: 32,
      channels: []
    };

    (useTrackerStore.getState as any) = vi.fn(() => ({
      patterns: [mockPattern],
      currentPatternIndex: 0,
      addPattern: vi.fn(),
    }));

    const result = clonePattern();
    expect(result).toBe(true);
  });
});
