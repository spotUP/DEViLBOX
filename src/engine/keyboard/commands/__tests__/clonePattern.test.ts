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

    const mockSetState = vi.fn();
    const mockSetStatusMessage = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({
      patterns: [mockPattern],
      currentPatternIndex: 0,
    }));
    (useTrackerStore.setState as any) = mockSetState;

    (useUIStore.getState as any) = vi.fn(() => ({
      setStatusMessage: mockSetStatusMessage,
    }));

    clonePattern();

    expect(mockSetState).toHaveBeenCalledTimes(1);

    // Call the updater to extract the cloned pattern
    const updater = mockSetState.mock.calls[0][0];
    const fakeState = { patterns: [] as typeof mockPattern[] };
    updater(fakeState);

    expect(fakeState.patterns.length).toBe(1);
    const clonedPattern = fakeState.patterns[0];
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

    const mockSetState = vi.fn();
    const mockSetStatusMessage = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({
      patterns: existingPatterns,
      currentPatternIndex: 0,
    }));
    (useTrackerStore.setState as any) = mockSetState;

    (useUIStore.getState as any) = vi.fn(() => ({
      setStatusMessage: mockSetStatusMessage,
    }));

    clonePattern();

    const updater = mockSetState.mock.calls[0][0];
    const fakeState = { patterns: [] as typeof mockPattern[] };
    updater(fakeState);

    expect(fakeState.patterns[0].name).toBe('Pattern 1 (Copy 3)');
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
