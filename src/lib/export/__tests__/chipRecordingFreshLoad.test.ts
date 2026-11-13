import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FurnaceChipType } from '../../../engine/chips/FurnaceChipEngine';

// A song that was loaded but never played: the dispatch engine is initialised,
// but no chip exists yet (chips are made at play start).
const dispatch = {
  isInitialized: true,
  regCaptureSampleRate: 48000,
  startRegCapture: vi.fn(),
  stopRegCapture: vi.fn(),
  hasChip: vi.fn(() => false),
  getSampleRoms: vi.fn(async () => []),
  getRegCaptureLog: vi.fn(() => [] as unknown[]),
};
const chipEngine = { setLogging: vi.fn(), getLog: vi.fn(async () => new Uint8Array(0)) };

vi.mock('../../../engine/furnace-dispatch/FurnaceDispatchEngine', () => ({
  FurnaceDispatchEngine: { getInstance: () => dispatch },
}));
vi.mock('../../../engine/chips/FurnaceChipEngine', async (orig) => ({
  ...(await orig<typeof import('../../../engine/chips/FurnaceChipEngine')>()),
  FurnaceChipEngine: { getInstance: () => chipEngine },
}));

import { ChipRecordingSession } from '../ChipExporter';

describe('Record on a freshly loaded, never played song', () => {
  beforeEach(() => { vi.clearAllMocks(); dispatch.getRegCaptureLog.mockReturnValue([]); });

  it('starts the dispatch capture although no dispatch chip exists yet', () => {
    new ChipRecordingSession().startRecording();
    expect(dispatch.startRegCapture).toHaveBeenCalledTimes(1);
  });

  it('returns the dispatch capture (not "No register writes captured") once play created the chip', async () => {
    const s = new ChipRecordingSession();
    s.startRecording();
    dispatch.getRegCaptureLog.mockReturnValue([
      { timestamp: 4800, chipType: FurnaceChipType.OPNB, port: 0x28, data: 0xf1 },
      { timestamp: 5760, chipType: FurnaceChipType.OPNB, port: 0x130, data: 0x7f },
    ]);
    const log = await s.stopRecording();
    expect(log.length).toBe(24);
    const v = new DataView(log.buffer);
    expect(v.getUint32(0, true)).toBe(0);       // first write is time zero
    expect(v.getUint32(12, true)).toBe(882);    // 960 samples at 48 kHz
  });
});
