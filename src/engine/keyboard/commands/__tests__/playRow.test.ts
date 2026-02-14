import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playRow } from '../playRow';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';

// Mock stores and engine
vi.mock('@stores/useTrackerStore');
vi.mock('@stores/useTransportStore');
vi.mock('@engine/ToneEngine');

describe('playRow command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays only the current row', () => {
    const mockCursor = { rowIndex: 8, channelIndex: 0, columnType: 'note' };
    const mockStop = vi.fn();
    const mockPlayRow = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({ cursor: mockCursor }));
    (useTransportStore.getState as any) = vi.fn(() => ({
      isPlaying: false,
      stop: mockStop,
      playRow: mockPlayRow,
    }));

    playRow();

    expect(mockPlayRow).toHaveBeenCalledWith(8);
  });

  it('stops existing playback before playing row', () => {
    const mockCursor = { rowIndex: 12, channelIndex: 0, columnType: 'note' };
    const mockStop = vi.fn();
    const mockPlayRow = vi.fn();

    (useTrackerStore.getState as any) = vi.fn(() => ({ cursor: mockCursor }));
    (useTransportStore.getState as any) = vi.fn(() => ({
      isPlaying: true,
      stop: mockStop,
      playRow: mockPlayRow,
    }));

    playRow();

    expect(mockStop).toHaveBeenCalled();
    expect(mockPlayRow).toHaveBeenCalledWith(12);
  });

  it('returns true when successful', () => {
    const mockCursor = { rowIndex: 0, channelIndex: 0, columnType: 'note' };

    (useTrackerStore.getState as any) = vi.fn(() => ({ cursor: mockCursor }));
    (useTransportStore.getState as any) = vi.fn(() => ({
      isPlaying: false,
      stop: vi.fn(),
      playRow: vi.fn(),
    }));

    const result = playRow();
    expect(result).toBe(true);
  });
});
