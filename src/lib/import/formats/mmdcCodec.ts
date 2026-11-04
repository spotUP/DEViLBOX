/**
 * mmdcCodec.ts - the MMDC (packed OctaMED) block codec and the repacker.
 *
 * Layout notes: thoughts/spot/2026-11-04_mmdc-layout.md. Reference decoder: nuade mmdc_module.c
 * (mmdc_line_reader_next). A block is u8 tracks, u8 lines-1, then ONE run-length stream over tracks*lines*3 bytes of
 * MMD0 cells: header < 0x80 copies header+1 literal bytes, header >= 0x80 gives (255-header)+1 zero bytes.
 *
 * The cells themselves are decoded by MEDParser: unpackMmdc() turns the file into an ordinary MMD0 image, and
 * repackMmdc() writes an edited MMD0 image back as MMDC.
 */

const MAX_RUN = 128;
const BLOCK_HEADER = 2;

function u16(b: Uint8Array, o: number): number { return o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : 0; }
function u32(b: Uint8Array, o: number): number {
  return o + 4 <= b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : 0;
}
function put32(b: Uint8Array, o: number, v: number): void {
  b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff;
}

/** Decode the run-length stream starting at `pos` into `need` bytes. Returns the bytes and the offset after the stream. */
export function decodeMmdcStream(buf: Uint8Array, pos: number, need: number): { bytes: Uint8Array; end: number } {
  const bytes = new Uint8Array(need);
  let got = 0;
  while (got < need) {
    if (pos >= buf.length) throw new Error('MMDC block runs past the end of the file');
    const h = buf[pos++];
    if (h < 0x80) {
      const n = h + 1;
      for (let i = 0; i < n && got < need; i++) bytes[got++] = buf[pos++] ?? 0;
    } else {
      got += Math.min((255 - h) + 1, need - got); // zeros: the array is already zero
    }
  }
  return { bytes, end: pos };
}

/** Encode `data` with the same run-length stream. Zero runs of 2+ become run tokens; a lone zero stays literal. */
export function encodeMmdcStream(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === 0 && i + 1 < data.length && data[i + 1] === 0) {
      let n = 0;
      while (i + n < data.length && data[i + n] === 0 && n < MAX_RUN) n++;
      out.push(255 - (n - 1));
      i += n;
    } else {
      let n = 0;
      while (i + n < data.length && n < MAX_RUN && !(data[i + n] === 0 && i + n + 1 < data.length && data[i + n + 1] === 0)) n++;
      out.push(n - 1);
      for (let k = 0; k < n; k++) out.push(data[i + k]);
      i += n;
    }
  }
  return Uint8Array.from(out);
}

export interface MmdcBlockInfo {
  /** File offset of the block in the packed file. */
  packedOffset: number;
  /** End of the block's stream in the packed file (exclusive). */
  packedEnd: number;
  /** End of the region the block owns: packedEnd plus one pad byte when the next object starts right after it. */
  regionEnd: number;
  tracks: number;
  lines: number;
  /** The tracks*lines*3 cell bytes. */
  cells: Uint8Array;
}

export interface MmdcIndex {
  blockArray: number;
  sampleArray: number;
  blockSlots: number;
  sampleSlots: number;
  blocks: MmdcBlockInfo[];
  /** Block pointer array entry that points at each block. */
  blockPtrAt: number[];
}

/** Locate and decode every block of a packed file. */
export function indexMmdc(buf: Uint8Array): MmdcIndex {
  const song = u32(buf, 0x08);
  const blockArray = u32(buf, 0x10);
  const sampleArray = u32(buf, 0x18);
  const count = u16(buf, song + 0x1f8);
  if (blockArray === 0 || sampleArray <= blockArray) throw new Error('Not an MMDC module: bad block array');
  const blockSlots = (sampleArray - blockArray) >> 2;
  if (count > blockSlots) throw new Error('Not an MMDC module: more blocks than slots');
  const firstBlock = u32(buf, blockArray);
  const sampleSlots = firstBlock > sampleArray ? (firstBlock - sampleArray) >> 2 : 0;

  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(u32(buf, blockArray + 4 * i));
  const boundaries = [
    ...offsets,
    ...Array.from({ length: sampleSlots }, (_, i) => u32(buf, sampleArray + 4 * i)),
  ].filter((p) => p > 0);

  const blocks: MmdcBlockInfo[] = offsets.map((off) => {
    const tracks = buf[off];
    const lines = buf[off + 1] + 1;
    const { bytes, end } = decodeMmdcStream(buf, off + BLOCK_HEADER, tracks * lines * 3);
    const padded = boundaries.includes(end + 1);
    return { packedOffset: off, packedEnd: end, regionEnd: padded ? end + 1 : end, tracks, lines, cells: bytes };
  });
  return { blockArray, sampleArray, blockSlots, sampleSlots, blocks, blockPtrAt: offsets.map((_, i) => blockArray + 4 * i) };
}

/** Rebuild a file with each block region replaced; pointers (header, block array, sample array) follow. */
function splice(src: Uint8Array, idx: MmdcIndex, replacement: Uint8Array[], magic: string): Uint8Array {
  const order = idx.blocks.map((_, i) => i).sort((a, b) => idx.blocks[a].packedOffset - idx.blocks[b].packedOffset);
  const parts: Uint8Array[] = [];
  const deltas: Array<{ oldEnd: number; delta: number }> = [];
  let cursor = 0;
  let total = 0;
  for (const i of order) {
    const b = idx.blocks[i];
    parts.push(src.subarray(cursor, b.packedOffset));
    parts.push(replacement[i]);
    total += b.packedOffset - cursor + replacement[i].length;
    deltas.push({ oldEnd: b.regionEnd, delta: replacement[i].length - (b.regionEnd - b.packedOffset) });
    cursor = b.regionEnd;
  }
  parts.push(src.subarray(cursor));
  total += src.length - cursor;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }

  const relocate = (old: number): number => {
    let shift = 0;
    for (const d of deltas) if (d.oldEnd <= old) shift += d.delta;
    return old + shift;
  };
  for (let k = 0; k < 4; k++) out[k] = magic.charCodeAt(k);
  put32(out, 4, out.length);
  for (const hdr of [0x08, 0x10, 0x18, 0x20]) {
    const v = u32(src, hdr);
    if (v) put32(out, hdr, relocate(v));
  }
  const newBlockArray = relocate(idx.blockArray);
  const newSampleArray = relocate(idx.sampleArray);
  for (let i = 0; i < idx.blocks.length; i++) put32(out, newBlockArray + 4 * i, relocate(idx.blocks[i].packedOffset));
  for (let i = 0; i < idx.sampleSlots; i++) {
    const v = u32(src, idx.sampleArray + 4 * i);
    if (v) put32(out, newSampleArray + 4 * i, relocate(v));
  }
  return out;
}

function blockBytes(tracks: number, lines: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK_HEADER + body.length);
  out[0] = tracks; out[1] = lines - 1;
  out.set(body, BLOCK_HEADER);
  return out;
}

/** The packed file as an ordinary MMD0 image: every block expanded to raw 3-byte cells. */
export function unpackMmdc(packed: Uint8Array): Uint8Array {
  const idx = indexMmdc(packed);
  return splice(packed, idx, idx.blocks.map((b) => blockBytes(b.tracks, b.lines, b.cells)), 'MMD0');
}

/**
 * Write an edited MMD0 image (from unpackMmdc, cells changed in place) back as MMDC. A block whose cells did not change
 * keeps its original bytes, so an unedited song is the file unchanged; a changed block is re-encoded and everything after
 * it moves by the size difference.
 */
export function repackMmdc(packed: Uint8Array, editedUnpacked: Uint8Array): Uint8Array {
  const idx = indexMmdc(packed);
  const unpackedIdx = unpackedBlockOffsets(idx);
  const replacement = idx.blocks.map((b, i) => {
    const at = unpackedIdx[i] + BLOCK_HEADER;
    const cells = editedUnpacked.subarray(at, at + b.cells.length);
    if (cells.every((v, k) => v === b.cells[k])) return packed.subarray(b.packedOffset, b.regionEnd);
    const enc = blockBytes(b.tracks, b.lines, encodeMmdcStream(cells));
    // the block carried a pad byte before the next object: keep that object even-aligned
    if (b.regionEnd > b.packedEnd && (enc.length & 1)) {
      const padded = new Uint8Array(enc.length + 1);
      padded.set(enc);
      return padded;
    }
    return enc;
  });
  return splice(packed, idx, replacement, 'MMDC');
}

/** Where each block sits in the unpacked image (same walk as splice, sizes only). */
function unpackedBlockOffsets(idx: MmdcIndex): number[] {
  const order = idx.blocks.map((_, i) => i).sort((a, b) => idx.blocks[a].packedOffset - idx.blocks[b].packedOffset);
  const result: number[] = new Array(idx.blocks.length).fill(0);
  let shift = 0;
  for (const i of order) {
    const b = idx.blocks[i];
    result[i] = b.packedOffset + shift;
    shift += BLOCK_HEADER + b.cells.length - (b.regionEnd - b.packedOffset);
  }
  return result;
}
