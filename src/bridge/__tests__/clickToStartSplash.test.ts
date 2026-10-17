/**
 * The click-to-start splash is visible to an agent over MCP and can be pressed
 * from it. It is rendered from the startup stage, not a store modal, so every
 * dialog report used to miss it (owner, 2026-10-17: "you always fail to see
 * and click the click to start dialog"). Sentinel: the jingle engine's unlock,
 * which only the splash's own gesture calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const unlocks: string[] = [];
vi.mock('@engine/jingle/JingleEngine', () => ({
  STARTUP_JINGLE_URL: '/devilbox1.mp3',
  getJingleEngine: () => ({
    preload: () => Promise.resolve(),
    isReady: () => false,
    unlock: () => unlocks.push('unlock'),
    play: () => {},
    onEnd: () => {},
  }),
}));
vi.mock('@engine/jingle/JinglePatterns', () => ({ injectMouthPatterns: () => {}, teardownMouthPatterns: () => {} }));

import { dispatchBridgeCall } from '../MCPBridge';
import { useUIStore } from '@stores/useUIStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { beginStartupSequence, resetStartupSequenceForTest } from '@lib/startup/startupSequence';

describe('click-to-start splash over MCP', () => {
  beforeEach(() => {
    unlocks.length = 0;
    resetStartupSequenceForTest();
    useUIStore.getState().closeModal();
    useUIStore.getState().setStartupJingleStage('off');
    useSettingsStore.setState({ welcomeJingleEnabled: true });
    beginStartupSequence(); // stage: awaiting-gesture, splash on screen
  });

  it('get_modal_state and every other response name the splash', async () => {
    const modal = await dispatchBridgeCall('get_modal_state', {});
    expect((modal as { data: { startupSplashOpen: boolean } }).data.startupSplashOpen).toBe(true);
    const other = await dispatchBridgeCall('get_ui_state', {});
    expect(other.ok).toBe(true);
    expect((other as { data: { blockingDialog?: string } }).data.blockingDialog).toBe('click-to-start');
  });

  it('dismiss_modal presses it, as its button does, and then nothing names it', async () => {
    const r = await dispatchBridgeCall('dismiss_modal', {});
    expect((r as { data: { dismissed: string } }).data.dismissed).toBe('click-to-start');
    expect(unlocks).toEqual(['unlock']);
    const modal = await dispatchBridgeCall('get_modal_state', {});
    expect((modal as { data: { startupSplashOpen: boolean } }).data.startupSplashOpen).toBe(false);
  });

  it('is not the splash while the tips dialog carries the gesture', async () => {
    useUIStore.getState().openModal('tips');
    const modal = await dispatchBridgeCall('get_modal_state', {});
    expect((modal as { data: { startupSplashOpen: boolean } }).data.startupSplashOpen).toBe(false);
  });
});
