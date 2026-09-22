import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A dub lane that holds a move forever takes the song with it.
 *
 * Measured 2026-09-22 on jennipha.ahx. Its lane fires `transportTapeStop` at
 * the start of the song — a HOLD move that sweeps the master low-pass to 400 Hz
 * and keeps it there until release. `DubLanePlayer` kept the disposer only when
 * the event carried a duration and dropped it otherwise, so nothing could ever
 * release it: the tune played through a closed filter, then died, and every
 * later `reverseEcho` captured silence because nothing reached `bus.input`.
 *
 * The lane data is years old. These events had never executed before the
 * `require()` sweep earlier the same day, which is why it surfaced now.
 */

const fired: string[] = [];
const disposed: string[] = [];
/** Move ids the mocked router treats as holds (they return a disposer). */
const HOLD_MOVES = new Set(['transportTapeStop', 'masterDrop']);

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

beforeEach(() => {
  vi.useFakeTimers();
  fired.length = 0;
  disposed.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a lane hold with no duration', () => {
  it('is released rather than held forever', () => {
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'transportTapeStop', params: {} }]));

    p.onTick(0);
    expect(fired).toEqual(['transportTapeStop']);
    expect(disposed).toHaveLength(0);

    // Whatever the bound is, it must exist.
    vi.advanceTimersByTime(60_000);
    expect(disposed).toEqual(['transportTapeStop']);
  });

  it('is still reachable by a seek before the bound expires', () => {
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'transportTapeStop', params: {} }]));
    p.onTick(0);

    // A backwards jump releases every hold — that path only worked for
    // duration-carrying events before, because nothing else was tracked.
    p.onTick(10);
    p.onTick(0);
    expect(disposed).toEqual(['transportTapeStop']);
  });

  it('releases exactly once per fire, however the release arrives', () => {
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'transportTapeStop', params: {} }]));
    p.onTick(0);
    p.onTick(5);
    p.onTick(0);   // seek: releases the first hold AND re-fires the row-0 event
    vi.advanceTimersByTime(60_000);

    // Two fires, two releases. The watchdog must not double-dispose the one
    // the seek already closed, and must not miss the one the seek re-opened.
    expect(fired).toHaveLength(2);
    expect(disposed).toHaveLength(2);
  });
});

describe('the paths that already worked', () => {
  it('leaves a trigger move alone — there is nothing to release', () => {
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'springSlam', params: {} }]));
    p.onTick(0);
    vi.advanceTimersByTime(60_000);
    expect(fired).toEqual(['springSlam']);
    expect(disposed).toHaveLength(0);
  });

  it('keeps holding a move whose event states a duration', () => {
    const p = new DubLanePlayer();
    p.setLane(lane([
      { id: 'e1', row: 0, moveId: 'masterDrop', params: {}, durationRows: 16 },
    ]));
    p.onTick(0);
    // A stated duration is the lane's own business; the watchdog must not
    // second-guess it.
    vi.advanceTimersByTime(60_000);
    expect(disposed).toHaveLength(0);
  });

  it('releases everything when the lane is replaced', () => {
    const p = new DubLanePlayer();
    p.setLane(lane([{ id: 'e1', row: 0, moveId: 'transportTapeStop', params: {} }]));
    p.onTick(0);
    p.setLane(null);
    expect(disposed).toEqual(['transportTapeStop']);
  });
});
