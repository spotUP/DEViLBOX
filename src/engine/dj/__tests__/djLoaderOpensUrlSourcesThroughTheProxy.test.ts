/**
 * Regression: DJTrackLoader understood only modland:/hvsc:/local: sources, so
 * a playlist entry whose source is a URL (hippoplayer.se, AmigaRemix, ...)
 * fell through to the bare-name cache lookup and never loaded. It now opens
 * it as a `url` song source at the server proxy, and refuses a host the proxy
 * does not serve with a reason the playlist shows.
 */
import { describe, it, expect, vi } from 'vitest';

// Keep the audio engine out: only the source resolution is under test.
vi.mock('../DJEngine', () => ({ getDJEngine: vi.fn() }));
vi.mock('../DJPipeline', () => ({ getDJPipeline: vi.fn(), analysisFromCachedAudio: vi.fn() }));
vi.mock('@/lib/song/openSong', () => ({ openDeckTrack: vi.fn() }));
vi.mock('../DJAudioCache', () => ({ getCachedAudioByFilename: vi.fn() }));
vi.mock('@/stores/useDJStore', () => ({ useDJStore: { getState: vi.fn() } }));

describe('DJ loader opens URL sources through the proxy', () => {
  it('a hippoplayer.se /data/Modules entry opens at the proxy /webdata path', async () => {
    const { remoteTrackSource } = await import('../DJTrackLoader');
    const remote = remoteTrackSource('http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/mozart is a fake.mod');
    expect(remote?.name).toBe('mozart is a fake.mod');
    expect(remote?.ref).toEqual({
      kind: 'url',
      url: '/api/remote/hippoplayer.se/webdata/Modules/Protracker/M/M-Litz/mozart%20is%20a%20fake.mod',
      name: 'mozart is a fake.mod',
    });
  });

  it('Modland stays a modland open', async () => {
    const { remoteTrackSource } = await import('../DJTrackLoader');
    expect(remoteTrackSource('modland:pub/modules/Protracker/DWB/cloudwalker 777.mod')?.ref)
      .toEqual({ kind: 'modland', path: 'pub/modules/Protracker/DWB/cloudwalker 777.mod' });
  });

  it('a live stream is refused with the reason the playlist shows', async () => {
    const { remoteTrackSource } = await import('../DJTrackLoader');
    expect(() => remoteTrackSource('http://ice1.somafm.com/groovesalad-256-mp3'))
      .toThrow('Cannot load (source not supported): ice1.somafm.com');
  });
});
