/**
 * The classic-mode isolation resolver claims libopenmpt only while it plays.
 *
 * A libopenmpt instance left from an earlier MOD still reports available with
 * no module loaded. The resolver returned it for a Hippel song, told the dub
 * bus the song could isolate channels, and the bus silenced its whole-mix
 * fallback - no dub input at all (2026-09-29).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mpt = { isAvailable: () => true, isPlaying: vi.fn(() => false) };
vi.mock('../../libopenmpt/LibopenmptEngine', () => ({
  LibopenmptEngine: { hasInstance: () => true, getInstance: () => mpt },
}));
vi.mock('../../pretracker/PreTrackerEngine', () => ({
  PreTrackerEngine: { hasInstance: () => true, getInstance: () => ({ isAvailable: () => true }) },
}));

import { getActiveIsolationEngine } from '../ChannelRoutedEffects';
import { useFormatStore } from '@stores/useFormatStore';

beforeEach(() => { useFormatStore.setState({ editorMode: 'classic', preTrackerFileData: null } as never); });

describe('classic isolation resolver', () => {
  it('does not claim an idle libopenmpt (or PreTracker) for a song another engine plays', async () => {
    mpt.isPlaying.mockReturnValue(false);
    expect(await getActiveIsolationEngine()).toBeNull();
  });

  it('claims libopenmpt while it plays the song', async () => {
    mpt.isPlaying.mockReturnValue(true);
    expect(await getActiveIsolationEngine()).toBe(mpt);
  });
});
