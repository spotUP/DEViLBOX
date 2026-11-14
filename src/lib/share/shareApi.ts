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

const ownerHeaders = (ownerKey: string) => ({ 'X-Share-Owner-Key': ownerKey });

/** Send an edited song to the share's author. */
export async function uploadReply(shareId: string, container: Uint8Array): Promise<void> {
  const res = await fetch(`${API_URL}/share/${encodeURIComponent(shareId)}/replies`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: container as BodyInit,
  });
  if (res.status === 404) throw new Error('The shared song has expired, so changes cannot be sent back.');
  if (res.status === 413) throw new Error('This song is over 8 MB, too big to send back.');
  if (res.status === 429) throw new Error('Too many uploads from this address. Try again in an hour.');
  if (!res.ok) throw new Error(`Sending changes back failed (${res.status}).`);
}

export interface ReplyInfo { id: string; size: number; createdAt: number }

/** The replies waiting on one share; empty when the share is gone or the key is wrong. */
export async function listReplies(shareId: string, ownerKey: string): Promise<ReplyInfo[]> {
  const res = await fetch(`${API_URL}/share/${encodeURIComponent(shareId)}/replies`, { headers: ownerHeaders(ownerKey) });
  if (!res.ok) return [];
  return ((await res.json()) as { replies: ReplyInfo[] }).replies;
}

export async function downloadReply(shareId: string, replyId: string, ownerKey: string): Promise<Uint8Array> {
  const res = await fetch(`${API_URL}/share/${encodeURIComponent(shareId)}/replies/${encodeURIComponent(replyId)}`, { headers: ownerHeaders(ownerKey) });
  if (!res.ok) throw new Error('This reply has expired or was already handled.');
  return new Uint8Array(await res.arrayBuffer());
}

export async function dismissReply(shareId: string, replyId: string, ownerKey: string): Promise<void> {
  await fetch(`${API_URL}/share/${encodeURIComponent(shareId)}/replies/${encodeURIComponent(replyId)}`, { method: 'DELETE', headers: ownerHeaders(ownerKey) });
}
