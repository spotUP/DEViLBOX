/**
 * The MCP `play` tool starts at row 0, as Play Song / Play Pattern do.
 *
 * Stop keeps currentRow at the stop row, and a song-mode start seeks to currentRow
 * (usePatternPlayback). The tool skipped the row reset the keyboard and toolbar Play
 * do, so play -> stop -> play (song) started at row 18: a Neo Geo song's row-0 note
 * came ~120 ticks late, and a short level probe read silence (2026-11-14).
 */
import { describe, it, expect, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  isPlaying: false,
  currentRow: 18,
  setIsLooping: vi.fn(),
  setCurrentRow: vi.fn((r: number) => { transport.currentRow = r; }),
  play: vi.fn(async () => undefined),
}));
vi.mock('@stores/useTransportStore', () => ({ useTransportStore: { getState: () => transport } }));
vi.mock('@/stores/useTransportStore', () => ({ useTransportStore: { getState: () => transport } }));
vi.mock('../../../stores/useTransportStore', () => ({ useTransportStore: { getState: () => transport } }));
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({}), peekTrackerReplayer: () => null }));
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));

import { play } from '../writeHandlers';

describe('play tool', () => {
  it.each(['song', 'pattern'])('%s mode after a stop starts at row 0, before the transport plays', async (mode) => {
    transport.currentRow = 18;
    transport.play.mockImplementationOnce(async () => { expect(transport.currentRow).toBe(0); });
    await play({ mode });
    expect(transport.play).toHaveBeenCalled();
    expect(transport.currentRow).toBe(0);
  });
});
