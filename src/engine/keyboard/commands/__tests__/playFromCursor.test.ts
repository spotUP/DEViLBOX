import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playFromCursor } from '../playFromCursor';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';

// Mock stores and engine
vi.mock('@stores/useTrackerStore');
vi.mock('@stores/useTransportStore');
vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: vi.fn(() => ({
    init: vi.fn(() => Promise.resolve()),
  })),
}));

describe('playFromCursor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets start row and plays from cursor position', () => {
    const mockCursor = { rowIndex: 16, channelIndex: 0, columnType: 'note' };
    const mockStop = vi.fn();
    const mockPlay = vi.fn();
    const mockSetCurrentRow = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({ cursor: mockCursor }));
    (useTransportStore.getState as any) = vi.fn(() => ({
      isPlaying: false,
      stop: mockStop,
      play: mockPlay,
      setCurrentRow: mockSetCurrentRow,
    }));

    const result = playFromCursor();

    expect(result).toBe(true);
    expect(mockSetCurrentRow).toHaveBeenCalledWith(16);
  });

  it('stops playback before restarting from cursor', () => {
    const mockCursor = { rowIndex: 32, channelIndex: 0, columnType: 'note' };
    const mockStop = vi.fn();
    const mockPlay = vi.fn();
    const mockSetCurrentRow = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({ cursor: mockCursor }));
    (useTransportStore.getState as any) = vi.fn(() => ({
      isPlaying: true,
      stop: mockStop,
      play: mockPlay,
      setCurrentRow: mockSetCurrentRow,
    }));

    playFromCursor();

    expect(mockStop).toHaveBeenCalled();
  });
});
