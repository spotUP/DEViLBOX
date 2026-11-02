/**
 * fpModuleGrow.ts - make room in a Future Player module (an Amiga hunk file with one code hunk).
 *
 * Every address in the module is a 32-bit offset into the code hunk, and the hunk's RELOC32 table lists
 * the place of every one of them. That table is what makes growing safe: a block that needs more bytes is
 * COPIED to the end of the code, and the ONE reference that should play the copy is moved to a copy of its
 * header (cloneHeader). Blocks are shared (subroutines called from many places, and a call header is often
 * the tail of the stream before it), so moving every pointer into the old block would change every place
 * that plays it, and would move headers whose stream pointer was never copied. Nothing else moves. The hunk's size words and the RELOC32 table are
 * rebuilt. A file that is not one code hunk followed by one RELOC32 table is refused (FpGrowError), as
 * pointers could not be found reliably.
 */
import { decodeBlock } from './FuturePlayerParser';
import { fpSongs } from './fpWalk';

export class FpGrowError extends Error {}

const HUNK_HEADER = 0x3f3, HUNK_CODE = 0x3e9, HUNK_RELOC32 = 0x3ec, HUNK_END = 0x3f2;

const rd32 = (b: Uint8Array, o: number): number => o >= 0 && o + 4 <= b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : 0;
const wr32 = (b: Uint8Array, o: number, v: number): void => { b[o] = (v >>> 24) & 0xff; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff; };

/** The module's code hunk with its pointer table, able to grow. */
export class FpHunkModule {
  /** Bytes before the code (hunk header, size table, HUNK_CODE and its size word). */
  private readonly header: Uint8Array;
  /** Bytes after HUNK_END. */
  private readonly trailer: Uint8Array;
  code: Uint8Array;
  /** Code offsets of every absolute pointer, ascending. */
  relocs: number[];

  private constructor(header: Uint8Array, code: Uint8Array, relocs: number[], trailer: Uint8Array) {
    this.header = header; this.code = code; this.relocs = relocs; this.trailer = trailer;
  }

  static parse(file: Uint8Array): FpHunkModule {
    if (file.length < 36 || rd32(file, 0) !== HUNK_HEADER) throw new FpGrowError('the file is not an Amiga hunk file');
    if (rd32(file, 4) !== 0 || rd32(file, 8) !== 1) throw new FpGrowError('the hunk file does not hold exactly one hunk');
    if (rd32(file, 24) !== HUNK_CODE) throw new FpGrowError('the hunk is not a code hunk');
    const longs = rd32(file, 28);
    const codeStart = 32, codeEnd = codeStart + longs * 4;
    if ((rd32(file, 20) & 0x3fffffff) !== longs || codeEnd + 8 > file.length) throw new FpGrowError('the hunk size words disagree with the file');
    let p = codeEnd;
    if (rd32(file, p) !== HUNK_RELOC32) throw new FpGrowError('no RELOC32 table follows the code, so its pointers cannot be found');
    p += 4;
    const relocs: number[] = [];
    for (;;) {
      if (p + 4 > file.length) throw new FpGrowError('the RELOC32 table is cut off');
      const count = rd32(file, p); p += 4;
      if (count === 0) break;
      if (rd32(file, p) !== 0) throw new FpGrowError('the RELOC32 table points into another hunk');
      p += 4;
      if (p + count * 4 > file.length) throw new FpGrowError('the RELOC32 table is cut off');
      for (let i = 0; i < count; i++, p += 4) {
        const o = rd32(file, p);
        if (o + 4 > longs * 4) throw new FpGrowError('a RELOC32 entry lies outside the code');
        relocs.push(o);
      }
    }
    if (rd32(file, p) !== HUNK_END) throw new FpGrowError('the RELOC32 table is not followed by HUNK_END');
    p += 4;
    relocs.sort((a, b) => a - b);
    return new FpHunkModule(file.slice(0, codeStart), file.slice(codeStart, codeEnd), relocs.filter((o, i) => i === 0 || o !== relocs[i - 1]), file.slice(p));
  }

  /** Append bytes (padded to a long) to the code; returns the code offset they sit at. */
  append(bytes: ArrayLike<number>): number {
    const at = this.code.length;
    const grown = new Uint8Array(at + ((bytes.length + 3) & ~3));
    grown.set(this.code);
    grown.set(bytes as ArrayLike<number>, at);
    this.code = grown;
    return at;
  }

  addReloc(off: number): void {
    if (!this.relocs.includes(off)) this.relocs.push(off);
  }

  build(): Uint8Array {
    const relocs = [...this.relocs].sort((a, b) => a - b);
    const longs = this.code.length / 4;
    const tail = 4 + (relocs.length ? 8 + relocs.length * 4 : 0) + 4 + 4;
    const out = new Uint8Array(this.header.length + this.code.length + tail + this.trailer.length);
    out.set(this.header);
    wr32(out, 20, (rd32(this.header, 20) & 0xc0000000) | longs);
    wr32(out, 28, longs);
    out.set(this.code, this.header.length);
    let p = this.header.length + this.code.length;
    wr32(out, p, HUNK_RELOC32); p += 4;
    if (relocs.length) {
      wr32(out, p, relocs.length); wr32(out, p + 4, 0); p += 8;
      for (const o of relocs) { wr32(out, p, o); p += 4; }
    }
    wr32(out, p, 0); wr32(out, p + 4, HUNK_END); p += 8;
    out.set(this.trailer, p);
    return out;
  }
}

/**
 * The code ranges [start, end) of the module's command streams: every block reachable from any subsong's voices
 * (decodeBlock, following calls and jumps), overlapping ranges merged so a range never cuts a stream in two.
 */
export function fpStreamRanges(code: Uint8Array): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const seen = new Set<number>();
  const queue: number[] = fpSongs(code).flatMap((s) => s.voiceSeqPtrs).filter((p) => p > 0);
  const scratch = new Map<number, number>();
  while (queue.length > 0) {
    const off = queue.shift()!;
    if (off <= 0 || off >= code.length || seen.has(off)) continue;
    seen.add(off);
    const b = decodeBlock(code, off, scratch);
    if (b.size <= 0) continue;
    ranges.push([off, off + b.size]);
    for (const t of b.targets) if (t > 0 && t < code.length && !seen.has(t)) queue.push(t);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** A replacement of the 2-byte rest command at `off` by `bytes`; `relocAt` are the offsets inside `bytes` of pointers. */
export interface FpRestReplacement { off: number; bytes: number[]; relocAt: number[] }

/**
 * Copy the stream range [start, end) to the end of the code with each 2-byte rest replaced as asked. No pointer is
 * changed: the old range stays where it is, still played by every reference that is not moved (cloneHeader), so one
 * place of a shared block can be given its own copy. Returns the code offset of the copy and the map from an offset
 * in the old range to the matching offset in the copy (a byte after a replacement moves by the bytes it added).
 */
export function copyStreamRange(mod: FpHunkModule, start: number, end: number, replacements: FpRestReplacement[]): { base: number; map: (v: number) => number } {
  const reps = [...replacements].sort((a, b) => a.off - b.off);
  const out: number[] = [];
  const relocsIn: number[] = [];             // new offsets (inside the copy) of pointers
  const oldRelocs = mod.relocs.filter((o) => o >= start && o + 4 <= end);
  const newOffsetOf: number[] = [];          // old offset - start -> new offset - start, for every old byte
  let ri = 0;
  for (let o = start; o < end;) {
    const rep = reps[ri];
    if (rep && rep.off === o) {
      if (o + 2 > end || mod.code[o] !== 0) throw new FpGrowError(`code offset ${o} is not a rest command`);
      for (const r of rep.relocAt) relocsIn.push(out.length + r);
      out.push(...rep.bytes);
      newOffsetOf[o - start] = out.length - rep.bytes.length; newOffsetOf[o - start + 1] = newOffsetOf[o - start];
      o += 2; ri++;
      continue;
    }
    newOffsetOf[o - start] = out.length;
    out.push(mod.code[o]);
    o++;
  }
  if (ri !== reps.length) throw new FpGrowError('a rest to split lies outside its stream range');
  for (const o of oldRelocs) relocsIn.push(newOffsetOf[o - start]);
  const base = mod.append(out);
  for (const r of relocsIn) mod.addReloc(base + r);
  return { base, map: (v) => base + newOffsetOf[v - start] };
}

/**
 * Point ONE reference at a stream position of its own. A voice enters a stream through a 12-byte header whose
 * long at +8 is the stream position (a voice block of the song data, or the header a call / jump command points at);
 * `refOff` is the listed pointer to that header (the command's operand or the song data slot). The header is copied
 * (with its pointers), its +8 set to `stream`, and `refOff` pointed at the copy; every other reference keeps the old
 * header. Returns the copy's code offset.
 */
export function cloneHeader(mod: FpHunkModule, refOff: number, stream: number): number {
  if (!mod.relocs.includes(refOff)) throw new FpGrowError(`code offset ${refOff} holds no listed pointer`);
  const header = rd32(mod.code, refOff);
  if (header + 12 > mod.code.length) throw new FpGrowError(`the header at code offset ${header} lies outside the code`);
  const copy = mod.append(mod.code.slice(header, header + 12));
  for (const o of [...mod.relocs]) if (o >= header && o + 4 <= header + 12) mod.addReloc(copy + (o - header));
  wr32(mod.code, copy + 8, stream);
  mod.addReloc(copy + 8);
  wr32(mod.code, refOff, copy);
  return copy;
}

/**
 * Point the jumps (command 7) in the code range [from, to) that go through header `oldHeader` at `newHeader` instead.
 * A stream that starts over jumps back to its own start through the header that entered it; once one reference is
 * moved to a copy of that stream (copyStreamRange + cloneHeader), the copy's restart must enter the copy again, or the
 * second pass would play the old stream. Only the copy's own jumps change; the old range and every other reference
 * keep the old header. Returns how many jumps were moved.
 */
export function pointRestartsAt(mod: FpHunkModule, from: number, to: number, oldHeader: number, newHeader: number): number {
  let moved = 0;
  for (const o of mod.relocs) {
    if (o < from + 2 || o + 4 > to || rd32(mod.code, o) !== oldHeader) continue;
    if ((mod.code[o - 2] & 0xbf) !== 0x87) continue; // the operand of a jump: 87 <arg> <pointer>
    wr32(mod.code, o, newHeader);
    moved++;
  }
  return moved;
}
