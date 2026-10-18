/**
 * Reachability: a start opens exactly ONE blocking dialog, closing it through
 * the real MCP door (dismiss_modal, the same close handler the dialogs use) is
 * the start gesture, and a song load queued during boot lands after the silent
 * restore. Sentinel: the jingle engine's unlock call count.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const unlocks: string[] = [];
let endCb: (() => void) | null = null;
vi.mock('@engine/jingle/JingleEngine', () => ({
  STARTUP_JINGLE_URL: '/devilbox1.mp3',
  getJingleEngine: () => ({
    preload: () => Promise.resolve(),
    isReady: () => true,
    unlock: () => unlocks.push('unlock'),
    play: () => {},
    onEnd: (cb: () => void) => { endCb = cb; },
  }),
}));
const joins: string[] = [];
vi.mock('@stores/useCollaborationStore', () => ({
  useCollaborationStore: { getState: () => ({ joinRoom: (code: string) => joins.push(code) }) },
}));
vi.mock('@engine/jingle/JinglePatterns', () => ({ injectMouthPatterns: () => {}, teardownMouthPatterns: () => {} }));

import { dispatchBridgeCall } from '../../../bridge/MCPBridge';
import { useUIStore } from '@stores/useUIStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import {
  beginStartupSequence, openStartDialog, resetStartupSequenceForTest, whenStartupJingleDone,
} from '../startupSequence';
import { beginBootRestore, endBootRestore, resetBootRestoreForTest, whenBootRestoreDone } from '../bootRestore';

describe('one start dialog', () => {
  beforeEach(() => {
    unlocks.length = 0; joins.length = 0; endCb = null;
    resetStartupSequenceForTest(); resetBootRestoreForTest();
    localStorage.clear();
    useUIStore.getState().closeModal();
    useUIStore.getState().setStartupJingleStage('off');
    useSettingsStore.setState({ welcomeJingleEnabled: true });
  });

  it.each([
    ['', 'tips'],
    ['?collab=ABCDEF', 'collab'],
  ])('start %j opens exactly the %s dialog; closing it starts the jingle and releases a queued load after the restore', async (search, modal) => {
    beginStartupSequence();
    beginBootRestore();
    window.history.replaceState({}, '', '/' + search);
    openStartDialog('b1');

    const state = await dispatchBridgeCall('get_modal_state', {});
    expect((state as { data: { modalOpen: string } }).data.modalOpen).toBe(modal);
    expect(useUIStore.getState().startupJingleStage).toBe('awaiting-gesture');
    expect(joins).toEqual(modal === 'collab' ? ['ABCDEF'] : []);
    expect(window.location.search).toBe('');

    const order: string[] = [];
    const load = Promise.all([whenStartupJingleDone(), whenBootRestoreDone()]).then(() => order.push('load'));

    const closed = await dispatchBridgeCall('dismiss_modal', {});
    expect((closed as { data: { dismissed: string } }).data.dismissed).toBe(modal);
    expect(unlocks).toEqual(['unlock']);
    expect(useUIStore.getState().modalOpen).toBeNull();

    endCb!(); // jingle ends
    await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual([]); // restore still running: the load waits

    order.push('restore');
    endBootRestore();
    await load;
    expect(order).toEqual(['restore', 'load']);
  });
});
