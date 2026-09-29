/**
 * The dub bus takes isolation capability from the engine actually playing.
 *
 * Hippel plays in "classic" mode, whose usual engine (libopenmpt) has
 * per-channel outputs, but through TFMXEngine, which has none. Going by the
 * mode, the bus silenced its whole-mix fallback while no channel tap could
 * open: on Hippel/TFMX songs the dub bus got no input at all (2026-09-29).
 */
import { describe, it, expect, vi } from 'vitest';
import { effectiveChannelIsolation } from '../DubBus';
import { reportPlaybackIsolation } from '../../replayer/NativeEngineRouting';

describe('dub bus isolation follows the playing engine', () => {
  it('an engine report overrides the editor mode', () => {
    expect(effectiveChannelIsolation(true, false)).toBe(false);   // classic mode, TFMX playing
    expect(effectiveChannelIsolation(false, true)).toBe(true);
    expect(effectiveChannelIsolation(true, null)).toBe(true);     // no report: trust the mode
  });

  it('reports "cannot isolate" when no isolation engine resolves for the song', async () => {
    const bus = { setEngineIsolation: vi.fn() };
    await reportPlaybackIsolation(bus, async () => null);
    expect(bus.setEngineIsolation).toHaveBeenCalledWith(false);
  });

  it('reports "isolates" when one does', async () => {
    const bus = { setEngineIsolation: vi.fn() };
    await reportPlaybackIsolation(bus, async () => ({ isAvailable: () => true }));
    expect(bus.setEngineIsolation).toHaveBeenCalledWith(true);
  });
});
