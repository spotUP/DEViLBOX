/**
 * Switching the tune of a command-stream file (lib/import/fileSubsongs): the grid, the instruments
 * and the engine's start tune all belong to one tune, so the file is opened again at the new one
 * through openSong - the same open a drop is, with the song playing again if it was playing.
 */
import { useFormatStore } from '@stores/useFormatStore';
import { useTransportStore } from '@stores/useTransportStore';
import { notify } from '@stores/useNotificationStore';
import { fileSubsongDataFields } from '@/lib/import/fileSubsongs';
import { openSong } from '@/lib/song/openSong';

/** The bytes the loaded song's engine plays, from whichever registered format holds them. */
function loadedBytes(): ArrayBuffer | null {
  const store = useFormatStore.getState() as unknown as Record<string, unknown>;
  for (const field of fileSubsongDataFields()) {
    const value = store[field];
    if (value instanceof ArrayBuffer) return value;
  }
  // Played on nuade the format's own field is gone (withNuade.playOnNuade moved the module to nuadeFileData).
  const nuade = store.nuadeFileData;
  return nuade instanceof ArrayBuffer ? nuade : null;
}

/** Open the loaded file again on tune `index` (0-based). */
export async function reopenAtFileSubsong(index: number): Promise<void> {
  const tunes = useFormatStore.getState().fileSubsongs;
  const bytes = loadedBytes();
  if (!tunes || !bytes || index < 0 || index >= tunes.count || index === tunes.current) return;
  const wasPlaying = useTransportStore.getState().isPlaying;
  const r = await openSong(
    { kind: 'bytes', name: tunes.fileName, bytes: bytes.slice(0) },
    { origin: 'subsong', subsong: index, start: wasPlaying ? 'song' : false },
  );
  if (!r.ok) {
    if (!r.cancelled) notify.error(`Could not open subsong ${index + 1}: ${r.error}`);
    return;
  }
  notify.success(`Subsong ${index + 1}/${tunes.count}`);
}
