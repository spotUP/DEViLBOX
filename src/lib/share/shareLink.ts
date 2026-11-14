/**
 * Link forms. A share link keeps its payload in the URL fragment (never sent to a server):
 *   #share=z1.<base64url(deflate(container))>   small song, carried in the link
 *   #share=s.<id>                               large song, uploaded (id from /api/share)
 */
import pako from 'pako';

/** Longest fragment value (prefix included) carried in the link itself; longer songs are uploaded. */
export const SHARE_URL_MAX = 6000;
/** Largest container the server stores (server/src/routes/share.ts SHARE_MAX_BYTES). */
export const SHARE_UPLOAD_MAX = 8 * 1024 * 1024;

export type ShareRef = { mode: 'inline'; container: Uint8Array; id?: string } | { mode: 'stored'; id: string };

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The inline fragment value for a container, or null when it is over the cut-off. */
export function inlineFragment(container: Uint8Array): string | null {
  const value = `z1.${toBase64Url(pako.deflate(container))}`;
  return value.length <= SHARE_URL_MAX ? value : null;
}

export const storedFragment = (id: string): string => `s.${id}`;

/** Fragment of a small song: the song itself, plus the server id when the upload worked (`z1.<data>.<id>`; base64url has no dot). */
export const inlineLink = (fragment: string, id?: string): string => (id ? `${fragment}.${id}` : fragment);

/** The share reference in a location hash, or null when the hash is not a share link or is malformed. */
export function parseShareHash(hash: string): ShareRef | null {
  const m = /^#share=(?:z1\.([A-Za-z0-9_-]+)(?:\.([0-9A-Za-z]{8}))?|s\.([0-9A-Za-z]{8}))$/.exec(hash);
  if (!m) return null;
  if (m[3]) return { mode: 'stored', id: m[3] };
  try {
    return { mode: 'inline', container: pako.inflate(fromBase64Url(m[1])), id: m[2] };
  } catch {
    return null;
  }
}

/** Cheap check for startup code: is this page load a share link? */
export const isShareHash = (hash: string): boolean => hash.startsWith('#share=');
