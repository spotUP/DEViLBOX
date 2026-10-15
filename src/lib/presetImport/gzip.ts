/**
 * Synchronous gzip reader (RFC 1952 container, RFC 1951 inflate) and a stored-block gzip writer.
 * Exists because the parsers are pure and synchronous (DecompressionStream is async) and `pako` is not a declared dependency
 * of this repo (only @types/pako is in package.json). Output size is capped so a hostile file cannot expand without bound.
 */
import { ParseError } from './types';

const MAX_OUTPUT = 128 * 1024 * 1024;

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman { counts: Uint16Array; symbols: Uint16Array }

function buildHuffman(lengths: ArrayLike<number>, n: number, format: string): Huffman {
  const counts = new Uint16Array(16);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + counts[i];
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  // over-subscribed code check
  let left = 1;
  for (let len = 1; len <= 15; len++) {
    left = (left << 1) - counts[len];
    if (left < 0) throw new ParseError(format, 'corrupt deflate stream (bad Huffman code)');
  }
  return { counts, symbols };
}

export function inflateRaw(data: Uint8Array, start: number, format: string): { out: Uint8Array; end: number } {
  let pos = start;
  let bitBuf = 0;
  let bitCnt = 0;
  const chunks: Uint8Array[] = [];
  let cur = new Uint8Array(1 << 16);
  let curLen = 0;
  let total = 0;
  const fail = (m: string): never => { throw new ParseError(format, `corrupt deflate stream (${m})`); };

  const bits = (need: number): number => {
    let v = bitBuf;
    while (bitCnt < need) {
      if (pos >= data.length) fail('unexpected end');
      v |= data[pos++] << bitCnt;
      bitCnt += 8;
    }
    bitBuf = v >>> need;
    bitCnt -= need;
    return v & ((1 << need) - 1);
  };
  const decode = (h: Huffman): number => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bits(1);
      const count = h.counts[len];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    return fail('bad symbol');
  };
  const put = (b: number): void => {
    if (curLen === cur.length) {
      chunks.push(cur);
      cur = new Uint8Array(1 << 16);
      curLen = 0;
    }
    cur[curLen++] = b;
    if (++total > MAX_OUTPUT) fail('output exceeds 128 MiB');
  };
  const at = (back: number): number => {
    // byte `back` positions before the write head, across chunks
    let idx = curLen - back;
    if (idx >= 0) return cur[idx];
    let ci = chunks.length - 1;
    idx += 1 << 16;
    while (idx < 0 && ci > 0) { idx += 1 << 16; ci--; }
    if (ci < 0 || idx < 0) fail('distance too far back');
    return chunks[ci][idx];
  };

  let fixedL: Huffman | null = null;
  let fixedD: Huffman | null = null;
  let last = 0;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;
      if (pos + 4 > data.length) fail('truncated stored block');
      const len = data[pos] | (data[pos + 1] << 8);
      const nlen = data[pos + 2] | (data[pos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) fail('stored block length check');
      pos += 4;
      if (pos + len > data.length) fail('truncated stored block');
      for (let i = 0; i < len; i++) put(data[pos + i]);
      pos += len;
    } else if (type === 1 || type === 2) {
      let lit: Huffman, dist: Huffman;
      if (type === 1) {
        if (!fixedL || !fixedD) {
          const l = new Uint8Array(288);
          l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
          fixedL = buildHuffman(l, 288, format);
          fixedD = buildHuffman(new Uint8Array(30).fill(5), 30, format);
        }
        lit = fixedL; dist = fixedD;
      } else {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        if (nlen > 286 || ndist > 30) fail('too many codes');
        const cl = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) cl[CL_ORDER[i]] = bits(3);
        const clh = buildHuffman(cl, 19, format);
        const lens = new Uint8Array(nlen + ndist);
        let i = 0;
        while (i < nlen + ndist) {
          const sym = decode(clh);
          if (sym < 16) lens[i++] = sym;
          else {
            let prev = 0, rep: number;
            if (sym === 16) { if (i === 0) fail('repeat with no previous length'); prev = lens[i - 1]; rep = 3 + bits(2); }
            else if (sym === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (i + rep > nlen + ndist) fail('too many lengths');
            while (rep--) lens[i++] = prev;
          }
        }
        lit = buildHuffman(lens.subarray(0, nlen), nlen, format);
        dist = buildHuffman(lens.subarray(nlen), ndist, format);
      }
      for (;;) {
        const sym = decode(lit);
        if (sym < 256) put(sym);
        else if (sym === 256) break;
        else {
          const s = sym - 257;
          if (s >= 29) fail('bad length symbol');
          const len = LEN_BASE[s] + bits(LEN_EXTRA[s]);
          const ds = decode(dist);
          if (ds >= 30) fail('bad distance symbol');
          const d = DIST_BASE[ds] + bits(DIST_EXTRA[ds]);
          if (d > total) fail('distance too far back');
          for (let k = 0; k < len; k++) put(at(d));
        }
      }
    } else fail('reserved block type');
  } while (!last);

  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  out.set(cur.subarray(0, curLen), o);
  return { out, end: pos };
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 18 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 8;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Decompress a gzip member; verifies CRC32 and ISIZE. Throws ParseError. */
export function gunzip(bytes: Uint8Array, format: string): Uint8Array {
  if (!isGzip(bytes)) throw new ParseError(format, 'not a gzip stream');
  const flags = bytes[3];
  let pos = 10;
  if (flags & 4) { pos += 2 + (bytes[pos] | (bytes[pos + 1] << 8)); }
  if (flags & 8) { while (pos < bytes.length && bytes[pos] !== 0) pos++; pos++; }
  if (flags & 16) { while (pos < bytes.length && bytes[pos] !== 0) pos++; pos++; }
  if (flags & 2) pos += 2;
  if (pos >= bytes.length) throw new ParseError(format, 'truncated gzip header');
  const { out, end } = inflateRaw(bytes, pos, format);
  if (end + 8 > bytes.length) throw new ParseError(format, 'truncated gzip trailer');
  const crc = (bytes[end] | (bytes[end + 1] << 8) | (bytes[end + 2] << 16) | (bytes[end + 3] << 24)) >>> 0;
  const isize = (bytes[end + 4] | (bytes[end + 5] << 8) | (bytes[end + 6] << 16) | (bytes[end + 7] << 24)) >>> 0;
  if (isize !== (out.length >>> 0)) throw new ParseError(format, 'gzip size mismatch');
  if (crc !== crc32(out)) throw new ParseError(format, 'gzip CRC mismatch');
  return out;
}

/** gzip using stored (uncompressed) deflate blocks: valid gzip, no compression. For round-trip serializers. */
export function gzipStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(10 + data.length + blocks * 5 + 8);
  out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255], 0);
  let o = 10;
  for (let b = 0; b < blocks; b++) {
    const chunk = data.subarray(b * 65535, (b + 1) * 65535);
    const lastBlock = b === blocks - 1 ? 1 : 0;
    out[o++] = lastBlock;
    out[o++] = chunk.length & 255; out[o++] = chunk.length >> 8;
    out[o++] = ~chunk.length & 255; out[o++] = (~chunk.length >> 8) & 255;
    out.set(chunk, o); o += chunk.length;
  }
  const crc = crc32(data);
  for (let i = 0; i < 4; i++) out[o++] = (crc >>> (8 * i)) & 255;
  for (let i = 0; i < 4; i++) out[o++] = (data.length >>> (8 * i)) & 255;
  return out;
}
