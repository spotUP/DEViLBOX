/**
 * Oracle kit for the Future Player grid tests: the original 68k player in UADE, its four voice records
 * read every 10 ms chunk, and the alignment of those records to the walk's read passes.
 *
 * The records (190 bytes each, in the player's BSS) are found by their Paula base words (00DFF0A0..
 * with the DMA masks 8001..8008 behind them). The player's tick is the module's own CIA timer, not 50 Hz.
 */
import { readChipRam, PaulaSession, type PaulaLogModule } from './gridOracle';
import { fpCodeSection, walkFuturePlayer, type FpWalk, type FpVoiceState } from '@/lib/import/formats/fpWalk';

export const VOICE = 190;
export const be32 = (r: Uint8Array, o: number): number => ((r[o] << 24) | (r[o + 1] << 16) | (r[o + 2] << 8) | r[o + 3]) >>> 0;
export const be16 = (r: Uint8Array, o: number): number => (r[o] << 8) | r[o + 1];

/** Address of voice 0's record: the four records stand 190 bytes apart, each marked by its Paula base and DMA masks. */
export function findVoiceRecords(mod: PaulaLogModule): number {
  const ram = readChipRam(mod, 0, 0x200000);
  for (let a = 0x78; a + 12 < ram.length; a += 2) {
    if (be32(ram, a) === 0x00DFF0A0 && be16(ram, a + 4) === 1 && be16(ram, a + 6) === 0x8001
      && be32(ram, a + VOICE) === 0x00DFF0B0 && be16(ram, a + VOICE + 6) === 0x8002) return a - 0x78;
  }
  throw new Error('the player\'s voice records were not found in memory');
}

/** Where the player's loader put the module's code section (its first 12 bytes are the signature: moveq #-1,d0; rts; "F.PLAYER"). */
export function findCodeBases(mod: PaulaLogModule, code: Uint8Array): number[] {
  const ram = readChipRam(mod, 0, 0x200000);
  const hits: number[] = [];
  outer: for (let a = 0; a + 12 < ram.length; a += 2) {
    if (ram[a] !== code[0]) continue;
    for (let i = 1; i < 12; i++) if (ram[a + i] !== code[i]) continue outer;
    hits.push(a);
  }
  if (hits.length === 0) throw new Error('the module was not found in memory');
  return hits;
}

/** A voice's record as the player holds it. */
export interface Rec { seq: number; note: number; trig: number; timer: number; instr: number; t1: number; t2: number; arp: number; porta: number; period: number; dmaTrig: number; ended: number; arpIdx: number; env: number }

export function record(r: Uint8Array, o: number): Rec {
  return {
    seq: be32(r, o + 0xA6), note: r[o + 0x9E], trig: r[o + 0xA4], timer: r[o + 0x9F], instr: be32(r, o + 0x68), t1: r[o + 0x94], t2: r[o + 0x95],
    arp: be32(r, o + 0x70), porta: be16(r, o + 0x76), period: be16(r, o + 0xA0), dmaTrig: r[o + 0xA5], ended: r[o + 1], arpIdx: be16(r, o + 0x74), env: r[o + 0x83],
  };
}

export interface Original { chunks: Rec[][]; codeBase: number; endedAt: number | null }

/** The original player rendered in 10 ms chunks; the four voice records after each. */
export function playOriginal(mod: PaulaLogModule, bytes: Uint8Array, name: string, subsong: number, seconds: number): Original {
  // UADE numbers the subsongs from 0 (the player's SubSongRange); the session ignores 0 and 1 itself
  const s = new PaulaSession(mod, bytes, name, { subsong });
  if (subsong === 1) mod._uade_wasm_set_subsong(1);
  const bases = findCodeBases(mod, fpCodeSection(bytes));
  const base = findVoiceRecords(mod);
  const chunks: Rec[][] = [];
  let endedAt: number | null = null;
  for (let c = 0; c < seconds * 100; c++) {
    const ws = s.step();
    if (!ws) { endedAt = c; break; }
    const r = readChipRam(mod, base, VOICE * 4);
    chunks.push([0, 1, 2, 3].map((v) => record(r, v * VOICE)));
  }
  s.close();
  // the live copy of the code section is the candidate whose instrument pointers fit the walk's: a pointer into the module
  // (every record's instrument is a code address once a voice has set one) minus the base is below the code size
  const size = fpCodeSection(bytes).length;
  const live = chunks.flatMap((c) => c.map((v) => v.instr)).filter((p) => p > 0x1000);
  const codeBase = bases.find((b) => live.some((p) => p - b >= 0 && p - b < size && (p - b) % 2 === 0) && live.every((p) => p - b < size + 0x4000)) ?? bases[bases.length - 1];
  return { chunks, codeBase, endedAt };
}

export interface PassState { st: FpVoiceState[]; periods: number[][] }

/** The walk's state after every read pass, and the table period of each tick of it. */
export function passStates(code: Uint8Array, sub: number): { walk: FpWalk; passes: PassState[] } {
  const passes: PassState[] = [];
  const walk = walkFuturePlayer(code, sub, {
    onRow: (_row, vs, periods) => { passes.push({ st: vs.map((v) => ({ ...v, stack: [], loopAddr: [], loopCount: [] })), periods }); },
  }) as FpWalk;
  return { walk, passes };
}


/** Why the player's record `r` is not the walk's state `w` (the fields the walk models); empty when it is. */
export function diffRecord(r: Rec, w: FpVoiceState, codeBase: number): string[] {
  const why: string[] = [];
  // a voice with no stream never starts: its record keeps whatever the player had there
  const silent = w.ended && w.seqSaved === 0;
  if (!silent && r.seq - codeBase !== w.seqSaved) why.push(`sequence ${r.seq - codeBase} vs ${w.seqSaved}`);
  if (!silent && !w.ended && r.timer !== w.timer) why.push(`timer ${r.timer} vs ${w.timer}`);
  if (!silent && r.trig !== w.trig) why.push(`trigger ${r.trig} vs ${w.trig}`);
  if (!silent && r.note !== w.curNote) why.push(`note ${r.note} vs ${w.curNote}`);
  if (w.instr !== 0 && r.instr - codeBase !== w.instr) why.push(`instrument ${r.instr - codeBase} vs ${w.instr}`);
  if (w.arp !== 0 && r.arp - codeBase !== w.arp) why.push(`arpeggio ${r.arp - codeBase} vs ${w.arp}`);
  if (!silent && r.porta !== w.porta) why.push(`portamento ${r.porta} vs ${w.porta}`);
  if (!silent && (r.t1 !== w.t1 || r.t2 !== w.t2)) why.push(`transposes ${r.t1},${r.t2} vs ${w.t1},${w.t2}`);
  if ((r.ended !== 0) !== w.ended) why.push(`end flag ${r.ended} vs ${w.ended}`);
  return why;
}

export interface Alignment {
  /** For each chunk, the walk's pass the four records are the state of; -1 where they are caught mid-read. */
  passAt: number[];
  /** [pass, first chunk it was reached at] in order. */
  reached: Array<[number, number]>;
  flux: number;
  /** Set when the records stop being any pass of the walk (not a song end). */
  lostAt?: { chunk: number; pass: number; why: string };
}

/**
 * Align the player's records to the walk's passes by the records alone: the player is on pass p until its four
 * records are the walk's state of a later pass. A record caught mid-read (an interrupt can run across a chunk
 * boundary) fits neither: at most four such chunks in a row. A walk that ended (every voice) covers one pass of
 * the song: the player restarts it at once, so the comparison stops at the last pass.
 */
export function alignPasses(o: Original, walk: FpWalk, passes: PassState[], horizon: number): Alignment {
  const passAt: number[] = new Array<number>(horizon).fill(-1);
  const reached: Array<[number, number]> = [];
  let p = 0, fluxRun = 0, flux = 0;
  for (let c = 0; c < horizon; c++) {
    if (walk.stop === 'ended' && p >= passes.length - 2 && reached.length > 0 && c - reached[reached.length - 1][1] > 3) { passAt.length = c; break; }
    let q = -1;
    for (let k = p; k < Math.min(passes.length, p + 4); k++) {
      if ([0, 1, 2, 3].every((v) => diffRecord(o.chunks[c][v], passes[k].st[v], o.codeBase).length === 0)) { q = k; break; }
    }
    if (q < 0) {
      flux++; fluxRun++;
      if (fluxRun > 4) {
        const why = [0, 1, 2, 3].map((v) => diffRecord(o.chunks[c][v], passes[Math.min(p + 1, passes.length - 1)].st[v], o.codeBase).join(', ')).join(' | ');
        return { passAt, reached, flux, lostAt: { chunk: c, pass: p, why } };
      }
      continue;
    }
    fluxRun = 0;
    if (q !== p || reached.length === 0) { p = q; reached.push([q, c]); }
    passAt[c] = p;
  }
  return { passAt, reached, flux };
}
