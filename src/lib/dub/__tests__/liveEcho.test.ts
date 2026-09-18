/**
 * One press, two sounds.
 *
 * Observed live 2026-09-18 in the performance journal: a single `springSlam`
 * produced two entries at the same row — the user's, and a `lane` copy 125 ms
 * later. With looping on it kept coming back every pass, which sounds exactly
 * like the "fires over and over" complaint that X14 was opened for.
 *
 * The loop: `DubRecorder` writes the move as an automation point AT THE ROW
 * CURRENTLY PLAYING, and `TrackerReplayer.applyAutomationForRow` rebuilds the
 * automation table from the store on EVERY row before processing it. The point
 * the press just wrote is therefore in the table by the next tick and fires
 * straight back as playback.
 *
 * The guard must not silence a genuine replay — a recorded take playing back
 * on a later pass is the entire point of recording.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LiveEchoGuard, LIVE_ECHO_WINDOW_MS } from '../liveEcho';

const slam = { moveId: 'springSlam', row: 31 };
const throwCh1 = { moveId: 'echoThrow', channelId: 1, row: 8 };

describe('the echo of a press is dropped', () => {
  it('recognises the replay that lands a tick later', () => {
    const g = new LiveEchoGuard();
    g.noteLive(slam, 1000);
    expect(g.isEcho(slam, 1125)).toBe(true);
  });

  it('matches on move, channel and row together', () => {
    const g = new LiveEchoGuard();
    g.noteLive(throwCh1, 1000);
    expect(g.isEcho({ ...throwCh1, channelId: 2 }, 1050)).toBe(false);
    expect(g.isEcho({ ...throwCh1, moveId: 'springSlam' }, 1050)).toBe(false);
    expect(g.isEcho({ ...throwCh1, row: 9 }, 1050)).toBe(false);
    expect(g.isEcho(throwCh1, 1050)).toBe(true);
  });

  it('treats a global move and a channel move as different fires', () => {
    const g = new LiveEchoGuard();
    g.noteLive({ moveId: 'springSlam', row: 4 }, 1000);
    expect(g.isEcho({ moveId: 'springSlam', channelId: 0, row: 4 }, 1010)).toBe(false);
  });

  it('tolerates the fractional row a non-quantized fire carries', () => {
    const g = new LiveEchoGuard();
    g.noteLive({ moveId: 'springSlam', row: 31.2 }, 1000);
    expect(g.isEcho({ moveId: 'springSlam', row: 30.9 }, 1050)).toBe(true);
  });
});

describe('a genuine replay still plays', () => {
  it('fires when the take comes round again', () => {
    const g = new LiveEchoGuard();
    g.noteLive(slam, 1000);
    expect(g.isEcho(slam, 1000 + LIVE_ECHO_WINDOW_MS + 1)).toBe(false);
  });

  it('is a window far shorter than a pattern pass', () => {
    // A row at 125 BPM / speed 12 is about 115 ms. The window has to cover the
    // next tick and some jitter, and nothing like a lap of the pattern.
    expect(LIVE_ECHO_WINDOW_MS).toBeGreaterThan(115);
    expect(LIVE_ECHO_WINDOW_MS).toBeLessThan(1000);
  });

  it('silences the echo once, not every pass after it', () => {
    const g = new LiveEchoGuard();
    g.noteLive(slam, 1000);
    expect(g.isEcho(slam, 1100)).toBe(true);    // the echo
    expect(g.isEcho(slam, 1200)).toBe(false);   // a second point is real
  });

  it('never suppresses a lane fire nobody pressed', () => {
    const g = new LiveEchoGuard();
    expect(g.isEcho(slam, 1000)).toBe(false);
  });
});

describe('it does not grow without bound over a long session', () => {
  it('sweeps entries that are past the window', () => {
    const g = new LiveEchoGuard();
    for (let i = 0; i < 200; i++) {
      g.noteLive({ moveId: 'springSlam', row: i }, i * 10);
    }
    expect(g.size).toBeLessThanOrEqual(64);
  });

  it('clears on demand', () => {
    const g = new LiveEchoGuard();
    g.noteLive(slam, 1000);
    g.clear();
    expect(g.size).toBe(0);
    expect(g.isEcho(slam, 1010)).toBe(false);
  });
});

describe('wiring contract — the guard sits in the router', () => {
  const router = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'dub', 'DubRouter.ts'), 'utf8',
  );

  it('is consulted for lane fires and fed by live ones', () => {
    expect(router).toContain('_liveEcho.isEcho(echoKey, nowMs)');
    expect(router).toContain('_liveEcho.noteLive(echoKey, nowMs)');
  });

  it('drops the echo before the move executes, not after', () => {
    // Executing and then discarding would still make the sound.
    const guardAt = router.indexOf('_liveEcho.isEcho');
    const executeAt = router.indexOf('move.execute(ctx)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(executeAt).toBeGreaterThan(guardAt);
  });

  it('lives in the router because that is where every path converges', () => {
    // Live, lane and cell-decoded fires all pass through here; the recorder
    // and the player each see only their own half.
    expect(router).toContain("if (source === 'lane')");
  });
});
