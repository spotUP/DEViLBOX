import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playRow } from '../playRow';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getToneEngine } from '@engine/ToneEngine';

// Mock stores and engine
vi.mock('@stores/useTrackerStore');
vi.mock('@stores/useInstrumentStore');
vi.mock('@engine/ToneEngine');
vi.mock('@/lib/xmConversions', () => ({
  xmNoteToString: (note: number) => {
    const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
    const octave = Math.floor((note - 1) / 12);
    const noteIdx = (note - 1) % 12;
    return `${notes[noteIdx]}${octave}`;
  }
}));

describe('playRow command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays all notes in current row across all channels', () => {
    const mockPattern = {
      channels: [
        { rows: [{ note: 49, instrument: 1 }] }, // C-4
        { rows: [{ note: 53, instrument: 1 }] }, // E-4
      ]
    };

    const mockCursor = { rowIndex: 0, channelIndex: 0, columnType: 'note' };
    const mockEngine = {
      triggerNoteAttack: vi.fn()
    };
    const mockInstrument = { id: 1, name: 'Test' };

    (useTrackerStore.getState as any) = vi.fn(() => ({
      cursor: mockCursor,
      patterns: [mockPattern],
      currentPatternIndex: 0,
    }));

    (getToneEngine as any) = vi.fn(() => mockEngine);

    (useInstrumentStore.getState as any) = vi.fn(() => ({
      instruments: [mockInstrument]
    }));

    playRow();

    // Should trigger 2 notes (one per channel)
    expect(mockEngine.triggerNoteAttack).toHaveBeenCalledTimes(2);
  });

  it('skips empty cells when playing row', () => {
    const mockPattern = {
      channels: [
        { rows: [{ note: 49, instrument: 1 }] },
        { rows: [{ note: 0, instrument: 0 }] }, // Empty
      ]
    };

    const mockCursor = { rowIndex: 0, channelIndex: 0, columnType: 'note' };
    const mockEngine = { triggerNoteAttack: vi.fn() };
    const mockInstrument = { id: 1, name: 'Test' };

    (useTrackerStore.getState as any) = vi.fn(() => ({
      cursor: mockCursor,
      patterns: [mockPattern],
      currentPatternIndex: 0,
    }));

    (getToneEngine as any) = vi.fn(() => mockEngine);

    (useInstrumentStore.getState as any) = vi.fn(() => ({
      instruments: [mockInstrument]
    }));

    playRow();

    // Should only trigger 1 note
    expect(mockEngine.triggerNoteAttack).toHaveBeenCalledTimes(1);
  });

  it('returns true when successful', () => {
    const mockPattern = {
      channels: [
        { rows: [{ note: 0, instrument: 0 }] }
      ]
    };

    const mockCursor = { rowIndex: 0, channelIndex: 0, columnType: 'note' };
    const mockEngine = { triggerNoteAttack: vi.fn() };

    (useTrackerStore.getState as any) = vi.fn(() => ({
      cursor: mockCursor,
      patterns: [mockPattern],
      currentPatternIndex: 0,
    }));

    (getToneEngine as any) = vi.fn(() => mockEngine);

    (useInstrumentStore.getState as any) = vi.fn(() => ({
      instruments: []
    }));

    const result = playRow();
    expect(result).toBe(true);
  });
});
