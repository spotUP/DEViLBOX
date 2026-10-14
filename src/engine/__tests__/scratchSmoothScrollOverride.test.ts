/**
 * SCRATCH-SMOOTH-SCROLL-OVERRIDE: a scratch used to switch Smooth Scrolling on by writing the
 * saved preference (and restoring it after), so a crash mid-scratch left it saved on. The scratch
 * is now a transient override: the preference is never written, the view still scrolls smoothly.
 */
import { describe, it, expect, vi } from 'vitest';
import { useSettingsStore } from '@stores/useSettingsStore';
import { getEffectiveSmoothScrolling } from '@stores/effectiveSmoothScrolling';

vi.mock('../TrackerReplayer', () => ({ getTrackerReplayer: () => null }));
vi.mock('../ToneEngine', () => ({ getToneEngine: () => ({}) }));
vi.mock('../dj/DeckScratchBuffer', () => ({ DeckScratchBuffer: class {}, TRACKER_SCRATCH_BUFFER_ID: 'x' }));

function fakeReplayer() {
  return {
    isSuppressNotes: false, setSuppressNotes: vi.fn(),
    isPlaying: () => true, getStateAtTime: () => ({ row: 0, pattern: 0 }),
    pauseNativeEnginesForScratch: vi.fn(), resumeNativeEnginesAfterScratch: vi.fn(),
    setTempoMultiplier: vi.fn(), setPitchMultiplier: vi.fn(), resyncSchedulerToNow: vi.fn(),
    getFullOutput: () => ({ gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn() } }),
  };
}

describe('scratch and Smooth Scrolling', () => {
  it('scrolls smoothly during a scratch without changing the saved setting', async () => {
    const { TrackerScratchController } = await import('../TrackerScratchController');
    const sc = new TrackerScratchController() as unknown as {
      enterScratchMode(r: unknown): void; exitScratchMode(r: unknown): void;
      scratchBufferReady: boolean; startPhysicsLoop(): void; engageScratchAudio(r: unknown): void;
    };
    sc.scratchBufferReady = true;
    sc.startPhysicsLoop = () => {};
    sc.engageScratchAudio = () => {};
    useSettingsStore.getState().setSmoothScrolling(false);
    const r = fakeReplayer();
    sc.enterScratchMode(r);
    expect(getEffectiveSmoothScrolling()).toBe(true);
    expect(useSettingsStore.getState().smoothScrolling).toBe(false);
    expect(JSON.parse(localStorage.getItem('devilbox-settings') ?? '{"state":{}}').state.smoothScrolling ?? false).toBe(false);
    sc.exitScratchMode(r);
    expect(getEffectiveSmoothScrolling()).toBe(false);
    expect(useSettingsStore.getState().smoothScrolling).toBe(false);
  }, 60000);

  it('a saved Smooth Scrolling stays on after a scratch', () => {
    useSettingsStore.getState().setSmoothScrolling(true);
    expect(getEffectiveSmoothScrolling()).toBe(true);
  });
});
