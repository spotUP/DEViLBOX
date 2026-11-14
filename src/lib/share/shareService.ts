/**
 * Share a song / open a share link. Logic only; the toolbar button and the play prompt are glue.
 */
import { notify } from '@stores/useNotificationStore';
import { openSong } from '@lib/song/openSong';
import { packShare, unpackShare, type ShareSong } from './shareContainer';
import { inlineFragment, inlineLink, parseShareHash, storedFragment, SHARE_UPLOAD_MAX } from './shareLink';
import { downloadShare, uploadShare, uploadReply } from './shareApi';
import { useSharePromptStore } from './sharePromptStore';
import { currentSongGeneration } from '@/lib/song/songLifecycle';

/** The current song as a ShareSong: its native file when the format has an exporter, else a .dbx. */
async function currentSong(): Promise<{ song: ShareSong; warnings: string[] }> {
  const { exportNativeFile, nativeExportAvailableForLiveSong } = await import('@lib/export/moduleExportService');
  if (await nativeExportAvailableForLiveSong()) {
    const res = await exportNativeFile();
    if (res) {
      return {
        song: { name: res.filename, bytes: res.data, companions: (res.companions ?? []).map((c) => ({ name: c.name, bytes: c.data })) },
        warnings: res.warnings,
      };
    }
  }
  const { songDbxBytes } = await import('@lib/export/exporters');
  const dbx = songDbxBytes();
  return { song: { name: dbx.filename, bytes: dbx.bytes, companions: [] }, warnings: [] };
}

const OWNER_KEYS = 'devilbox.shareOwnerKeys';
/** Share id the open song came from, and that song's load generation; sent as the parent of the next upload. */
let openedFromShare: { id: string; generation: number } | undefined;

/** The parent id, only while the song opened from that share is still the current song. */
function parentShareId(): string | undefined {
  return openedFromShare?.generation === currentSongGeneration() ? openedFromShare.id : undefined;
}

/** Owner keys this browser holds: share id -> key (insertion order, newest last). */
export function ownerKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OWNER_KEYS) || '{}') as Record<string, string>;
  } catch { return {}; }
}

export function rememberOwnerKey(id: string, key: string): void {
  try {
    const all = ownerKeys();
    delete all[id];
    all[id] = key;
    localStorage.setItem(OWNER_KEYS, JSON.stringify(all));
  } catch { /* storage blocked: the key is only needed to read replies */ }
}

/** True while the open song came from a share link (and has not been replaced since). */
export const canSendBack = (): boolean => parentShareId() !== undefined;

/** Send Changes Back: upload the song as currently edited as a reply to the share it came from. */
export async function sendChangesBack(): Promise<void> {
  const id = parentShareId();
  if (!id) { notify.error('This song did not come from a share link.'); return; }
  try {
    const { song, warnings } = await currentSong();
    warnings.forEach((w) => notify.warning(w));
    await uploadReply(id, packShare(song));
    notify.success('Changes sent back to the author');
  } catch (e) {
    notify.error(e instanceof Error ? e.message : 'Sending changes back failed.');
  }
}

/** Copy Author Link: a link holding the newest share's owner key, so the inbox opens on another device. */
export async function copyAuthorLink(): Promise<void> {
  const last = Object.entries(ownerKeys()).pop();
  if (!last) { notify.error('Share a song first; the author link belongs to a link you made.'); return; }
  const link = `${window.location.origin}${window.location.pathname}#author=${last[0]}.${last[1]}`;
  try {
    await navigator.clipboard.writeText(link);
    notify.success('Author link copied. Keep it private: it opens your inbox.');
  } catch {
    useSharePromptStore.getState().showLink(link);
  }
}

/** A #author= link stores its owner key and clears the hash. False when the hash is no author link. */
export function openAuthorHash(hash: string): boolean {
  const m = /^#author=([0-9A-Za-z]{8})\.([A-Za-z0-9_-]{16,64})$/.exec(hash);
  if (!m) return false;
  rememberOwnerKey(m[1], m[2]);
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
  return true;
}

/** Build the link for the song as currently edited. Throws a readable Error when it cannot be shared. */
export async function buildShareLink(): Promise<{ link: string; warnings: string[] }> {
  const { song, warnings } = await currentSong();
  const container = packShare(song);
  const base = `${window.location.origin}${window.location.pathname}`;
  const inline = inlineFragment(container);
  if (inline) {
    // Small songs are uploaded too, so the link also names a server copy; the inline data opens first.
    try {
      const { id, ownerKey } = await uploadShare(container, parentShareId());
      rememberOwnerKey(id, ownerKey);
      return { link: `${base}#share=${inlineLink(inline, id)}`, warnings };
    } catch (e) {
      const why = e instanceof Error ? e.message : 'upload failed';
      return { link: `${base}#share=${inline}`, warnings: [...warnings, `The song could not be saved on the server (${why}). The link still opens it, but has no server copy.`] };
    }
  }
  if (container.length > SHARE_UPLOAD_MAX) throw new Error('This song is over 8 MB, too big to share. Export it as a file instead.');
  const { id, ownerKey } = await uploadShare(container, parentShareId());
  rememberOwnerKey(id, ownerKey);
  return { link: `${base}#share=${storedFragment(id)}`, warnings };
}

/** Open the song a location hash points at (no autoplay), then show the Play prompt. False when the hash is no share link. */
export async function openShareHash(hash: string): Promise<boolean> {
  const ref = parseShareHash(hash);
  if (!ref) return false;
  const clear = () => window.history.replaceState({}, '', window.location.pathname + window.location.search);
  try {
    const container = ref.mode === 'inline' ? ref.container : await downloadShare(ref.id);
    const song = unpackShare(container);
    const companions = new Map(song.companions.map((c) => [c.name, c.bytes.slice().buffer as ArrayBuffer]));
    const result = await openSong(
      { kind: 'bytes', name: song.name, bytes: song.bytes.slice().buffer as ArrayBuffer, companions },
      { origin: 'share' },
    );
    if (!result.ok) throw new Error(result.error);
    openedFromShare = ref.id ? { id: ref.id, generation: currentSongGeneration() } : undefined;
    useSharePromptStore.getState().show(song.name);
    return true;
  } finally {
    clear();
  }
}

/** The Share button: make the link, copy it (or show it when the browser refuses), report what happened. */
export async function shareCurrentSong(): Promise<void> {
  try {
    const { link, warnings } = await buildShareLink();
    warnings.forEach((w) => notify.warning(w));
    try {
      await navigator.clipboard.writeText(link);
      notify.success('Link copied');
    } catch {
      useSharePromptStore.getState().showLink(link);
    }
  } catch (e) {
    notify.error(e instanceof Error ? e.message : 'Sharing failed.');
  }
}
