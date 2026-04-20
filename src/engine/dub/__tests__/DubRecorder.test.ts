/**
 * DubRecorder + DubLanePlayer round-trip tests.
 *
 * Guards task #22 "Automation record → replay verification" for the dub
 * lane subsystem. The contract under test:
 *
 *   1. Arming `useDubStore.armed` + firing moves via DubRouter writes
 *      DubEvent records into the current pattern's dubLane, stamped with
 *      moveId, channelId, params, and the row at which the fire happened.
 *   2. Hold-style moves (disposer-returning) get `durationRows` stamped on
 *      release, computed from releaseRow − fireRow.
 *   3. Replaying the same lane via DubLanePlayer.onTick(row) fires every
 *      recorded event at its original row, with its original params, via
 *      the SAME DubRouter.fire() code path (source='lane' so it isn't
 *      re-captured by the recorder).
 *   4. Seek / loop backwards correctly rewinds the cursor so the next
 *      forward pass re-fires events.
 *
 * Pure-logic coverage: no AudioContext, no audio worklets. DubBus is a
 * mock (same approach as DubRouter.test.ts), and rAF is stubbed so
 * scheduleDubStoreSync flushes synchronously.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fire,
  setDubBusForRouter,
  subscribeDubRouter,
  type DubFireEvent,
} from '../DubRouter';
import { DubLanePlayer } from '../DubLanePlayer';
import { startDubRecorder } from '../DubRecorder';
import { useDubStore } from '@/stores/useDubStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import type { DubBus } from '../DubBus';

// ── Mock DubBus (pure logic — real one needs AudioContext) ────────────────
function makeMockBus(): DubBus {
  return {
    get isEnabled() { return true; },
    openChannelTap: vi.fn(() => () => {}),
    modulateFeedback: vi.fn(),
    slamSpring: vi.fn(),
    filterDrop: vi.fn(() => () => {}),
    setSirenFeedback: vi.fn(() => () => {}),
    startTapeWobble: vi.fn(() => () => {}),
    fireNoiseBurst: vi.fn(),
    throwEchoTime: vi.fn(),
    backwardReverb: vi.fn(async () => {}),
    tapeStop: vi.fn(),
    soloChannelTap: vi.fn(() => () => {}),
    inputNode: { context: {} as AudioContext } as unknown as GainNode,
  } as unknown as DubBus;
}

// ── Pattern fixture: two empty-ish patterns for round-trip tests ──────────
function installPatterns(): void {
  const mkPattern = (id: string, name: string) => ({
    id,
    name,
    length: 64,
    channels: [
      { id: 'ch0', name: 'Ch 1', rows: [] },
      { id: 'ch1', name: 'Ch 2', rows: [] },
      { id: 'ch2', name: 'Ch 3', rows: [] },
      { id: 'ch3', name: 'Ch 4', rows: [] },
    ],
    dubLane: { enabled: true, events: [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  useTrackerStore.setState((s) => ({
    ...s,
    patterns: [mkPattern('p0', 'Pattern 00'), mkPattern('p1', 'Pattern 01')],
    currentPatternIndex: 0,
  }));
}

function setRow(row: number): void {
  useTransportStore.setState((s) => ({ ...s, currentRow: row }));
}

describe('DubRecorder + DubLanePlayer round-trip', () => {
  let unsubRecorder: (() => void) | null = null;

  beforeEach(() => {
    // Flush requestAnimationFrame synchronously so scheduleDubStoreSync
    // commits inside the test body. Saves us from sprinkling awaits.
    //
    // IMPORTANT: must return `null` (not `0`). The store caches the rAF
    // handle in `_pendingSync` and skips re-scheduling when it's truthy —
    // a `0` handle (falsy-but-not-null) would trip the `!== null` guard
    // and deadlock every subsequent fire after the first.
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return null as unknown as number;
    });
    setDubBusForRouter(makeMockBus());
    installPatterns();
    useDubStore.setState({ armed: false });
    setRow(0);
    unsubRecorder = startDubRecorder();
  });

  afterEach(() => {
    unsubRecorder?.();
    unsubRecorder = null;
    setDubBusForRouter(null);
    useDubStore.setState({ armed: false });
    vi.unstubAllGlobals();
  });

  describe('record path', () => {
    it('unarmed: firing does NOT write to the lane', () => {
      setRow(8);
      fire('echoThrow', 0);
      const lane = useTrackerStore.getState().patterns[0].dubLane;
      expect(lane?.events ?? []).toHaveLength(0);
    });

    it('armed + trigger move: event lands in lane at the fire row with params', () => {
      useDubStore.setState({ armed: true });
      setRow(12);
      fire('echoThrow', 2, { intensity: 0.75 });
      const events = useTrackerStore.getState().patterns[0].dubLane!.events;
      expect(events).toHaveLength(1);
      expect(events[0].moveId).toBe('echoThrow');
      expect(events[0].channelId).toBe(2);
      expect(events[0].row).toBe(12);
      expect(events[0].params.intensity).toBe(0.75);
    });

    it('armed + hold move: fire writes event, release stamps durationRows', () => {
      useDubStore.setState({ armed: true });
      setRow(4);
      const disposer = fire('filterDrop', 1, { targetHz: 200 });
      expect(disposer).not.toBeNull();

      // Event captured at fire time with no duration yet (trigger semantics).
      {
        const events = useTrackerStore.getState().patterns[0].dubLane!.events;
        expect(events).toHaveLength(1);
        expect(events[0].row).toBe(4);
        expect(events[0].durationRows).toBeUndefined();
      }

      // Move the transport forward, dispose → release event stamps duration.
      setRow(20);
      disposer!.dispose();
      const events = useTrackerStore.getState().patterns[0].dubLane!.events;
      expect(events).toHaveLength(1);
      expect(events[0].durationRows).toBeCloseTo(16, 5);
    });

    it('events land sorted by row regardless of fire order', () => {
      useDubStore.setState({ armed: true });
      setRow(30); fire('echoThrow', 0);
      setRow(5);  fire('echoThrow', 1);
      setRow(18); fire('echoThrow', 2);
      const events = useTrackerStore.getState().patterns[0].dubLane!.events;
      expect(events.map(e => e.row)).toEqual([5, 18, 30]);
      expect(events.map(e => e.channelId)).toEqual([1, 2, 0]);
    });

    it('lane-sourced fires are ignored (no re-capture on replay)', () => {
      useDubStore.setState({ armed: true });
      setRow(10);
      fire('echoThrow', 0, {}, 'lane');
      const events = useTrackerStore.getState().patterns[0].dubLane!.events;
      expect(events).toHaveLength(0);
    });
  });

  describe('replay path', () => {
    it('onTick fires each recorded event exactly once at its row', () => {
      // Arrange: record three events at known rows.
      useDubStore.setState({ armed: true });
      setRow(5);  fire('echoThrow', 0);
      setRow(10); fire('dubStab',   1);
      setRow(20); fire('echoThrow', 2);

      const pattern = useTrackerStore.getState().patterns[0];
      const events = pattern.dubLane!.events;
      expect(events).toHaveLength(3);

      // Act: spy DubRouter fires with source='lane'.
      const fires: DubFireEvent[] = [];
      const unsub = subscribeDubRouter((e) => {
        if (e.source === 'lane') fires.push(e);
      });

      const player = new DubLanePlayer();
      player.setLane(pattern.dubLane!);
      for (let r = 0; r <= 25; r++) player.onTick(r);
      unsub();

      // Assert: 3 fires, matching moveIds + channelIds, in row order.
      expect(fires).toHaveLength(3);
      expect(fires.map(f => f.moveId)).toEqual(['echoThrow', 'dubStab', 'echoThrow']);
      expect(fires.map(f => f.channelId)).toEqual([0, 1, 2]);
    });

    it('onTick is idempotent within the same row', () => {
      useDubStore.setState({ armed: true });
      setRow(7); fire('echoThrow', 0);
      const pattern = useTrackerStore.getState().patterns[0];

      const fires: DubFireEvent[] = [];
      const unsub = subscribeDubRouter((e) => { if (e.source === 'lane') fires.push(e); });

      const player = new DubLanePlayer();
      player.setLane(pattern.dubLane!);
      player.onTick(7);
      player.onTick(7);
      player.onTick(7);
      unsub();

      expect(fires).toHaveLength(1);
    });

    it('backwards seek rewinds the cursor so events re-fire on the next pass', () => {
      useDubStore.setState({ armed: true });
      setRow(3);  fire('echoThrow', 0);
      setRow(12); fire('echoThrow', 1);
      const pattern = useTrackerStore.getState().patterns[0];

      const fires: DubFireEvent[] = [];
      const unsub = subscribeDubRouter((e) => { if (e.source === 'lane') fires.push(e); });

      const player = new DubLanePlayer();
      player.setLane(pattern.dubLane!);
      for (let r = 0; r <= 15; r++) player.onTick(r);   // first pass
      expect(fires).toHaveLength(2);

      // Seek to row 0 → backwards jump → cursor rewinds, second pass re-fires.
      for (let r = 0; r <= 15; r++) player.onTick(r);   // second pass
      unsub();

      expect(fires).toHaveLength(4);
      expect(fires.slice(2).map(f => f.channelId)).toEqual([0, 1]);
    });
  });

  describe('round-trip fidelity', () => {
    it('replay preserves params across fire → record → replay', () => {
      useDubStore.setState({ armed: true });
      setRow(9);
      fire('echoThrow', 0, { intensity: 0.6, amount: 0.42 });

      const pattern = useTrackerStore.getState().patterns[0];
      const fires: DubFireEvent[] = [];
      const unsub = subscribeDubRouter((e) => { if (e.source === 'lane') fires.push(e); });

      const player = new DubLanePlayer();
      player.setLane(pattern.dubLane!);
      for (let r = 0; r <= 10; r++) player.onTick(r);
      unsub();

      expect(fires).toHaveLength(1);
      expect(fires[0].params.intensity).toBe(0.6);
      expect(fires[0].params.amount).toBe(0.42);
      // Replay fires at its *recorded* row, not the current transport row.
      expect(fires[0].row).toBe(9);
    });
  });
});
