import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playFromCursor } from '../playFromCursor';
import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores/useTrackerStore';

// Mock stores
vi.mock('@stores/useTransportStore');
vi.mock('@stores/useTrackerStore');

describe('playFromCursor command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts playback from current row', () => {
    const mockPlay = vi.fn();
    const mockSetCurrentRow = vi.fn();
    const mockSetCurrentPattern = vi.fn();

    vi.mocked(useTransportStore.getState).mockReturnValue({
      play: mockPlay,
      isPlaying: false,
      setCurrentRow: mockSetCurrentRow,
      setCurrentPattern: mockSetCurrentPattern,
    } as any);

    vi.mocked(useTrackerStore.getState).mockReturnValue({
      currentRow: 16,
      currentPatternIndex: 2,
    } as any);

    playFromCursor();

    expect(mockSetCurrentPattern).toHaveBeenCalledWith(2);
    expect(mockSetCurrentRow).toHaveBeenCalledWith(16);
    expect(mockPlay).toHaveBeenCalled();
  });

  it('does nothing if already playing', () => {
    const mockPlay = vi.fn();

    vi.mocked(useTransportStore.getState).mockReturnValue({
      play: mockPlay,
      isPlaying: true,
    } as any);

    playFromCursor();

    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('returns true when successful', () => {
    vi.mocked(useTransportStore.getState).mockReturnValue({
      play: vi.fn(),
      isPlaying: false,
      setCurrentRow: vi.fn(),
      setCurrentPattern: vi.fn(),
    } as any);

    vi.mocked(useTrackerStore.getState).mockReturnValue({
      currentRow: 0,
      currentPatternIndex: 0,
    } as any);

    const result = playFromCursor();
    expect(result).toBe(true);
  });

  it('returns false when already playing', () => {
    vi.mocked(useTransportStore.getState).mockReturnValue({
      play: vi.fn(),
      isPlaying: true,
    } as any);

    const result = playFromCursor();
    expect(result).toBe(false);
  });
});
