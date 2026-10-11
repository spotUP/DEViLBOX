/**
 * Offline renders that schedule an action with `ctx.suspend(t)` before
 * `startRendering()` (scratchRecordRing, scratchRingReadsStaticRecord,
 * djScopesShowTheHeardSignal, sampleLoopEditReachesPlayers, dubBusRig) rely on
 * the spec rule that such a suspend is honoured.
 *
 * node-web-audio-api runs `suspend` and `startRendering` as two futures on its
 * tokio runtime. With several runtime workers they are polled in either order;
 * when `startRendering` is polled first it takes the renderer and the suspend
 * rejects with "InvalidStateError - cannot suspend when rendering has already
 * started" (surfaced as "Error in async function"). The scheduled action never
 * runs and the render comes out silent: the SCR-P2.4 rate -1 failure in the
 * pre-push gate and in CI (2026-10-11), 85 of 1500 renders under load.
 * vite.config.ts gives the test runtime a single worker
 * (TOKIO_WORKER_THREADS=1), which polls the futures in the order they were
 * issued.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';

const SR = 48000;
const RENDERS = 1500;

describe('an offline suspend scheduled before startRendering is honoured', () => {
  beforeAll(() => { installRealWebAudio(); });

  it(`${RENDERS} renders in a row: every suspend fires, none is rejected`, async () => {
    let fired = 0;
    const rejected: string[] = [];
    for (let i = 0; i < RENDERS; i++) {
      const ctx = new OfflineAudioContext(1, 1280, SR);
      const src = ctx.createConstantSource();
      src.connect(ctx.destination);
      src.start();
      const suspended = ctx.suspend(640 / SR).then(
        () => { fired++; return ctx.resume(); },
        (err: unknown) => { rejected.push(String((err as Error)?.message ?? err)); },
      );
      await ctx.startRendering();
      await suspended;
    }
    expect(rejected, 'suspends rejected because rendering started first').toEqual([]);
    expect(fired).toBe(RENDERS);
  });
});
