import { API_URL } from '@lib/apiBase';

export async function uploadShare(container: Uint8Array, parentId?: string): Promise<{ id: string; ownerKey: string }> {
  const res = await fetch(`${API_URL}/share${parentId ? `?parent=${encodeURIComponent(parentId)}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: container as BodyInit,
  });
  if (res.status === 413) throw new Error('This song is over 8 MB, too big to share. Export it as a file instead.');
  if (res.status === 429) throw new Error('Too many shares from this address. Try again in an hour.');
  if (!res.ok) throw new Error(`Sharing failed (${res.status}).`);
  return (await res.json()) as { id: string; ownerKey: string };
}

export async function downloadShare(id: string): Promise<Uint8Array> {
  const res = await fetch(`${API_URL}/share/${encodeURIComponent(id)}`);
  if (res.status === 404) throw new Error('This share link has expired or does not exist.');
  if (!res.ok) throw new Error(`Opening the share link failed (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}
