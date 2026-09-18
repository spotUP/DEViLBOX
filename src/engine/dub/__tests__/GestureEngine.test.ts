import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The router is mocked so this stays a unit test of the gesture SHAPE —
 * start, hold, release, bounce, cancel — with no DubBus, no AudioContext and
 * no timing luck. What matters is that every gesture still goes through the
 * router exactly once, which the mock records.
 */
const fired: Array<{
  moveId: string;
  channelId?: number;
  params: Record<string, number>;
  source: string;
  opts?: { preQuantized?: boolean };
}> = [];
const disposed: string[] = [];
let handleUpdates: Array<Record<string, number>> = [];
/** When true the mocked move returns a handle with an `update` method. */
let moveSupportsUpdate = false;
/** When true the mocked move is a one-shot: no disposer. */
let moveIsOneShot = false;

vi.mock('../DubRouter', () => ({
  fire: (
    moveId: string,
    channelId: number | undefined,
    params: Record<string, number>,
    source: string,
    opts?: { preQuantized?: boolean },
  ) => {
    fired.push({ moveId, channelId, params, source, opts });
    if (moveIsOneShot) return null;
    return {
      dispose: () => {
        disposed.push(moveId);
        if (moveId === 'boom') throw new Error('disposer exploded');
      },
      ...(moveSupportsUpdate
        ? { update: (p: Record<string, number>) => { handleUpdates.push(p); } }
        : {}),
    };
  },
}));

/** Grid helper mocked so quantization is a number this test controls. */
let gridWaitMs = 0;
vi.mock('../dubGrid', () => ({
  msToNextGridBoundary: () => gridWaitMs,
}));

import {
  beginGesture,
  endGesture,
  updateGesture,
  cancelGesture,
  cancelAllGestures,
  activeGestures,
  gestureCount,
} from '../GestureEngine';

function spec(over: Partial<Parameters<typeof beginGesture>[0]> = {}) {
  return { moveId: 'echoThrow', holdMs: 1000, bpm: 120, ...over };
}

beforeEach(() => {
  vi.useFakeTimers();
  fired.length = 0;
  disposed.length = 0;
  handleUpdates = [];
  moveSupportsUpdate = false;
  moveIsOneShot = false;
  gridWaitMs = 0;
  cancelAllGestures();
});

afterEach(() => {
  cancelAllGestures();
  vi.useRealTimers();
});

describe('GestureEngine — the ordinary hold', () => {
  it('fires through the router, holds, and releases at the hold length', () => {
    beginGesture(spec({ holdMs: 500 }));
    expect(fired).toHaveLength(1);
    expect(fired[0].moveId).toBe('echoThrow');
    expect(gestureCount()).toBe(1);

    vi.advanceTimersByTime(499);
    expect(disposed).toHaveLength(0);

    vi.advanceTimersByTime(2);
    expect(disposed).toEqual(['echoThrow']);
    expect(gestureCount()).toBe(0);
  });

  it('treats a move with no disposer as a one-shot and does not keep it in flight', () => {
    moveIsOneShot = true;
    beginGesture(spec({ moveId: 'sonarPing', holdMs: 1000 }));
    expect(fired).toHaveLength(1);
    expect(gestureCount()).toBe(0);
  });

  it('calls onStart when it actually starts and onEnd when it ends', () => {
    const started: string[] = [];
    const ended: string[] = [];
    beginGesture(spec({
      holdMs: 200,
      onStart: g => started.push(g.moveId),
      onEnd: (g, reason) => ended.push(`${g.moveId}:${reason}`),
    }));
    expect(started).toEqual(['echoThrow']);
    vi.advanceTimersByTime(250);
    expect(ended).toEqual(['echoThrow:completed']);
  });
});

describe('GestureEngine — quantized start and release', () => {
  it('waits for the grid before firing, and tells the router not to quantize again', () => {
    gridWaitMs = 120;
    beginGesture(spec({ quantizeStart: 'offbeat' }));
    expect(fired).toHaveLength(0);          // still waiting for the boundary
    vi.advanceTimersByTime(120);
    expect(fired).toHaveLength(1);
    expect(fired[0].opts?.preQuantized).toBe(true);
  });

  it('does not claim to be pre-quantized when it fired immediately', () => {
    beginGesture(spec());
    expect(fired[0].opts?.preQuantized).toBe(false);
  });

  it('cancelling during the quantize wait never fires the move at all', () => {
    gridWaitMs = 200;
    const id = beginGesture(spec({ quantizeStart: 'bar' }));
    cancelGesture(id);
    vi.advanceTimersByTime(500);
    expect(fired).toHaveLength(0);
    expect(gestureCount()).toBe(0);
  });

  it('holds the release until the grid boundary when one is asked for', () => {
    beginGesture(spec({ holdMs: 100, quantizeRelease: '1/8' }));
    gridWaitMs = 90;                        // boundary is 90 ms past the hold
    vi.advanceTimersByTime(110);
    expect(disposed).toHaveLength(0);       // waiting for the grid
    vi.advanceTimersByTime(90);
    expect(disposed).toEqual(['echoThrow']);
  });

  it('releases exactly at the hold length when no grid is asked for', () => {
    gridWaitMs = 500;                       // would matter if it were consulted
    beginGesture(spec({ holdMs: 100 }));
    vi.advanceTimersByTime(110);
    expect(disposed).toEqual(['echoThrow']);
  });
});

describe('GestureEngine — rebound', () => {
  it('fires a second, shorter press off the release', () => {
    beginGesture(spec({ moveId: 'channelMute', holdMs: 400, shape: 'rebound', reboundMs: 100 }));
    expect(fired).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(disposed).toEqual(['channelMute']);
    expect(fired).toHaveLength(2);          // the bounce
    vi.advanceTimersByTime(100);
    expect(disposed).toEqual(['channelMute', 'channelMute']);
    expect(gestureCount()).toBe(0);
  });

  it('does not bounce when the gesture was cancelled rather than completed', () => {
    const id = beginGesture(spec({ holdMs: 400, shape: 'rebound', reboundMs: 100 }));
    cancelGesture(id);
    vi.advanceTimersByTime(500);
    expect(fired).toHaveLength(1);
  });
});

describe('GestureEngine — shapes a move cannot serve', () => {
  it('marks a ramp as degraded rather than pretending, when the move cannot update', () => {
    beginGesture(spec({ shape: 'ramp' }));
    const [g] = activeGestures();
    expect(g.degraded).toMatch(/cannot/);
    expect(g.shape).toBe('ramp');           // the request is not rewritten
  });

  it('is not degraded when the move can update its params mid-flight', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'sweep' }));
    expect(activeGestures()[0].degraded).toBeUndefined();
  });

  it('pushes params into a move that accepts them, and reports when it cannot', () => {
    moveSupportsUpdate = true;
    const id = beginGesture(spec());
    expect(updateGesture(id, { params: { intensity: 0.8 } })).toBe(true);
    expect(handleUpdates).toEqual([{ intensity: 0.8 }]);

    moveSupportsUpdate = false;
    const id2 = beginGesture(spec({ moveId: 'dubStab' }));
    expect(updateGesture(id2, { params: { intensity: 0.5 } })).toBe(false);
  });
});

describe('GestureEngine — changing a gesture in flight', () => {
  it('extends a hold', () => {
    const id = beginGesture(spec({ holdMs: 200 }));
    vi.advanceTimersByTime(100);
    updateGesture(id, { holdMs: 600 });
    vi.advanceTimersByTime(150);
    expect(disposed).toHaveLength(0);       // would have released at 200
    vi.advanceTimersByTime(400);
    expect(disposed).toEqual(['echoThrow']);
  });

  it('releases immediately when shortened past the time already held', () => {
    const id = beginGesture(spec({ holdMs: 1000 }));
    vi.advanceTimersByTime(300);
    updateGesture(id, { holdMs: 100 });
    expect(disposed).toEqual(['echoThrow']);
  });

  it('reports false for a gesture that is already over', () => {
    const id = beginGesture(spec({ holdMs: 50 }));
    vi.advanceTimersByTime(60);
    expect(updateGesture(id, { holdMs: 500 })).toBe(false);
  });
});

describe('GestureEngine — cancellation', () => {
  it('cancels everything on transport stop and says how many', () => {
    beginGesture(spec({ moveId: 'echoThrow' }));
    beginGesture(spec({ moveId: 'ghostReverb' }));
    expect(gestureCount()).toBe(2);
    expect(cancelAllGestures('stopped')).toBe(2);
    expect(disposed.sort()).toEqual(['echoThrow', 'ghostReverb']);
    expect(gestureCount()).toBe(0);
  });

  it('passes the end reason to onEnd so a stop is distinguishable from a release', () => {
    const reasons: string[] = [];
    beginGesture(spec({ onEnd: (_g, reason) => reasons.push(reason) }));
    cancelAllGestures('seeked');
    expect(reasons).toEqual(['seeked']);
  });

  it('never releases twice, however many times it is asked', () => {
    const id = beginGesture(spec({ holdMs: 100 }));
    endGesture(id);
    endGesture(id);
    cancelGesture(id);
    vi.advanceTimersByTime(200);
    expect(disposed).toEqual(['echoThrow']);
  });

  it('survives a move whose disposer throws, and still forgets the gesture', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    beginGesture(spec({ moveId: 'boom', holdMs: 50 }));
    vi.advanceTimersByTime(60);
    expect(gestureCount()).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
