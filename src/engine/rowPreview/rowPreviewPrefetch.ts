/**
 * Cursor prefetch (D12): while the song is stopped, a move of the pattern cursor asks the row-preview worker to render
 * the row under it in the background, so Enter on a far jump answers from what is rendered instead of waiting for the
 * player to run up to the row (250-500 ms three minutes in). Debounced; nothing while the transport plays.
 */
import { useCursorStore } from '@stores/useCursorStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';

export const ROW_PREFETCH_DELAY_MS = 150;

export interface RowPrefetchDeps {
  /** Render the row (songPos, row) ahead; the default asks the engine that plays the loaded song, if any. */
  prepare(songPos: number, row: number): void;
  delayMs?: number;
}

async function prepareLoadedSongRow(songPos: number, row: number): Promise<void> {
  const [{ rowPreviewRoute, prepareNativeRow }, { useFormatStore }, { useInstrumentStore }, { liveTrackerSong }] = await Promise.all([
    import('@engine/replayer/NativeEngineRouting'),
    import('@stores/useFormatStore'),
    import('@stores/useInstrumentStore'),
    import('@/lib/song/liveSong'),
  ]);
  if (rowPreviewRoute(useFormatStore.getState() as unknown as Record<string, unknown>, useInstrumentStore.getState().instruments, useTransportStore.getState().isPlaying) !== 'engine') return;
  await prepareNativeRow(liveTrackerSong(), songPos, row);
}

/** Subscribe to the cursor; returns the unsubscribe. Mounted once, where the pattern editor view mounts. */
export function startRowPreviewPrefetch(deps: RowPrefetchDeps = {
  prepare: (songPos, row) => { void prepareLoadedSongRow(songPos, row).catch((err) => console.error('[rowPreviewPrefetch]', err)); },
}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (useTransportStore.getState().isPlaying) return;
      deps.prepare(useTrackerStore.getState().currentPositionIndex, useCursorStore.getState().cursor.rowIndex);
    }, deps.delayMs ?? ROW_PREFETCH_DELAY_MS);
  };
  const offCursor = useCursorStore.subscribe((s, prev) => { if (s.cursor.rowIndex !== prev.cursor.rowIndex) schedule(); });
  const offPosition = useTrackerStore.subscribe((s, prev) => { if (s.currentPositionIndex !== prev.currentPositionIndex) schedule(); });
  return () => {
    offCursor();
    offPosition();
    if (timer !== null) clearTimeout(timer);
  };
}
