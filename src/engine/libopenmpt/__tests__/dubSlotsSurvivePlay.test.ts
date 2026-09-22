import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The dub bus was starved: with the song playing at insertIn 0.076 the bus
 * read busInput 0.000001, so every capture-and-play move recorded silence —
 * reverseEcho, backwardReverb and delayTimeThrow. Reported 2026-09-21, fixed,
 * and reported again 2026-09-22.
 *
 * The mechanism: the worklet's `play()` starts with `teardownAllDubSlots_()`,
 * destroying every per-channel send. The engine restored them on a blind
 * `setTimeout(..., 100)` measured from when it POSTED the play message. A
 * 400 KB module takes longer than that to instantiate, so the teardown wiped
 * the slots the rebuild had just made — and the rebuild is single-shot, so the
 * bus stayed starved for the rest of the song. A send transition was the only
 * thing that brought it back, which is why it read as intermittent.
 *
 * The worklet now says when the module exists, and the engine rebuilds then.
 *
 * WHAT THIS TEST IS NOT: it pins the wiring, not the audio. happy-dom has no
 * AudioWorklet and no audio graph, so nothing in this suite can assert that
 * `bus.input` actually receives samples. The check that would have caught this
 * is a RUNTIME one — play a song with sends up, assert busInput is non-silent
 * — and it has to run against real Chrome through the MCP bridge.
 */
const WORKLET = readFileSync(join(process.cwd(), 'public/chiptune3/chiptune3.worklet.js'), 'utf-8');
const ENGINE = readFileSync(join(process.cwd(), 'src/engine/libopenmpt/LibopenmptEngine.ts'), 'utf-8');

const playBody = (): string =>
  WORKLET.slice(WORKLET.indexOf('\tplay(buffer'), WORKLET.indexOf('\tstop() {'));

describe('dub slots are restored after the worklet rebuilds the module', () => {
  it('play() still tears the dub slots down — the reason this is needed', () => {
    expect(playBody()).toContain('this.teardownAllDubSlots_()');
  });

  it('the worklet announces the module once play() has built it', () => {
    const play = playBody();
    const teardown = play.indexOf('teardownAllDubSlots_');
    const ready = play.indexOf("postMessage({ cmd: 'playReady' })");
    expect(ready, 'the worklet never announces the module').toBeGreaterThan(-1);
    expect(
      ready,
      'playReady must come AFTER the teardown, or it announces slots that are about to be destroyed'
    ).toBeGreaterThan(teardown);
  });

  it('the engine rebuilds the dub connections on that announcement', () => {
    const arm = ENGINE.indexOf("case 'playReady':");
    expect(arm, 'the engine ignores playReady').toBeGreaterThan(-1);
    const branch = ENGINE.slice(arm, ENGINE.indexOf('break;', arm));
    expect(branch).toContain('this._rebuildIsolationAfterPlay()');
  });

  it('the timer is a backstop for a stale worklet, not the primary trigger', () => {
    // Worklets are hand-maintained files that HMR never touches, so a cached
    // build with no playReady must still recover — just later.
    expect(ENGINE).toContain('setTimeout(() => this._rebuildIsolationAfterPlay(), 400)');
    expect(ENGINE, 'a 100 ms timer is the race this fix removes')
      .not.toContain('this._rebuildIsolationAfterPlay(), 100');
  });
});
