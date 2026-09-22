import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AutoDub recording its own performance and playing it back on the same row.
 *
 * `startDubRecorder` is always on and captured anything tagged `source:
 * 'live'` — which includes `origin: 'ai'`, AutoDub performing. On a song whose
 * editor renders from native data (AHX, MusicLine, GTUltra, TFMX) no cell can
 * be written, so capture falls to the automation CURVE path and writes a point
 * at the row being played. `AutomationPlayer` reads that same row on the same
 * pass and fires it again as `source: 'lane'`.
 *
 * Measured 2026-09-22 on jennipha.ahx — every AutoDub move doubled:
 *
 *     [DubRouter] echoThrow ch0 source=live origin=ai
 *     [DubRouter] echoThrow ch0 source=lane origin=lane
 *
 * Every gesture landed twice, and a HOLD fired twice but released once left an
 * instance running with nothing to close it: a held `transportTapeStop` kept
 * the song in slow motion after the user let go.
 *
 * The recorder already skipped `source: 'lane'`, closing the
 * lane -> record -> lane loop. This is the ai -> record -> lane one.
 */

const addPoint = vi.fn();
const setCell = vi.fn();
let fireSubscriber: ((ev: Record<string, unknown>) => void) | null = null;

vi.mock('../DubRouter', () => ({
  subscribeDubRouter: (fn: (ev: Record<string, unknown>) => void) => {
    fireSubscriber = fn;
    return () => { fireSubscriber = null; };
  },
  subscribeDubRelease: () => () => {},
}));

vi.mock('@/stores/useTrackerStore', () => ({
  useTrackerStore: {
    getState: () => ({
      currentPatternIndex: 0,
      patterns: [{
        id: 'p0',
        length: 64,
        channels: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }],
      }],
      setCell,
    }),
  },
}));

vi.mock('@/stores/useAutomationStore', () => ({
  useAutomationStore: {
    getState: () => ({ addPoint, curves: [], addCurve: () => 'curve-1' }),
  },
}));

vi.mock('@/stores/useUIStore', () => ({
  useUIStore: { getState: () => ({ showAutomationLanes: true, toggleAutomationLanes: () => {} }) },
}));

import { startDubRecorder } from '../DubRecorder';

function fireEvent(origin: string): Record<string, unknown> {
  return {
    invocationId: 'i1',
    moveId: 'echoThrow',
    channelId: 0,
    params: {},
    row: 8,
    timeSec: 1,
    source: 'live',
    origin,
    isHold: true,
  };
}

beforeEach(() => {
  addPoint.mockClear();
  setCell.mockClear();
  vi.useFakeTimers();
});

describe('what the recorder captures', () => {
  it('ignores a move AutoDub fired', () => {
    startDubRecorder();
    fireSubscriber?.(fireEvent('ai'));
    vi.runAllTimers();
    expect(addPoint).not.toHaveBeenCalled();
    expect(setCell).not.toHaveBeenCalled();
  });

  it('still ignores a lane replay, as it always did', () => {
    startDubRecorder();
    fireSubscriber?.({ ...fireEvent('lane'), source: 'lane' });
    vi.runAllTimers();
    expect(addPoint).not.toHaveBeenCalled();
  });

  it('still captures what the USER played, which is the point of it', () => {
    startDubRecorder();
    fireSubscriber?.(fireEvent('user'));
    vi.runAllTimers();
    // Either output path is acceptable here — the assertion is that a human
    // gesture is not silently dropped along with the machine's.
    expect(addPoint.mock.calls.length + setCell.mock.calls.length).toBeGreaterThan(0);
  });
});
