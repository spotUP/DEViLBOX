/**
 * tonyWilliamsRelocate.ts - apply length-changing splices to a Tony Williams module and patch every pointer.
 * The module is a 68k player fused with its data; everything after the splice moves, so each pointer that
 * crosses a splice is found by structure (never by fixed offsets) and rewritten. Fails closed: any pattern
 * not found, any displacement that no longer fits 16 bits, any pointer into a deleted span -> { error }.
 * Layout and the pointer list: thoughts/spot/2026-11-04_tw-editability.md ("2026-11-14 tail pointer hunt").
 */
import { readTwBlock, twSongInfo, walkTonyWilliams } from './tonyWilliamsWalk';

export interface TwSplice { at: number; remove: number; insert: Uint8Array }
export interface TwPointer { kind: 'record' | 'list' | 'disp' | 'instrument' | 'sfx'; site: number; oldTarget: number; newTarget: number }
export type TwRelocation = { data: Uint8Array; pointers: TwPointer[]; pad: number } | { error: string };

/** Instrument table entries (12 bytes, sample long at +0, loop long at +6): the player reads 8 (4 voices x 2 banks). */
const INSTRUMENTS = 8;

const u16 = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u32 = (b: Uint8Array, o: number): number => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0;
const s16 = (v: number): number => (v << 16) >> 16;
const put16 = (b: Uint8Array, o: number, v: number): void => { b[o] = (v >> 8) & 255; b[o + 1] = v & 255; };

/** bra/bsr/bcc.w, lea/pea/jsr/jmp pc@(d16): the word after the opcode is a pc-relative displacement. */
function isPcDispOp(w: number): boolean {
  return ((w >> 12) === 6 && (w & 0xff) === 0) || (w & 0xf1ff) === 0x41fa || w === 0x4eba || w === 0x4efa || w === 0x487a;
}

export function relocateTonyWilliams(original: Uint8Array, requested: TwSplice[]): TwRelocation {
  const b = original;
  const len = b.length;
  const info0 = twSongInfo(b, 0);
  if (!info0 || info0.instrumentTable < 0) return { error: 'song structure not recognised' };
  const { base, songs, instrumentTable } = info0;

  // every block of every song: where the chunk (blocks' end to EOF) starts
  const blocks: Array<{ start: number; end: number }> = [];
  for (let s = 0; s < songs; s++) {
    const w = walkTonyWilliams(b, s);
    if (!w) return { error: `song ${s} could not be walked` };
    for (const st of w.blocks) {
      const cmds = readTwBlock(b, st);
      const last = cmds?.[cmds.length - 1];
      if (!last) return { error: 'block could not be read' };
      if (!blocks.some((x) => x.start === st)) blocks.push({ start: st, end: last.offset + last.length });
    }
  }
  const chunkStart = Math.max(...blocks.map((x) => x.end));
  if (requested.some((s) => s.at + s.remove > chunkStart)) return { error: 'edit lies outside the blocks' };

  // splices: an odd total gets one dead pad byte after the last edited block (chunk code stays word aligned)
  const spl = requested.map((s) => ({ ...s, pad: false }));
  const total = spl.reduce((n, s) => n + s.insert.length - s.remove, 0);
  let pad = 0;
  if (total & 1) {
    const lastAt = Math.max(...spl.map((s) => s.at));
    const blk = blocks.filter((x) => x.start <= lastAt && lastAt < x.end).sort((x, y) => y.start - x.start)[0];
    if (!blk) return { error: 'no block holds the last edit' };
    spl.push({ at: blk.end, remove: 0, insert: new Uint8Array(1), pad: true });
    pad = 1;
  }
  // a splice moves offsets from thr on: an insert at X keeps a pointer to X (the block start) in place
  const thr = (s: { at: number; remove: number; pad: boolean }): number => (s.pad ? s.at : s.at + Math.max(s.remove, 1));
  const shift = (o: number): number => spl.reduce((n, s) => n + (o >= thr(s) ? s.insert.length - s.remove : 0), 0);
  const deleted = (o: number): boolean => spl.some((s) => o > s.at && o < s.at + s.remove);

  const data = new Uint8Array(b);
  const pointers: TwPointer[] = [];
  const seen = new Set<number>();
  let err: string | null = null;
  const fail = (m: string): void => { err ??= m; };
  /** rewrite a 16-bit pointer word whose target is `target`; `newWord` maps the shifted target to the word */
  const word = (kind: TwPointer['kind'], site: number, target: number, newWord: (shiftedTarget: number) => number): void => {
    if (seen.has(site)) return;
    seen.add(site);
    if (target < 0 || target >= len) return;
    if (deleted(target)) return fail(`${kind} at 0x${site.toString(16)} points into a deleted span`);
    const d = shift(target);
    if (d === 0) return;
    const v = newWord(target + d);
    if (v < 0 || v > 0xffff) return fail(`${kind} at 0x${site.toString(16)} no longer fits 16 bits`);
    if (v === u16(data, site)) return;
    put16(data, site, v);
    pointers.push({ kind, site, oldTarget: target, newTarget: target + d });
  };

  // song records and voice lists (base-relative words)
  for (let s = 0; s < songs; s++) {
    const info = twSongInfo(b, s);
    if (!info) return { error: `song ${s} not readable` };
    for (let v = 0; v < 4; v++) {
      const site = base + s * 10 + v * 2;
      const rel = u16(b, site);
      if (rel === 0 && v > 0) continue;
      word('record', site, base + rel, (t) => t - base);
    }
    for (const listAt of info.lists) {
      for (let p = listAt, n = 0; listAt >= 0 && p + 2 <= len && n < 4096; p += 2, n++) {
        const w = u16(b, p);
        if (w === 0 && n > 0) { if (p + 4 <= len) word('list', p + 2, base + u16(b, p + 2), (t) => t - base); break; }
        word('list', p, base + w, (t) => t - base);
        const cmds = readTwBlock(b, base + w);
        const end = cmds?.[cmds.length - 1]?.op;
        if (end === 0x83 || end === 0x94) break;
      }
    }
  }
  // a jump command (0x82) carries a target whose meaning is not proven: refuse a splice before it
  for (let s = 0; s < songs; s++) {
    if (walkTonyWilliams(b, s)?.events.some((e) => e.cmd.op === 0x82)) return { error: 'blocks hold a jump command (0x82); its target is not relocated' };
  }

  // pc-relative displacements in the head code and in the tail routine
  const disp = (from: number, to: number): void => {
    for (let i = from + (from & 1); i + 4 <= Math.min(to, len); i += 2) {
      if (!isPcDispOp(u16(b, i))) continue;
      const site = i + 2;
      const t = site + s16(u16(b, site));
      if (t < 0 || t >= len) continue;
      if (deleted(t)) { fail(`displacement at 0x${site.toString(16)} points into a deleted span`); continue; }
      const nd = s16(u16(b, site)) + shift(t) - shift(site);
      if (nd === s16(u16(b, site))) continue;
      if (nd < -32768 || nd > 32767) { fail(`displacement at 0x${site.toString(16)} no longer fits 16 bits`); continue; }
      put16(data, site, nd & 0xffff);
      pointers.push({ kind: 'disp', site, oldTarget: t, newTarget: t + shift(t) });
    }
  };
  disp(0, Math.min(base, instrumentTable));
  // the tail routine ends at its `bra.w` back into the head code
  let term = -1;
  for (let i = chunkStart + (chunkStart & 1); i + 4 <= len; i += 2) {
    if (u16(b, i) === 0x6000 && i + 2 + s16(u16(b, i + 2)) < chunkStart) { term = i + 4; break; }
  }
  if (term < 0) return { error: 'tail routine end (bra.w into the head) not found' };
  disp(chunkStart, term);

  // instrument table: sample and loop longs are file offsets
  for (let k = 0; k < INSTRUMENTS; k++) {
    for (const o of [0, 6]) {
      const site = instrumentTable + k * 12 + o;
      const v = u32(b, site);
      if (site + 4 > len || v > len) return { error: `instrument table entry ${k} is not a file offset` };
      if (deleted(v)) { fail('instrument pointer into a deleted span'); continue; }
      const nv = v + shift(v);
      if (nv === v) continue;
      data[site] = nv >>> 24; data[site + 1] = (nv >>> 16) & 255; data[site + 2] = (nv >>> 8) & 255; data[site + 3] = nv & 255;
      pointers.push({ kind: 'instrument', site, oldTarget: v, newTarget: nv });
    }
  }

  // sfx table right behind the routine: words are file offset - 4 (a5 = file + 4); zero = unused
  let firstNonZero = -1;
  for (let i = term; i + 2 <= Math.min(len, term + 48); i += 2) if (u16(b, i) !== 0) { firstNonZero = i; break; }
  // a first word that does not point just past itself is not a table (fb: zeros, then dummy and sample data)
  const limit = firstNonZero >= 0 ? u16(b, firstNonZero) + 4 : -1; // the table ends where its first stream begins
  if (limit > firstNonZero && limit <= term + 48 && limit <= len) {
    for (let i = term; i < limit; i += 2) {
      const w = u16(b, i);
      if (w === 0) continue;
      if (w + 4 < limit) return { error: 'sfx table word points inside the table' };
      word('sfx', i, w + 4, (t) => t - 4);
    }
  }
  if (err) return { error: err };

  // apply splices from the back; at one offset the later block's insert goes in first so a pad ends up before it
  const order = [...spl].sort((x, y) => y.at - x.at || Number(x.pad) - Number(y.pad));
  let out = data;
  for (const s of order) {
    const next = new Uint8Array(out.length - s.remove + s.insert.length);
    next.set(out.subarray(0, s.at), 0);
    next.set(s.insert, s.at);
    next.set(out.subarray(s.at + s.remove), s.at + s.insert.length);
    out = next;
  }
  return { data: out, pointers, pad };
}
