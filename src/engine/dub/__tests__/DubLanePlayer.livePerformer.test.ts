import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A recording and a live performer both driving one bus.
 *
 * A dub lane is a RECORDING of a past performance; AutoDub is a performer
 * improvising now. Nothing stopped them running together.
 *
 * Measured 2026-09-22 on jennipha.ahx, which carries a saved lane. Every move
 * fired twice — once from AutoDub and once from the lane:
 *
 *     [DubRouter] delayTimeThrow source=live origin=ai
 *     [DubRouter] delayTimeThrow source=lane origin=lane
 *     [DubRouter] combSweep ch0   source=live origin=ai
 *     [DubRouter] combSweep ch0   source=lane origin=lane
 *
 * Two consequences, both reported. The mix became "one big reverb wash",
 * because every gesture landed at double density. And a HOLD fired twice but
 * released once left one instance running with nothing to close it — for
 * `combSweep` that is a comb filter with feedback, which self-oscillates into
 * a lingering pitched tone.
 *
 * It also explains why changing persona appeared to do nothing: the lane kept
 * replaying the old performance whatever the new persona chose.
 */

const fired: string[] = [];
const disposed: string[] = [];
const HOLD_MOVES = new Set(['combSweep', 'transportTapeStop']);

vi.mock('../DubRouter', () => ({
  // The player subscribes at module load to suppress the lane echo of a
  // live fire; the mock must offer it or the import throws.
  subscribeDubRouter: () => () => {},
  fire: (moveId: string) => {
    fired.push(moveId);
    if (!HOLD_MOVES.has(moveId)) return null;
    return { dispose: () => { disposed.push(moveId); } };
  },
}));

import { DubLanePlayer } from '../DubLanePlayer';

function lane(events: Array<Record<string, unknown>>) {
  return { kind: 'row', enabled: true, events } as never;
}

/** Stand in for the dub store the player reads through `globalThis`. */
function setAutoDub(enabled: boolean): void {
  (globalThis as { __devilboxDubStore?: unknown }).__devilboxDubStore = {
    getState: () => ({ autoDubEnabled: enabled }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  fired.length = 0;
  disposed.length = 0;
  setAutoDub(false);
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { __devilboxDubStore?: unknown }).__devilboxDubStore;
});

describe('while AutoDub is performing', () => {
  it('does not replay the recording on top of it', () => {
    setAutoDub(true);
    const p = new DubLanePlayer();
    p.setLane(lane([
      { id: 'e1', row: 0, moveId: 'delayTimeThrow', params: {} },
      { id: 'e2', row: 4, moveId: 'combSweep', channelId: 0, params: {} },
    ]));
    p.onTick(0);
    p.onTick(4);
    expect(fired).toEqual([]);
  });

  it('releases holds the lane already had in flight rather than stranding them', () => {
    // A comb sweep left running is the lingering tone. Handing over to the
    // live performer must not leave one behind.
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'combSweep', channelId: 0, params: {} }]));
    p.onTick(0);
    expect(fired).toEqual(['combSweep']);
    expect(disposed).toEqual([]);

    setAutoDub(true);
    p.onTick(1);
    expect(disposed).toEqual(['combSweep']);
  });
});

describe('while AutoDub is off', () => {
  it('plays the recording as before', () => {
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'delayTimeThrow', params: {} }]));
    p.onTick(0);
    expect(fired).toEqual(['delayTimeThrow']);
  });

  it('resumes when the live performer stops', () => {
    setAutoDub(true);
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 8, moveId: 'delayTimeThrow', params: {} }]));
    p.onTick(8);
    expect(fired).toEqual([]);

    setAutoDub(false);
    p.onTick(0);   // seek back so the row-8 event is ahead of the cursor again
    p.onTick(8);
    expect(fired).toEqual(['delayTimeThrow']);
  });
});

describe('when the store is not reachable at all', () => {
  it('plays the lane rather than refusing to act', () => {
    delete (globalThis as { __devilboxDubStore?: unknown }).__devilboxDubStore;
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'delayTimeThrow', params: {} }]));
    p.onTick(0);
    expect(fired).toEqual(['delayTimeThrow']);
  });
});
