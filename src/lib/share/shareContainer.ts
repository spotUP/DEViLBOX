/**
 * The shared song as one byte string: version byte, u32 header length, header JSON
 * { name, len, companions:[{name,len}] }, then the song bytes and each companion's bytes.
 * Both link modes carry this container (URL mode deflates it, upload mode sends it raw).
 */
export const SHARE_CONTAINER_VERSION = 1;

export interface ShareSong {
  name: string;
  bytes: Uint8Array;
  companions: Array<{ name: string; bytes: Uint8Array }>;
}

export function packShare(song: ShareSong): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify({
    name: song.name,
    len: song.bytes.length,
    companions: song.companions.map((c) => ({ name: c.name, len: c.bytes.length })),
  }));
  const total = 5 + header.length + song.bytes.length + song.companions.reduce((n, c) => n + c.bytes.length, 0);
  const out = new Uint8Array(total);
  out[0] = SHARE_CONTAINER_VERSION;
  new DataView(out.buffer).setUint32(1, header.length);
  out.set(header, 5);
  let at = 5 + header.length;
  for (const part of [song.bytes, ...song.companions.map((c) => c.bytes)]) { out.set(part, at); at += part.length; }
  return out;
}

/** Throws a plain-English Error for a corrupt or newer container. */
export function unpackShare(data: Uint8Array): ShareSong {
  if (data.length < 5) throw new Error('The shared link is damaged.');
  if (data[0] !== SHARE_CONTAINER_VERSION) throw new Error('This link was made by a newer version of DEViLBOX. Reload the page and try again.');
  const headerLen = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1);
  let header: { name: string; len: number; companions: Array<{ name: string; len: number }> };
  try {
    header = JSON.parse(new TextDecoder().decode(data.subarray(5, 5 + headerLen)));
  } catch {
    throw new Error('The shared link is damaged.');
  }
  let at = 5 + headerLen;
  const take = (len: number): Uint8Array => {
    if (!Number.isInteger(len) || len < 0 || at + len > data.length) throw new Error('The shared link is damaged.');
    const part = data.slice(at, at + len);
    at += len;
    return part;
  };
  const bytes = take(header.len);
  const companions = header.companions.map((c) => ({ name: c.name, bytes: take(c.len) }));
  return { name: header.name, bytes, companions };
}
