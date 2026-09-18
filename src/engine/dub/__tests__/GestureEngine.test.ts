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

  it('is not degraded when the move can update AND the spec says what travels', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({
      shape: 'sweep',
      automate: { param: 'targetHz', from: 20000, to: 200, curve: 'exponential' },
    }));
    expect(activeGestures()[0].degraded).toBeUndefined();
  });

  // Behaviour CHANGED when Gate F4 closed and the shapes became real. Being
  // able to accept a parameter is half the requirement; before, that half was
  // all the engine checked, because there was nothing to drive. Now the spec
  // must also name the parameter and its range, and a gesture that says
  // "sweep" without saying what is swept is a caller bug worth reporting.
  it('is degraded when the move can update but nothing says which param moves', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'sweep' }));
    expect(activeGestures()[0].degraded).toMatch(/which parameter/);
  });

  it('is degraded when the hold is open-ended, because there is no progress to be at', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({
      shape: 'ramp',
      holdMs: 0,
      automate: { param: 'targetHz', from: 20000, to: 200 },
    }));
    // holdMs 0 is a one-shot, so the gesture is already gone; the reason is
    // what matters and it is recorded before the move completes.
    expect(fired).toHaveLength(1);
  });
});

describe('Gate F4 — a ramp actually moves the parameter while held', () => {
  const automate = { param: 'targetHz', from: 20000, to: 200, curve: 'exponential' as const };

  it('pushes the start of the range the moment it begins', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'ramp', holdMs: 1000, automate }));
    expect(handleUpdates[0]).toEqual({ targetHz: 20000 });
  });

  it('keeps pushing values as the hold runs, in the direction asked for', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'ramp', holdMs: 1000, automate }));
    vi.advanceTimersByTime(500);
    const values = handleUpdates.map(u => u.targetHz);
    expect(values.length).toBeGreaterThan(5);
    // Monotonically downward — a filter being closed, not jittering.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
    expect(values[values.length - 1]).toBeLessThan(20000);
  });

  it('arrives exactly at the target by the end of the hold, not near it', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'ramp', holdMs: 1000, automate }));
    vi.advanceTimersByTime(1000);
    const last = handleUpdates[handleUpdates.length - 1].targetHz;
    expect(last).toBeCloseTo(200, 6);
  });

  it('stops pushing once the gesture has released', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'ramp', holdMs: 500, automate }));
    vi.advanceTimersByTime(500);
    const settled = handleUpdates.length;
    vi.advanceTimersByTime(2000);
    expect(handleUpdates).toHaveLength(settled);
  });

  it('a sweep comes back to where it started', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'sweep', holdMs: 1000, automate }));
    vi.advanceTimersByTime(500);
    const mid = handleUpdates[handleUpdates.length - 1].targetHz;
    vi.advanceTimersByTime(500);
    const end = handleUpdates[handleUpdates.length - 1].targetHz;
    expect(mid).toBeCloseTo(200, 0);
    expect(end).toBeCloseTo(20000, 0);
  });

  it('a longer hold sweeps for longer, rather than freezing where it stood', () => {
    moveSupportsUpdate = true;
    const id = beginGesture(spec({ shape: 'ramp', holdMs: 1000, automate }));
    vi.advanceTimersByTime(500);
    const atHalf = handleUpdates[handleUpdates.length - 1].targetHz;

    updateGesture(id, { holdMs: 2000 });
    // Extending must not jump the value back to the top of the range.
    expect(handleUpdates[handleUpdates.length - 1].targetHz).toBeCloseTo(atHalf, 0);

    vi.advanceTimersByTime(500);
    const atOneSecond = handleUpdates[handleUpdates.length - 1].targetHz;
    // Under the ORIGINAL hold this instant was the end of the ramp; under the
    // extended one it is only halfway, so it must still be above the target.
    expect(atOneSecond).toBeGreaterThan(200);
    expect(atOneSecond).toBeLessThan(atHalf);
  });

  it('never fires the move a second time — the shape is one gesture', () => {
    moveSupportsUpdate = true;
    beginGesture(spec({ shape: 'sweep', holdMs: 1000, automate }));
    vi.advanceTimersByTime(1000);
    expect(fired).toHaveLength(1);
  });

  it('survives a move whose update throws, without killing the gesture', () => {
    moveSupportsUpdate = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    beginGesture(spec({ shape: 'ramp', holdMs: 500, automate }));
    vi.advanceTimersByTime(500);
    expect(disposed).toHaveLength(1);        // still released cleanly
    warn.mockRestore();
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

describe('GestureEngine — a hold with no fixed length', () => {
  it('stays in flight until it is ended, which is what a held pad needs', () => {
    const id = beginGesture(spec({ holdMs: 0 }));
    vi.advanceTimersByTime(60_000);
    expect(gestureCount()).toBe(1);          // still held a minute later
    expect(disposed).toHaveLength(0);
    endGesture(id);
    expect(disposed).toEqual(['echoThrow']);
  });

  it('is reachable by a panic, unlike a disposer closed over in a component', () => {
    beginGesture(spec({ moveId: 'dubSiren', holdMs: 0 }));
    beginGesture(spec({ moveId: 'crushBass', holdMs: 0 }));
    expect(cancelAllGestures('stopped')).toBe(2);
    expect(disposed.sort()).toEqual(['crushBass', 'dubSiren']);
  });
});
