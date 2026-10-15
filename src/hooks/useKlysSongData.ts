/**
 * useKlysSongData - fills klysNative with the song's real patterns, sequences and instruments.
 *
 * The klystrack parser reads only the header; the WASM engine reads the rest. This loads the song into
 * KlysEngine for its data (the engine posts 'songData', which klysSongData.ts writes into the store - the one
 * writer). It does not play and does not route audio: playback is started and routed by the transport
 * (startNativeEngines), like every other format (the view used to connect the engine straight to the speakers,
 * bypassing the master chain and doubling the routed signal while playing).
 *
 * A song already loaded for this file data, or one playing, is not loaded again (remounting the view mid-song
 * would restart the engine).
 */
import { useEffect } from 'react';
import { useFormatStore } from '@stores/useFormatStore';
import { useTransportStore } from '@stores/useTransportStore';

const loadedFor = new WeakSet<ArrayBuffer>();

export function useKlysSongData(): void {
  const klysFileData = useFormatStore((s) => s.klysFileData);

  useEffect(() => {
    if (!klysFileData || loadedFor.has(klysFileData)) return;
    if (useTransportStore.getState().isPlaying) return;
    let cancelled = false;
    void (async () => {
      const { KlysEngine } = await import('@/engine/klystrack/KlysEngine');
      const engine = KlysEngine.getInstance();
      await engine.ready();
      if (cancelled) return;
      try {
        await engine.loadSong(klysFileData.slice(0));
        loadedFor.add(klysFileData);
      } catch (err) {
        console.error('[useKlysSongData] the engine could not load the song:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [klysFileData]);
}
