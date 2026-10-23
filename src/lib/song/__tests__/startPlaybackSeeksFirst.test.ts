/**
 * A share link with a time offset seeks BEFORE playback starts, so position 0 is never audible (I180c).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const seekPlaybackToMs = vi.hoisted(() => vi.fn((ms: number) => { calls.push(`seek:${ms}`); return true; }));
const transport = vi.hoisted(() => ({
  setIsLooping: vi.fn((v: boolean) => { calls.push(`loop:${v}`); }),
  play: vi.fn(async () => { calls.push('play'); }),
}));
vi.mock('@/engine/replayer/seekPlaybackToMs', () => ({ seekPlaybackToMs }));
vi.mock('@/stores/useTransportStore', () => ({ useTransportStore: { getState: () => transport } }));

import { startPlayback } from '@/lib/song/startPlayback';

beforeEach(() => { calls.length = 0; seekPlaybackToMs.mockClear(); transport.play.mockClear(); });

describe('startPlayback', () => {
  it('applies the seek before play() is called', async () => {
    const r = await startPlayback('song', 30000);
    expect(calls).toEqual(['seek:30000', 'loop:false', 'play']);
    expect(r.seeked).toBe(true);
  });

  it('reports seeked=false when the engine cannot seek yet, so the caller seeks after the start', async () => {
    seekPlaybackToMs.mockReturnValueOnce(false);
    expect((await startPlayback('song', 500)).seeked).toBe(false);
    expect(transport.play).toHaveBeenCalledTimes(1);
  });

  it('does not seek without an offset', async () => {
    await startPlayback('pattern');
    expect(seekPlaybackToMs).not.toHaveBeenCalled();
    expect(calls).toEqual(['loop:true', 'play']);
  });
});
