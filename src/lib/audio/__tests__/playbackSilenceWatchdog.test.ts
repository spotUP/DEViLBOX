/**
 * "It says it is playing, and there is no sound."
 *
 * Reported 2026-09-19 mid-session. The evidence: transport playing, rows
 * advancing, every channel audible, `hasModule: true`, `paused: false`, and
 * `lastRenderRms: 0` with `silentReason: "module-rendered-silence"`. Nobody was
 * watching for that, so it stayed invisible until a person noticed the room had
 * gone quiet.
 *
 * The hard part is not detecting silence. It is NOT crying wolf: a version drop
 * takes the entire mix away for bars at a time, and that is the performer
 * working, not failing.
 */

import { describe, it, expect } from 'vitest';
import {
  judgePlaybackSilence,
  describeSilenceVerdict,
  SILENCE_GRACE_SEC,
  type PlaybackSilenceInputs,
} from '../playbackSilenceWatchdog';

function inputs(over: Partial<PlaybackSilenceInputs> = {}): PlaybackSilenceInputs {
  return {
    isPlaying: true,
    rowsAdvancing: true,
    lastRenderRms: 0,
    silentReason: 'module-rendered-silence',
    silentForSec: 30,
    masterMuted: false,
    ...over,
  };
}

describe('the fault it exists for', () => {
  it('reports playing-but-producing-nothing', () => {
    const v = judgePlaybackSilence(inputs());
    expect(v.kind).toBe('stalled');
  });

  it('passes the engine\'s own account through', () => {
    const v = judgePlaybackSilence(inputs());
    expect(v.kind === 'stalled' && v.reason).toBe('module-rendered-silence');
  });

  it('tells a human what to do about it', () => {
    const text = describeSilenceVerdict(judgePlaybackSilence(inputs()));
    expect(text).toMatch(/no audio/);
    expect(text).toMatch(/Stop and play again/);
  });
});

describe('what it must NOT call a fault', () => {
  it('silence while stopped', () => {
    expect(judgePlaybackSilence(inputs({ isPlaying: false })).kind).toBe('ok');
  });

  it('a drop that takes the mix away for a few bars', () => {
    // Four bars at 125 BPM is about 8 s. The grace has to clear that or the
    // performer's best trick raises an alarm every time.
    expect(SILENCE_GRACE_SEC).toBeGreaterThan(8);
    const v = judgePlaybackSilence(inputs({ silentForSec: 8 }));
    expect(v.kind).toBe('watching');
  });

  it('a master the user muted', () => {
    const v = judgePlaybackSilence(inputs({ masterMuted: true }));
    expect(v.kind).toBe('expected');
    expect(v.kind === 'expected' && v.reason).toMatch(/master is muted/);
  });

  it('a transport that is not advancing — a different fault', () => {
    // Claiming this one would send someone looking at the audio engine when
    // the transport is what stopped.
    const v = judgePlaybackSilence(inputs({ rowsAdvancing: false }));
    expect(v.kind).toBe('expected');
    expect(v.kind === 'expected' && v.reason).toMatch(/not advancing/);
  });

  it('audio that is merely quiet', () => {
    expect(judgePlaybackSilence(inputs({ lastRenderRms: 0.0001 })).kind).toBe('ok');
  });

  it('says nothing at all unless it is stalled', () => {
    for (const v of [
      judgePlaybackSilence(inputs({ isPlaying: false })),
      judgePlaybackSilence(inputs({ silentForSec: 1 })),
      judgePlaybackSilence(inputs({ masterMuted: true })),
    ]) {
      expect(describeSilenceVerdict(v)).toBeNull();
    }
  });
});

describe('the boundary', () => {
  it('waits right up to the grace, then reports', () => {
    expect(judgePlaybackSilence(inputs({ silentForSec: SILENCE_GRACE_SEC - 0.1 })).kind)
      .toBe('watching');
    expect(judgePlaybackSilence(inputs({ silentForSec: SILENCE_GRACE_SEC })).kind)
      .toBe('stalled');
  });

  it('still reports when the engine offers no reason', () => {
    const v = judgePlaybackSilence(inputs({ silentReason: null }));
    expect(v.kind === 'stalled' && v.reason).toMatch(/rendering silence/);
  });
});
