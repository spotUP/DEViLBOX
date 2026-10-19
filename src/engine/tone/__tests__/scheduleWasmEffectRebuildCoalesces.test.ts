/**
 * "Slot 0: ch4 -> Neural" was rebuilt twice per play, 80 ms apart: the
 * debounce only covered the wait, so a trigger landing while a rebuild ran
 * started a second, overlapping one. Triggers must coalesce into sequential
 * rebuilds, never concurrent ones.
 */
import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ running: 0, maxRunning: 0, rebuilds: 0 }));

vi.mock('../ChannelRoutedEffects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ChannelRoutedEffects')>()),
  refreshChannelIsolation: async () => ({ engine: {} }),
  getChannelRoutedEffectsManager: () => ({
    setStripRouter: () => {},
    rebuild: async () => {
      state.rebuilds++;
      state.running++;
      state.maxRunning = Math.max(state.maxRunning, state.running);
      await new Promise((r) => setTimeout(r, 120));
      state.running--;
    },
  }),
}));
vi.mock('../../ToneEngine', () => ({ getToneEngine: () => ({ masterEffectsInput: {}, setChannelStripDestination: () => {} }) }));

import { scheduleWasmEffectRebuild } from '@stores/useMixerStore';

describe('scheduleWasmEffectRebuild coalesces', () => {
  it('never overlaps rebuilds and runs one per burst of triggers', async () => {
    scheduleWasmEffectRebuild();
    await new Promise((r) => setTimeout(r, 80)); // rebuild 1 now running
    scheduleWasmEffectRebuild();
    scheduleWasmEffectRebuild();
    await new Promise((r) => setTimeout(r, 500));
    expect(state.maxRunning).toBe(1);
    expect(state.rebuilds).toBe(2); // the in-flight one, plus ONE for the later burst
  });
});
