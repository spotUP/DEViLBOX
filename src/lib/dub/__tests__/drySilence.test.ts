/**
 * A held Drop does not end the song.
 *
 * masterDrop ramps every engine's output gain to zero - the node the
 * SilenceDetector listens on - for up to 40 s; after 5 s of that the
 * detector read "song over" and stopped the engine under the performer's
 * hand (ledger F28). The move now marks the dry as held, and the detector's
 * predicate consults the mark.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { beginDrySilence, drySilencedByDub, _resetDrySilence } from '../drySilence';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => { throw new Error('no tone engine in this test'); } }));
// No live engine in this test; the modules otherwise keep their exports (the
// router imports more than the engine class from each).
vi.mock('@/engine/libopenmpt/LibopenmptEngine', async (orig) => ({ ...(await orig<object>()), LibopenmptEngine: { hasInstance: () => false } }));
vi.mock('@/engine/hively/HivelyEngine', async (orig) => ({ ...(await orig<object>()), HivelyEngine: { hasInstance: () => false } }));
vi.mock('@/engine/uade/UADEEngine', async (orig) => ({ ...(await orig<object>()), UADEEngine: { hasInstance: () => false } }));
vi.mock('@/engine/furnace-dispatch/FurnaceDispatchEngine', async (orig) => ({ ...(await orig<object>()), FurnaceDispatchEngine: { hasInstance: () => false } }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { warning: () => {} } }));

describe('drySilence', () => {
  beforeEach(() => _resetDrySilence());

  it('counts overlapping holds and releases each once', () => {
    const a = beginDrySilence();
    const b = beginDrySilence();
    expect(drySilencedByDub()).toBe(true);
    a(); a();
    expect(drySilencedByDub()).toBe(true);
    b();
    expect(drySilencedByDub()).toBe(false);
  });

  it('is held for the life of a masterDrop and released on dispose', async () => {
    const { masterDrop } = await import('@/engine/dub/moves/masterDrop');
    const bus = { inputNode: { context: { currentTime: 0 } } } as unknown as Parameters<typeof masterDrop.execute>[0]['bus'];
    const handle = masterDrop.execute({ bus, params: {} } as Parameters<typeof masterDrop.execute>[0]);
    expect(handle).not.toBeNull();
    expect(drySilencedByDub()).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(drySilencedByDub()).toBe(true);
    handle!.dispose();
    expect(drySilencedByDub()).toBe(false);
  });

  it('the detector predicate includes it', async () => {
    const { silenceIsNotTheSongs } = await import('@/engine/replayer/performerSilence');
    expect(silenceIsNotTheSongs()).toBe(false);
    const end = beginDrySilence();
    expect(silenceIsNotTheSongs()).toBe(true);
    end();
    expect(silenceIsNotTheSongs()).toBe(false);
  });
});
