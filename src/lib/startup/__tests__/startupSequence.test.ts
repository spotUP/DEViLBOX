import { beforeEach, describe, expect, it, vi } from 'vitest';

const log: string[] = [];
let endCb: (() => void) | null = null;
let ready = false;
let releasePreload: () => void = () => {};

vi.mock('@engine/jingle/JingleEngine', () => ({
  STARTUP_JINGLE_URL: '/devilbox1.mp3',
  getJingleEngine: () => ({
    preload: () => new Promise<void>((res) => { releasePreload = () => { ready = true; log.push('decoded'); res(); }; }),
    isReady: () => ready,
    unlock: () => log.push('unlock'),
    play: () => log.push('jingle-play'),
    onEnd: (cb: () => void) => { endCb = cb; },
  }),
}));
vi.mock('@engine/jingle/JinglePatterns', () => ({
  injectMouthPatterns: () => {},
  teardownMouthPatterns: () => {},
}));

import { useUIStore } from '@stores/useUIStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  beginStartupSequence, isStartupHolding, resetStartupSequenceForTest,
  runFirstGesture, startStartupJingle,
} from '../startupSequence';

const holding = () => isStartupHolding(useUIStore.getState().startupJingleStage);

describe('startup sequence: jingle first', () => {
  beforeEach(() => {
    log.length = 0; endCb = null; ready = false;
    resetStartupSequenceForTest();
    localStorage.clear();
    localStorage.setItem('devilbox-seen-version', 'b1');
    useUIStore.getState().setStartupJingleStage('off');
    useSettingsStore.setState({ welcomeJingleEnabled: true });
  });

  it('plays on the dismiss gesture before engine init resolves, and holds the boot prompts until the jingle ends', async () => {
    beginStartupSequence();
    releasePreload(); // decoded at page load, before any gesture
    await Promise.resolve(); await Promise.resolve();
    expect(holding()).toBe(true); // restore prompt / changelog held from page load

    // Tips dismissal is the gesture; the engine init click runs in parallel and is slow.
    let finishInit: () => void = () => {};
    const init = runFirstGesture('b1', () => new Promise<void>((r) => { log.push('init-start'); finishInit = () => { log.push('init-done'); r(); }; }));
    await startStartupJingle();

    expect(log).toContain('jingle-play');
    expect(log).not.toContain('init-done'); // play happened while init is still pending
    expect(holding()).toBe(true); // still held while playing

    finishInit(); await init;
    expect(holding()).toBe(true); // init finishing does not release the prompts

    endCb!(); // jingle-end event
    expect(holding()).toBe(false);
    expect(useUIStore.getState().postJingleActive).toBe(true);
  });

  it('with the tips dialog off, the first gesture (splash click) starts the jingle before engine init', async () => {
    localStorage.setItem('devilbox-seen-version', 'b1');
    localStorage.setItem('show-tips-at-startup', 'false');
    beginStartupSequence(); releasePreload();
    await Promise.resolve(); await Promise.resolve();
    void runFirstGesture('b1', async () => { log.push('init-start'); });
    expect(log.indexOf('jingle-play')).toBeGreaterThan(-1);
    expect(log.indexOf('jingle-play')).toBeLessThan(log.indexOf('init-start'));
  });

  it('with the jingle setting off nothing waits', () => {
    useSettingsStore.setState({ welcomeJingleEnabled: false });
    beginStartupSequence();
    expect(holding()).toBe(false);
  });
});
