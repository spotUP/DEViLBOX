/**
 * libopenmpt isolates channels only as the registered playing engine.
 *
 * A libopenmpt instance left from an earlier MOD still reports available with
 * no module loaded. The resolver returned it for a Hippel song, told the dub
 * bus the song could isolate channels, and the bus silenced its whole-mix
 * fallback - no dub input at all (2026-09-29).
 *
 * The fix for that asked libopenmpt's isPlaying() flag, which worklet 'end'
 * and 'err' messages clear while the song goes on: master effects aimed at
 * channels then played on the whole mix (2026-10-20). TrackerReplayer now
 * registers libopenmpt when it starts the song, and the flag is not asked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mpt = { isAvailable: () => true, isPlaying: vi.fn(() => false) };
vi.mock('../../libopenmpt/LibopenmptEngine', () => ({
  LibopenmptEngine: { hasInstance: () => true, getInstance: () => mpt },
}));
vi.mock('../../pretracker/PreTrackerEngine', () => ({
  PreTrackerEngine: { hasInstance: () => true, getInstance: () => ({ isAvailable: () => true }) },
}));

import { getActiveIsolationEngine, setPlayingIsolationEngine, asIsolationCapable } from '../ChannelRoutedEffects';
import { useFormatStore } from '@stores/useFormatStore';

beforeEach(() => { useFormatStore.setState({ editorMode: 'classic', preTrackerFileData: null } as never); });

describe('classic isolation resolver', () => {
  it('does not claim an idle libopenmpt (or PreTracker) for a song another engine plays', async () => {
    mpt.isPlaying.mockReturnValue(false);
    expect(await getActiveIsolationEngine()).toBeNull();
  });

  it('never claims libopenmpt from its playing flag', async () => {
    mpt.isPlaying.mockReturnValue(true);
    expect(await getActiveIsolationEngine()).toBeNull();
  });
});

describe('the playing engine', () => {
  it('wins over the editor-mode resolver while registered', async () => {
    mpt.isPlaying.mockReturnValue(true);
    const native = { addIsolation() {}, removeIsolation() {}, getWorkletNode: () => null, getAudioContext: () => null, isAvailable: () => true };
    setPlayingIsolationEngine(asIsolationCapable(native));
    expect(await getActiveIsolationEngine()).toBe(native);
    setPlayingIsolationEngine(null);
    expect(await getActiveIsolationEngine()).toBeNull();
  });

  it('is only an isolation engine when it implements the interface', () => {
    expect(asIsolationCapable({ output: {} })).toBeNull();
    expect(asIsolationCapable(null)).toBeNull();
  });
});
