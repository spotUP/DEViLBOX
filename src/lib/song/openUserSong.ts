/**
 * openUserSong - a person gave the app a song: a drop, or a pick in a file
 * browser. One function for every such opener (App's drop handler and file
 * browser, the FT2 toolbar's browser): openSong with an interactive origin,
 * which shows the import dialog only when the file has a real choice (owner
 * decision D1), then the outcome told once.
 */
import { openSong } from '@/lib/song/openSong';
import { notify } from '@/stores/useNotificationStore';

export async function openUserSong(
  file: File,
  origin: 'drop' | 'filebrowser',
  companions: Map<string, ArrayBuffer> | undefined,
  fail: (message: string) => void,
): Promise<void> {
  try {
    const opened = await openSong({ kind: 'file', file, companions }, { origin, interactive: true });
    if (opened.ok) {
      if (!opened.notified) notify.success(opened.message);
    } else if (!opened.cancelled) {
      fail(opened.error || `Could not load ${file.name}`);
    }
  } catch (err) {
    console.error(`[openUserSong] ${origin} load threw:`, err);
    fail(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
