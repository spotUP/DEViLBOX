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
  closeStartDialog, startStartupJingle, startupDialog, startupTipsModal, whenStartupJingleDone,
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

  it('holds song loads from page load, plays on the dialog close, and releases when the jingle ends', async () => {
    beginStartupSequence();
    releasePreload(); // decoded at page load, before any gesture
    await Promise.resolve(); await Promise.resolve();
    expect(holding()).toBe(true);

    useUIStore.getState().openModal('tips');
    closeStartDialog();
    await Promise.resolve(); await Promise.resolve();

    expect(useUIStore.getState().modalOpen).toBeNull();
    expect(log).toEqual(expect.arrayContaining(['unlock', 'jingle-play']));
    expect(holding()).toBe(true); // still playing

    endCb!(); // jingle-end event
    expect(holding()).toBe(false);
    expect(useUIStore.getState().postJingleActive).toBe(true);
  });

  it('closeStartDialog unlocks audio once, synchronously, and ignores later closes', () => {
    beginStartupSequence(); releasePreload();
    closeStartDialog();
    expect(log.filter((l) => l === 'unlock')).toHaveLength(1);
    closeStartDialog();
    expect(log.filter((l) => l === 'unlock')).toHaveLength(1);
  });

  it('startupTipsModal: changelog on a new build, tips otherwise, never off', () => {
    expect(startupTipsModal('b1')).toEqual({ initialTab: 'tips' });
    expect(startupTipsModal('b2')).toEqual({ initialTab: 'changelog' });
    localStorage.setItem('show-tips-at-startup', 'false');
    expect(startupTipsModal('b1')).toEqual({ initialTab: 'tips' });
  });

  it('startupDialog: collab modal for a ?collab= code of 6+ characters, tips otherwise', () => {
    expect(startupDialog('b1', '?collab=ABCDEF')).toEqual({ modal: 'collab', collabCode: 'ABCDEF' });
    expect(startupDialog('b1', '?collab=AB')).toMatchObject({ modal: 'tips' });
    expect(startupDialog('b1', '')).toEqual({ modal: 'tips', initialTab: 'tips' });
  });

  it('a song load (whenStartupJingleDone) waits for the jingle to end', async () => {
    beginStartupSequence(); releasePreload();
    await Promise.resolve(); await Promise.resolve();
    await startStartupJingle();
    let loaded = false;
    const load = whenStartupJingleDone().then(() => { loaded = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(loaded).toBe(false); // jingle playing: the load is held
    endCb!();
    await load;
    expect(loaded).toBe(true);
  });

  it('a song load does not wait when the jingle setting is off', async () => {
    useSettingsStore.setState({ welcomeJingleEnabled: false });
    beginStartupSequence();
    await whenStartupJingleDone();
  });

  it('with the jingle setting off nothing waits', () => {
    useSettingsStore.setState({ welcomeJingleEnabled: false });
    beginStartupSequence();
    expect(holding()).toBe(false);
  });
});
