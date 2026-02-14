import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clonePattern } from '../clonePattern';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

// Mock stores
vi.mock('@stores/useTrackerStore');
vi.mock('@stores/useUIStore');

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
    const mockSetStatusMessage = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({
      patterns: [mockPattern],
      currentPatternIndex: 0,
      addPattern: mockAddPattern,
    }));

    (useUIStore.getState as any) = vi.fn(() => ({
      setStatusMessage: mockSetStatusMessage,
    }));

    clonePattern();

    expect(mockAddPattern).toHaveBeenCalledTimes(1);

    // Verify it's a deep clone (not the same reference)
    const clonedPattern = mockAddPattern.mock.calls[0][0];
    expect(clonedPattern).not.toBe(mockPattern);
    expect(clonedPattern.name).toBe('Pattern 1 (Copy)');
    expect(clonedPattern.length).toBe(64);

    // Verify status message
    expect(mockSetStatusMessage).toHaveBeenCalledWith('PATTERN CLONED: Pattern 1 (Copy)');
  });

  it('increments copy number for multiple clones', () => {
    const mockPattern = {
      name: 'Pattern 1',
      length: 64,
      channels: []
    };

    const existingPatterns = [
      mockPattern,
      { ...mockPattern, name: 'Pattern 1 (Copy)' },
      { ...mockPattern, name: 'Pattern 1 (Copy 2)' },
    ];

    const mockAddPattern = vi.fn();
    const mockSetStatusMessage = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({
      patterns: existingPatterns,
      currentPatternIndex: 0,
      addPattern: mockAddPattern,
    }));

    (useUIStore.getState as any) = vi.fn(() => ({
      setStatusMessage: mockSetStatusMessage,
    }));

    clonePattern();

    const clonedPattern = mockAddPattern.mock.calls[0][0];
    expect(clonedPattern.name).toBe('Pattern 1 (Copy 3)');
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

    (useUIStore.getState as any) = vi.fn(() => ({
      setStatusMessage: vi.fn(),
    }));

    const result = clonePattern();
    expect(result).toBe(true);
  });
});
