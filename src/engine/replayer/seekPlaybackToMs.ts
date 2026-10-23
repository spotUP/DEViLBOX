/**
 * Seek the playing song to a time in milliseconds: the one entry point for time seeks (Selecta share links, ?t=).
 *
 * Per playback family:
 *  - tracker replayer (including libopenmpt playback and tracker-driven native engines): TrackerReplayer.seekToMs,
 *    ms converted to (songPos, row) from the song's speed/tempo timing;
 *  - C64 SID on JSIDPlay2: the engine's native time seek (C64SIDEngine.seek);
 *  - every other family (UADE, Hively, MusicLine, JamCracker, other WASM engines, other SID engines) has no
 *    time seek exposed: playback stays at the start and this returns false.
 */
import { getTrackerReplayer } from '../TrackerReplayer';
import { getActiveC64SidEngine, playingEngineFromStores } from './NativeEngineRouting';
import { useFormatStore } from '@/stores/useFormatStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

/** True when the playback moved to `ms`; false when this song's engine cannot seek by time. */
export function seekPlaybackToMs(ms: number): boolean {
  const sid = getActiveC64SidEngine();
  if (sid) {
    if (sid.getEngineInfo().type !== 'jsidplay2') return false;
    sid.seek(ms / 1000);
    return true;
  }
  const engine = playingEngineFromStores(
    useFormatStore.getState() as unknown as Record<string, unknown>,
    useInstrumentStore.getState().instruments,
  );
  if (engine !== 'tracker') return false;
  return getTrackerReplayer().seekToMs(ms) !== null;
}
