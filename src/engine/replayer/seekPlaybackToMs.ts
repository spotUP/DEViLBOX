/**
 * Seek the playing song to a time in milliseconds: the one entry point for time seeks (Selecta share links, ?t=).
 *
 * Per playback family:
 *  - tracker replayer (including libopenmpt playback and tracker-driven native engines): TrackerReplayer.seekToMs,
 *    ms converted to (songPos, row) from the song's speed/tempo timing;
 *  - C64 SID on websid / websidplay: emu_seek_position (C64SIDEngine.seek); jssid, tinyrsid and JSIDPlay2 have none;
 *  - nuade: the engine's native seek (NuadeEngine.seekToMs -> _nw_seek), applied before its play() when not yet
 *    started (seekNativeEngineToMs);
 *  - every other family (UADE, Hively, MusicLine, JamCracker, other WASM engines, other SID engines) has no
 *    time seek exposed (I180d: no WASM export, no worklet message): playback stays at the start, this returns false.
 */
import { getTrackerReplayer } from '../TrackerReplayer';
import { getActiveC64SidEngine, playingEngineFromStores, seekNativeEngineToMs } from './NativeEngineRouting';
import { useFormatStore } from '@/stores/useFormatStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

/** True when the playback moved to `ms`; false when this song's engine cannot seek by time. */
export function seekPlaybackToMs(ms: number): boolean {
  const sid = getActiveC64SidEngine();
  if (sid) {
    return sid.seek(ms / 1000);
  }
  const engine = playingEngineFromStores(
    useFormatStore.getState() as unknown as Record<string, unknown>,
    useInstrumentStore.getState().instruments,
  );
  if (engine !== 'tracker') return seekNativeEngineToMs(engine, ms);
  return getTrackerReplayer().seekToMs(ms) !== null;
}
