/**
 * Selecta share links opened by the web app (ledger I180a, design D-M3-11).
 *
 * Producer: Selecta src/library/share.c sel_share_format_devilbox:
 *   ?song=<enc "source/path">[&sub=<n>][&t=<ms>]   ?playlist=<enc "source/id">   ?view=<name>
 * `t` is MILLISECONDS (SEL_SHARE_DEVILBOX t_ms), `sub` the subsong number.
 * The song opens through openSong, the one door (no loader of its own).
 */
import { openSong, type SongSourceRef } from '@/lib/song/openSong';
import { notify } from '@/stores/useNotificationStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { useUIStore } from '@/stores/useUIStore';

export type SelectaLink =
  | { kind: 'song'; source: string; path: string; sub?: number; tMs?: number }
  | { kind: 'playlist'; source: string; id: string }
  | { kind: 'view'; name: string };

function uint(v: string | null): number | undefined {
  return v !== null && /^\d+$/.test(v) ? Number(v) : undefined;
}

/** "source/rest" to its two halves; null when either is empty. */
function splitSource(s: string): { source: string; rest: string } | null {
  const i = s.indexOf('/');
  return i > 0 && i < s.length - 1 ? { source: s.slice(0, i), rest: s.slice(i + 1) } : null;
}

/** The link a location.search carries, or null when it carries none (song wins over playlist over view, as the producer parses). */
export function parseSelectaLink(search: string): SelectaLink | null {
  const q = new URLSearchParams(search);
  const song = q.get('song');
  if (song !== null) {
    const p = splitSource(song);
    if (!p) return null;
    return { kind: 'song', source: p.source, path: p.rest, sub: uint(q.get('sub')), tMs: uint(q.get('t')) };
  }
  const playlist = q.get('playlist');
  if (playlist !== null) {
    const p = splitSource(playlist);
    return p ? { kind: 'playlist', source: p.source, id: p.rest } : { kind: 'playlist', source: '', id: playlist };
  }
  const view = q.get('view');
  return view ? { kind: 'view', name: view } : null;
}

async function songSource(source: string, path: string): Promise<SongSourceRef | null> {
  if (source === 'modland') return { kind: 'modland', path };
  if (source === 'hvsc') {
    const { downloadHVSCFile } = await import('@/lib/hvscApi');
    return { kind: 'bytes', name: path.split('/').pop() ?? path, bytes: await downloadHVSCFile(path) };
  }
  return null;
}

/** Acts on a link. Returns once the song is open (or the notice shown). */
export async function openSelectaLink(link: SelectaLink): Promise<void> {
  if (link.kind === 'view') return; // the ?view handler in App already switches the view
  if (link.kind === 'playlist') {
    const st = useDJPlaylistStore.getState();
    const hit = st.playlists.find((p) => p.id === link.id || p.name === link.id);
    if (!hit) {
      notify.warning(`Shared playlist "${link.id}" was not found in this library`);
      return;
    }
    st.setActivePlaylist(hit.id);
    useUIStore.getState().setActiveView('dj');
    return;
  }
  try {
    const src = await songSource(link.source, link.path);
    if (!src) {
      notify.warning(`Shared song source "${link.source}" is not supported here`);
      return;
    }
    const r = await openSong(src, { origin: link.source === 'hvsc' ? 'hvsc' : 'modland', subsong: link.sub, start: 'song', startAtMs: link.tMs });
    if (!r.ok) {
      notify.error(`Could not open shared song: ${r.error}`);
      return;
    }
    // t is milliseconds. A family without a time seek (see seekPlaybackToMs) plays from the start.
    // The seek ran before play() when the engine allowed it; only engines that exist once playing seek here.
    if (link.tMs !== undefined && r.started && !r.seeked) {
      const { seekPlaybackToMs } = await import('@engine/replayer/seekPlaybackToMs');
      seekPlaybackToMs(link.tMs);
    }
  } catch (err) {
    notify.error(`Could not open shared song: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** AppRouter calls this once on mount with window.location.search. */
export function handleSelectaLinkOnBoot(search: string): void {
  const link = parseSelectaLink(search);
  if (link) void openSelectaLink(link);
}
