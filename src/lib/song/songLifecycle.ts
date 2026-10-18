/**
 * songLifecycle - a song leaves before the next one is parsed.
 *
 * Every opener runs inside withSongLoad(): the outgoing song is unloaded FIRST
 * (audio stopped, engine subscriptions released, scope / meter / position
 * stores cleared, generation bumped), then the new file is read, scanned and
 * parsed in silence. Before this the old song kept playing through the whole
 * UADE scan, and a late waveform message from the old engine switched the
 * oscilloscope store back on, freezing the meters on the last frame.
 *
 * A load that fails leaves silence (owner decision D3).
 */
import { useSongLoadStore } from '@/stores/useSongLoadStore';
import { useOscilloscopeStore } from '@/stores/useOscilloscopeStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { getToneEngine } from '@/engine/ToneEngine';
import { releaseEngineSubscriptions } from '@/engine/replayer/NativeEngineRouting';
import { useFormatStore } from '@/stores/useFormatStore';

/** The generation of the song that is current now. */
export function currentSongGeneration(): number {
  return useSongLoadStore.getState().generation;
}

/** Stop everything that plays the outgoing song and clear what showed it. */
export async function unloadSong(): Promise<void> {
  // Synchronous part first: the stores clear and the fence goes up before any await.
  const generation = currentSongGeneration() + 1;
  useSongLoadStore.setState({ generation });
  useOscilloscopeStore.getState().unload(generation);
  useWasmPositionStore.getState().clear();
  // The song's header info belongs to the song: only some openers set it, so
  // one left over showed a SID's title and subsongs for the next song (U4.6).
  useFormatStore.getState().clearSongInfo();

  useTransportStore.getState().stop();
  getToneEngine().releaseAll();
  try {
    const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
    getTrackerReplayer().stop();
  } catch { /* replayer not initialized yet */ }
  try {
    const { getAdPlugPlayer } = await import('@/lib/import/AdPlugPlayer');
    getAdPlugPlayer().stop();
  } catch { /* player may not be initialized */ }
  releaseEngineSubscriptions();
}

/**
 * Run an opener: unload the outgoing song, mark the load in flight, and clear
 * the mark when it ends - success or failure.
 */
export async function withSongLoad<T>(label: string, load: () => Promise<T>, opts?: { silent?: boolean }): Promise<T> {
  const first = useSongLoadStore.getState().depth === 0;
  // `silent` goes up with depth, so the panel never shows for the unload of a silent load.
  useSongLoadStore.setState((s) => ({
    depth: s.depth + 1,
    label: first ? label : s.label,
    ...(first ? { phase: 'unload' as const, startedAt: performance.now(), silent: opts?.silent ?? false } : {}),
  }));
  try {
    if (first) {
      await unloadSong();
      useSongLoadStore.setState({ phase: 'acquire' });
      useSongLoadStore.setState({ unloadedForLoad: true });
    }
    return await load();
  } finally {
    useSongLoadStore.setState((s) => {
      const depth = s.depth - 1;
      return depth === 0 ? { depth, label: '', unloadedForLoad: false, phase: 'idle' as const, interactive: true, cancelled: false, silent: false, cancel: null } : { depth };
    });
  }
}
