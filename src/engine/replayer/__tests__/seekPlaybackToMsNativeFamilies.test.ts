/**
 * I180d: a t=30000 share link reaches each family's native time seek, or the family reports it cannot seek.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sid = vi.hoisted(() => ({ current: null as null | { seek: ReturnType<typeof vi.fn> } }));
const engineName = vi.hoisted(() => ({ current: 'tracker' }));
const nativeSeek = vi.hoisted(() => vi.fn((_key: string, _ms: number) => true));

vi.mock('../NativeEngineRouting', () => ({
  getActiveC64SidEngine: () => sid.current,
  playingEngineFromStores: () => engineName.current,
  seekNativeEngineToMs: (key: string, ms: number) => (key === 'Nuade' ? nativeSeek(key, ms) : false),
}));
vi.mock('../../TrackerReplayer', () => ({ getTrackerReplayer: () => ({ seekToMs: () => null }) }));

import { seekPlaybackToMs } from '../seekPlaybackToMs';

beforeEach(() => { sid.current = null; engineName.current = 'tracker'; nativeSeek.mockClear(); });

describe('seekPlaybackToMs native families', () => {
  it('nuade: t=30000 reaches the native seek once with 30000 ms', () => {
    engineName.current = 'Nuade';
    expect(seekPlaybackToMs(30000)).toBe(true);
    expect(nativeSeek).toHaveBeenCalledTimes(1);
    expect(nativeSeek).toHaveBeenCalledWith('Nuade', 30000);
  });

  it.each(['UADE classic', 'Hively', 'MusicLine', 'JamCracker'])('%s has no native seek: reports false, nothing seeks', (name) => {
    engineName.current = name;
    expect(seekPlaybackToMs(30000)).toBe(false);
    expect(nativeSeek).not.toHaveBeenCalled();
  });

  it('SID engine with a seek: t=30000 calls seek(30) once', () => {
    sid.current = { seek: vi.fn(() => true) };
    expect(seekPlaybackToMs(30000)).toBe(true);
    expect(sid.current.seek).toHaveBeenCalledTimes(1);
    expect(sid.current.seek).toHaveBeenCalledWith(30);
  });

  it('SID engine without a seek (jssid, tinyrsid, JSIDPlay2): reports false', () => {
    sid.current = { seek: vi.fn(() => false) };
    expect(seekPlaybackToMs(30000)).toBe(false);
  });
});
