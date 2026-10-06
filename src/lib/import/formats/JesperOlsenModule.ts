/**
 * JesperOlsenModule.ts - Jesper Olsen game music (.jo, drivers L and G):
 * the song's own structures, a byte-exact codec, and the driver.
 *
 * L = the replay routine of LollyPop (1995), G = Georg Glaxo (1992); one
 * driver with switches. The routine is not in the song file: UADE loads it
 * from the companion `WantedTeam.bin`. Everything below is read from the
 * clean-room description of the drivers (bbmp-replayers jo/clean-room/
 * description.md, §2 and §5-6; its model reproduced the drivers' Paula
 * writes on 55 logs) and checked here against UADE's own Paula output
 * register for register (jesperOlsenGridMatchesPlayer.test.ts).
 * Research: thoughts/shared/research/2026-10-06_jesper-olsen-format.md
 *
 * Song layout (offsets from the file start, big-endian):
 *   0         list table: word s = offset of start list s (word 0 = 2 x lists)
 *   lists     10-byte start entries, each list ended by $7FFF:
 *             +0 voice record (signed), +2 instrument table (signed),
 *             +4 sequence (0 = silent), +6 channel, +7 tempo, +8 priority, +9 volume
 *   records   68-byte voice records: the driver's per-voice state lives IN the file
 *   tables    instrument tables: words, each an instrument's offset (unsigned)
 *   instr     26 bytes: 3 x program start (word offset, counter, reload), +12 volume,
 *             +13 flags, +14 long sample (bit 31 = IFF, L), +18 len (words),
 *             +20 long repeat, +24 repeat len (words)
 *   sequences steps of set-words then a pattern offset; $7FFF ends, $7FFE x jumps
 *   patterns  rows of set-words then (a, b); a zero word ends the pattern.
 *             a = note, $7E release, $7F rest; b = length in rows, bit 7 = tied
 *   programs  2-byte items: ($7E v) wait/hold, $7FFE x jump, $7FFF end, (i v) record byte i&$7F+1 := v
 *   samples   8-bit PCM (raw or inside IFF 8SVX)
 */

// ── bytes ────────────────────────────────────────────────────────────────────

const u16 = (b: Uint8Array, o: number): number => ((b[o] << 8) | b[o + 1]) >>> 0;
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number): number => (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
const s8 = (v: number): number => (v << 24) >> 24;
const put16 = (b: Uint8Array, o: number, v: number): void => { b[o] = (v >>> 8) & 0xff; b[o + 1] = v & 0xff; };
const put32 = (b: Uint8Array, o: number, v: number): void => { put16(b, o, v >>> 16); put16(b, o + 2, v & 0xffff); };
const inFile = (b: Uint8Array, o: number, len: number): boolean => o >= 0 && o + len <= b.length;

export const JO_END = 0x7fff;
export const JO_JUMP = 0x7ffe;
export const JO_RECORD_SIZE = 0x44;
export const JO_INSTRUMENT_SIZE = 26;

/** The L/G period table (description §6.11), 95 words; indexes 95-127 read on into the row table (64 k). */
export const JO_PERIODS: readonly number[] = [
  27360, 25824, 24384, 23008, 21712, 20496, 19344, 18256, 17232, 16272, 15360, 14496,
  13680, 12912, 12192, 11504, 10856, 10248, 9672, 9128, 8616, 8136, 7680, 7248,
  6840, 6456, 6096, 5752, 5428, 5124, 4836, 4564, 4308, 4068, 3840, 3624,
  3420, 3228, 3048, 2876, 2714, 2562, 2418, 2282, 2154, 2034, 1920, 1812,
  1710, 1614, 1524, 1438, 1357, 1281, 1209, 1141, 1077, 1017, 960, 906,
  855, 807, 762, 719, 679, 641, 605, 571, 539, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120,
];

export function joPeriod(index: number): number {
  const i = index & 0x7f;
  return i < JO_PERIODS.length ? JO_PERIODS[i] : 64 * (i - JO_PERIODS.length);
}

// ── variants ─────────────────────────────────────────────────────────────────

export type JoDriver = 'L' | 'G';

/** FNV-1a 64 of the whole file: bbmp's list of the Georg Glaxo songs (description §2). */
const GEORG_GLAXO_HASHES = new Set(['6070b82c18071369', '888b1eb352ab172b', '487c309304916862']);

function fnv1a64(b: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < b.length; i++) h = ((h ^ BigInt(b[i])) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
}

/**
 * An offset-table song (L or G), as the EaglePlayer's Check2 accepts it: word 0
 * even, 4..$200, and every list offset > 0, even, below $8000, in the file,
 * with $7FFF just before it.
 */
export function isJoOffsetTableSong(b: Uint8Array): boolean {
  if (b.length < 6) return false;
  const n = u16(b, 0);
  if (n < 4 || n > 0x200 || (n & 1) || b.length < n + 2) return false;
  for (let o = 2; o <= n; o += 2) {
    const d = u16(b, o);
    if (d === 0 || (d & 0x8000) || (d & 1) || d > b.length) return false;
    if (u16(b, d - 2) !== JO_END) return false;
  }
  return true;
}

/**
 * Which driver plays an offset-table song: the known Georg Glaxo files by hash,
 * else the tempo rule over the lists the host plays (G songs' start entries with
 * a sequence all have tempo $22; L songs $24..$78). The list past the last
 * subsong is not played and may hold anything (the Wanted Team's Georg Glaxo
 * title has tempo 0 there).
 */
export function joDriverOf(b: Uint8Array, lists: JoList[]): JoDriver {
  if (GEORG_GLAXO_HASHES.has(fnv1a64(b))) return 'G';
  const played = lists.slice(1, 1 + joSubsongCount(b));
  const tempos = played.flatMap((l) => l.entries.filter((e) => e.sequence !== 0).map((e) => e.tempo));
  return tempos.length > 0 && tempos.every((t) => t === 0x22) ? 'G' : 'L';
}

// ── structures ───────────────────────────────────────────────────────────────

export interface JoListEntry {
  at: number;
  record: number;
  instrumentTable: number;
  /** Sequence offset, 0 = the voice is silent. */
  sequence: number;
  channel: number;
  tempo: number;
  priority: number;
  volume: number;
}

export interface JoList { at: number; entries: JoListEntry[] }

/** A set-word command: the word is written into the voice record at `field` (= first byte - $80). */
export interface JoSetWord { at: number; field: number; value: number }

export type JoSequenceItem =
  | { kind: 'step'; at: number; commands: JoSetWord[]; patternAt: number; pattern: number }
  | { kind: 'end'; at: number }
  | { kind: 'jump'; at: number; to: number };

export interface JoSequence { at: number; items: JoSequenceItem[] }

export interface JoRow {
  /** Offset of the row's first byte (its first command, or the note byte). */
  at: number;
  commands: JoSetWord[];
  /** Offset of the note byte a; b follows it. */
  noteAt: number;
  a: number;
  b: number;
}

export interface JoPattern { at: number; rows: JoRow[]; /** Offset of the zero word. */ endAt: number }

export interface JoInstrument {
  at: number;
  programs: Array<{ offset: number; counter: number; reload: number }>;
  volume: number;
  flags: number;
  sample: number;
  length: number;
  repeat: number;
  repeatLength: number;
}

export type JoProgramItem =
  | { kind: 'set'; at: number; field: number; value: number }
  | { kind: 'wait'; at: number; ticks: number }
  | { kind: 'hold'; at: number; value: number }
  | { kind: 'jump'; at: number; to: number }
  | { kind: 'end'; at: number };

export interface JoProgram { at: number; items: JoProgramItem[] }

export interface JoInstrumentTable { at: number; entries: number[] }

/** A byte span the model holds as data (PCM, IFF headers, or bytes no structure names). */
export interface JoSpan { at: number; bytes: Uint8Array; kind: 'sample' | 'iff' | 'unreferenced' }

export interface JoModule {
  driver: JoDriver;
  size: number;
  lists: JoList[];
  /** 68-byte voice records, verbatim: the game's saved driver state, which the driver starts from. */
  records: Array<{ at: number; bytes: Uint8Array }>;
  instrumentTables: JoInstrumentTable[];
  instruments: JoInstrument[];
  sequences: JoSequence[];
  patterns: JoPattern[];
  programs: JoProgram[];
  spans: JoSpan[];
}

function readSetWords(b: Uint8Array, at: number): { commands: JoSetWord[]; next: number } {
  const commands: JoSetWord[] = [];
  let o = at;
  while (inFile(b, o, 2) && (b[o] & 0x80)) {
    commands.push({ at: o, field: b[o] - 0x80, value: b[o + 1] });
    o += 2;
  }
  return { commands, next: o };
}

function readLists(b: Uint8Array): JoList[] {
  const lists: JoList[] = [];
  for (let s = 0; s < u16(b, 0) / 2; s++) {
    const at = u16(b, 2 * s);
    const entries: JoListEntry[] = [];
    let o = at;
    while (inFile(b, o, 2) && u16(b, o) !== JO_END) {
      if (!inFile(b, o, 10)) throw new Error(`JO: start list ${s} runs past the file`);
      entries.push({
        at: o, record: s16(b, o), instrumentTable: s16(b, o + 2), sequence: u16(b, o + 4),
        channel: b[o + 6], tempo: b[o + 7], priority: b[o + 8], volume: b[o + 9],
      });
      o += 10;
    }
    lists.push({ at, entries });
  }
  return lists;
}

function readSequence(b: Uint8Array, at: number): JoSequence {
  const items: JoSequenceItem[] = [];
  let o = at;
  for (;;) {
    if (!inFile(b, o, 2)) throw new Error(`JO: sequence at ${at} runs past the file`);
    const w = u16(b, o);
    if (w === JO_END) { items.push({ kind: 'end', at: o }); break; }
    if (w === JO_JUMP) { items.push({ kind: 'jump', at: o, to: s16(b, o + 2) }); break; }
    const { commands, next } = readSetWords(b, o);
    items.push({ kind: 'step', at: o, commands, patternAt: next, pattern: s16(b, next) });
    o = next + 2;
  }
  return { at, items };
}

function readPattern(b: Uint8Array, at: number): JoPattern {
  const rows: JoRow[] = [];
  let o = at;
  while (inFile(b, o, 2) && u16(b, o) !== 0) {
    const { commands, next } = readSetWords(b, o);
    if (!inFile(b, next, 2)) throw new Error(`JO: pattern at ${at} runs past the file`);
    rows.push({ at: o, commands, noteAt: next, a: b[next], b: b[next + 1] });
    o = next + 2;
  }
  if (!inFile(b, o, 2)) throw new Error(`JO: pattern at ${at} has no end`);
  return { at, rows, endAt: o };
}

function readInstrument(b: Uint8Array, at: number): JoInstrument {
  if (!inFile(b, at, JO_INSTRUMENT_SIZE)) throw new Error(`JO: instrument at ${at} runs past the file`);
  return {
    at,
    programs: [0, 4, 8].map((k) => ({ offset: s16(b, at + k), counter: b[at + k + 2], reload: b[at + k + 3] })),
    volume: b[at + 12], flags: b[at + 13],
    sample: u32(b, at + 14), length: u16(b, at + 18), repeat: u32(b, at + 20), repeatLength: u16(b, at + 24),
  };
}

function readProgram(b: Uint8Array, at: number, seen: Set<number>, out: JoProgram[]): void {
  const items: JoProgramItem[] = [];
  let o = at;
  for (;;) {
    if (!inFile(b, o, 2)) throw new Error(`JO: program at ${at} runs past the file`);
    const w = u16(b, o);
    if (b[o] === 0x7e) {
      const v = b[o + 1];
      items.push(v & 0x80 ? { kind: 'hold', at: o, value: v } : { kind: 'wait', at: o, ticks: v });
      o += 2;
    } else if (w === JO_END) { items.push({ kind: 'end', at: o }); break; }
    else if (w === JO_JUMP) {
      const to = s16(b, o + 2);
      items.push({ kind: 'jump', at: o, to });
      out.push({ at, items });
      if (!seen.has(to) && (to < at || to > o)) { seen.add(to); readProgram(b, to, seen, out); }
      return;
    } else {
      items.push({ kind: 'set', at: o, field: b[o] & 0x7f, value: b[o + 1] });
      o += 2;
    }
  }
  out.push({ at, items });
}

/** The instrument indexes a voice can select: its record's byte 1, and every `$80 i` set-word it can read. */
function instrumentIndexes(b: Uint8Array, recordAts: number[], sequences: JoSequence[], patterns: JoPattern[], programs: JoProgram[]): number[] {
  const idx = new Set<number>(recordAts.map((r) => b[r + 1]));
  const cmd = (c: JoSetWord) => { if (c.field === 0) idx.add(c.value); };
  sequences.forEach((s) => s.items.forEach((i) => { if (i.kind === 'step') i.commands.forEach(cmd); }));
  patterns.forEach((p) => p.rows.forEach((r) => r.commands.forEach(cmd)));
  programs.forEach((p) => p.items.forEach((i) => { if (i.kind === 'set' && i.field === 0) idx.add(i.value); }));
  return [...idx].sort((x, y) => x - y);
}

/** Decode an L/G song: every structure the start lists reach, and the rest of the file as data spans. */
export function decodeJoModule(bytes: Uint8Array): JoModule {
  const b = bytes;
  if (!isJoOffsetTableSong(b)) throw new Error('Not a Jesper Olsen offset-table song');
  const lists = readLists(b);
  const driver = joDriverOf(b, lists);
  const entries = lists.flatMap((l) => l.entries);
  const recordAts = [...new Set(entries.map((e) => e.record))].sort((x, y) => x - y);
  const tableAts = [...new Set(entries.map((e) => e.instrumentTable))].sort((x, y) => x - y);

  // Sequences (and their jump targets), then the patterns their steps name.
  const sequences: JoSequence[] = [];
  const seqSeen = new Set<number>();
  const pending = entries.map((e) => e.sequence).filter((s) => s !== 0);
  while (pending.length) {
    const at = pending.shift()!;
    if (seqSeen.has(at) || sequences.some((s) => s.items.some((i) => i.at === at))) continue;
    seqSeen.add(at);
    const s = readSequence(b, at);
    sequences.push(s);
    const last = s.items[s.items.length - 1];
    if (last.kind === 'jump') pending.push(last.to);
  }
  sequences.sort((x, y) => x.at - y.at);
  const patternAts = [...new Set(sequences.flatMap((s) => s.items.flatMap((i) => (i.kind === 'step' ? [i.pattern] : []))))].sort((x, y) => x - y);
  const patterns = patternAts.map((at) => readPattern(b, at));

  // Instruments through the tables, then their programs.
  const programs: JoProgram[] = [];
  const progSeen = new Set<number>();
  const progFrom = (insts: JoInstrument[]) => insts.forEach((ins) => ins.programs.forEach((p) => {
    if (p.offset !== 0 && !progSeen.has(p.offset)) { progSeen.add(p.offset); readProgram(b, p.offset, progSeen, programs); }
  }));
  // The table length is the highest instrument index any voice can select (+1).
  // Programs can select one too (field 0), so read to a fixed point.
  let count = 0;
  let instrumentTables: JoInstrumentTable[] = [];
  let instruments: JoInstrument[] = [];
  for (;;) {
    const idx = instrumentIndexes(b, recordAts, sequences, patterns, programs);
    const n = (idx[idx.length - 1] ?? 0) + 1;
    if (n === count) break;
    count = n;
    instrumentTables = tableAts.map((at) => ({ at, entries: Array.from({ length: n }, (_, i) => u16(b, at + 2 * i)) }));
    const instAts = [...new Set(instrumentTables.flatMap((t) => t.entries))].sort((x, y) => x - y);
    instruments = instAts.map((at) => readInstrument(b, at));
    progFrom(instruments);
  }
  programs.sort((x, y) => x.at - y.at);

  const m: JoModule = {
    driver, size: b.length, lists,
    records: recordAts.map((at) => ({ at, bytes: b.slice(at, at + JO_RECORD_SIZE) })),
    instrumentTables, instruments, sequences, patterns, programs, spans: [],
  };
  // Everything no structure covers is data: sample PCM, IFF headers, or bytes nothing names.
  const covered = joCoverage(m);
  const sampleBytes = new Uint8Array(b.length);
  for (const ins of instruments) {
    const mark = (o: number, len: number, v: number) => { for (let i = Math.max(0, o); i < Math.min(b.length, o + len); i++) sampleBytes[i] = v; };
    const iff = driver === 'L' && (ins.sample & 0x80000000) !== 0;
    const o = ins.sample & 0x7fffffff;
    if (iff) {
      // The 8SVX file the sample sits in: FORM ... BODY, header bytes before o.
      let form = o - 8;
      while (form >= 0 && !(b[form] === 0x46 && b[form + 1] === 0x4f && b[form + 2] === 0x52 && b[form + 3] === 0x4d)) form -= 2;
      if (form >= 0) mark(form, o - form, 2);
      mark(o, u32(b, o - 4), 1);
    } else {
      mark(o, 2 * ins.length, 1);
      mark(ins.repeat, 2 * ins.repeatLength, 1);
    }
  }
  let i = 0;
  while (i < b.length) {
    if (covered[i]) { i++; continue; }
    const kind = sampleBytes[i] === 1 ? 'sample' : sampleBytes[i] === 2 ? 'iff' : 'unreferenced';
    let j = i;
    while (j < b.length && !covered[j] && sampleBytes[j] === sampleBytes[i]) j++;
    m.spans.push({ at: i, bytes: b.slice(i, j), kind });
    i = j;
  }
  return m;
}

/** 1 for every byte a decoded structure (not a data span) encodes. */
export function joCoverage(m: JoModule): Uint8Array {
  const c = new Uint8Array(m.size);
  const mark = (o: number, len: number) => { for (let i = o; i < o + len && i < m.size; i++) if (i >= 0) c[i] = 1; };
  mark(0, 2 * m.lists.length);
  m.lists.forEach((l) => { mark(l.at, 10 * l.entries.length + 2); });
  m.records.forEach((r) => mark(r.at, JO_RECORD_SIZE));
  m.instrumentTables.forEach((t) => mark(t.at, 2 * t.entries.length));
  m.instruments.forEach((ins) => mark(ins.at, JO_INSTRUMENT_SIZE));
  m.sequences.forEach((s) => s.items.forEach((it) => {
    if (it.kind === 'step') { mark(it.at, it.patternAt + 2 - it.at); } else mark(it.at, it.kind === 'jump' ? 4 : 2);
  }));
  m.patterns.forEach((p) => mark(p.at, p.endAt + 2 - p.at));
  m.programs.forEach((p) => p.items.forEach((it) => mark(it.at, it.kind === 'jump' ? 4 : 2)));
  return c;
}

/** Write the module back: the data spans, then every structure from its fields. */
export function encodeJoModule(m: JoModule): Uint8Array {
  const b = new Uint8Array(m.size);
  for (const s of m.spans) b.set(s.bytes, s.at);
  m.lists.forEach((l, s) => {
    put16(b, 2 * s, l.at);
    l.entries.forEach((e, k) => {
      const o = l.at + 10 * k;
      put16(b, o, e.record & 0xffff); put16(b, o + 2, e.instrumentTable & 0xffff); put16(b, o + 4, e.sequence);
      b[o + 6] = e.channel; b[o + 7] = e.tempo; b[o + 8] = e.priority; b[o + 9] = e.volume;
    });
    put16(b, l.at + 10 * l.entries.length, JO_END);
  });
  m.records.forEach((r) => b.set(r.bytes, r.at));
  m.instrumentTables.forEach((t) => t.entries.forEach((e, i) => put16(b, t.at + 2 * i, e)));
  m.instruments.forEach((ins) => {
    ins.programs.forEach((p, k) => { put16(b, ins.at + 4 * k, p.offset & 0xffff); b[ins.at + 4 * k + 2] = p.counter; b[ins.at + 4 * k + 3] = p.reload; });
    b[ins.at + 12] = ins.volume; b[ins.at + 13] = ins.flags;
    put32(b, ins.at + 14, ins.sample); put16(b, ins.at + 18, ins.length);
    put32(b, ins.at + 20, ins.repeat); put16(b, ins.at + 24, ins.repeatLength);
  });
  const setWords = (cs: JoSetWord[]) => cs.forEach((c) => { b[c.at] = 0x80 + c.field; b[c.at + 1] = c.value; });
  m.sequences.forEach((s) => s.items.forEach((it) => {
    if (it.kind === 'step') { setWords(it.commands); put16(b, it.patternAt, it.pattern & 0xffff); }
    else if (it.kind === 'end') put16(b, it.at, JO_END);
    else { put16(b, it.at, JO_JUMP); put16(b, it.at + 2, it.to & 0xffff); }
  }));
  m.patterns.forEach((p) => {
    p.rows.forEach((r) => { setWords(r.commands); b[r.noteAt] = r.a; b[r.noteAt + 1] = r.b; });
    put16(b, p.endAt, 0);
  });
  m.programs.forEach((p) => p.items.forEach((it) => {
    switch (it.kind) {
      case 'set': b[it.at] = it.field; b[it.at + 1] = it.value; break;
      case 'wait': b[it.at] = 0x7e; b[it.at + 1] = it.ticks; break;
      case 'hold': b[it.at] = 0x7e; b[it.at + 1] = it.value; break;
      case 'jump': put16(b, it.at, JO_JUMP); put16(b, it.at + 2, it.to & 0xffff); break;
      case 'end': put16(b, it.at, JO_END); break;
    }
  }));
  return b;
}

/**
 * Subsongs the host offers (description §5.2): k - 1 for k start lists, or k - 2
 * when k - 1 is not 1 and the last list looks empty (the word 6 bytes before the
 * first voice record of list 0 is 0, or the word 4 bytes before it is $7F00).
 * Subsong s (1-based) plays list s.
 */
export function joSubsongCount(b: Uint8Array): number {
  const k = u16(b, 0) / 2;
  if (k - 1 === 1) return 1;
  const q = u16(b, u16(b, 2));
  return u16(b, q - 6) === 0 || u16(b, q - 4) === 0x7f00 ? k - 2 : k - 1;
}

// ── the driver ───────────────────────────────────────────────────────────────

/** A register write the driver makes (description §4). LC is a file offset. */
export interface JoPaulaWrite { ch: number; reg: 'LC' | 'LEN' | 'PER' | 'VOL' | 'DMACON'; value: number }

/** A row a voice reads (description §6.7), as the grid shows it. */
export interface JoRowRead {
  channel: number;
  tick: number;
  /** The file's row (pattern offset + position) and the step that named it. */
  rowAt: number;
  noteAt: number;
  stepAt: number;
  a: number;
  b: number;
  /** Record bytes after the row's commands: instrument index ($01), transpose ($0B). */
  instrument: number;
  transpose: number;
  /** The row's own set-words, then the step's (only on the step's first row read). */
  commands: JoSetWord[];
  stepCommands: JoSetWord[];
}

const PRODUCT = (() => {
  const t = new Uint8Array(4096);
  for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) t[64 * i + j] = Math.floor((i * j) / 63);
  return t;
})();
const ROW_TABLE = Array.from({ length: 128 }, (_, k) => (k < 64 ? 64 * k : k === 127 ? 1 : 0));

function product(a: number, bb: number): number {
  const h = ROW_TABLE[a & 0x7f];
  return PRODUCT[(h & 0xff00) | ((h + (bb & 0xff)) & 0xff)];
}

/**
 * The L/G driver on a writable copy of the song (description §5-6): start
 * calls, then one `tick()` per 50 Hz play call. Every Paula write and every
 * row read is reported; `ended` is set on the tick the host's song-end rule
 * fires (§5.3).
 */
export class JoPlayer {
  readonly mem: Uint8Array;
  readonly driver: JoDriver;
  readonly writes: JoPaulaWrite[] = [];
  readonly reads: JoRowRead[] = [];
  tickCount = 0;
  /** Ticks on which the song-end rule fired. */
  readonly ends: number[] = [];
  /** Ticks on which at least one voice's row was due (the grid's row clock). */
  readonly rowTicks: number[] = [];
  private readonly voices: number[] = [-1, -1, -1, -1];
  private dmaOff = 0;
  private dmaOn = 0;
  private master = 63;
  private flags = [false, false, false, false];
  private flagCopy = [false, false, false, false];
  private stepCmds: Array<JoSetWord[] | null> = [null, null, null, null];

  constructor(song: Uint8Array, driver?: JoDriver) {
    this.mem = song.slice();
    this.driver = driver ?? joDriverOf(song, readLists(song));
  }

  private b(o: number): number { return this.mem[o]; }
  private w(o: number): number { return u16(this.mem, o); }
  private sb(o: number, v: number): void { this.mem[o] = v & 0xff; }
  private sw(o: number, v: number): void { put16(this.mem, o, v & 0xffff); }
  private out(ch: number, reg: JoPaulaWrite['reg'], value: number): void { this.writes.push({ ch, reg, value }); }

  /** Host start (§5.1): list 0 (silence), then subsong `subsong` (1-based); the song-end flags as §5.3. */
  start(subsong: number): void {
    this.flags = [false, false, false, false];
    this.startList(0);
    this.startList(subsong);
    this.flagCopy = this.flags.slice();
  }

  private startList(s: number): void {
    this.master = 63;
    this.dmaOff = 0;
    this.dmaOn = 0x8000;
    const L = this.driver === 'L';
    for (let o = this.w(2 * s); this.w(o) !== JO_END; o += 10) {
      const R = s16(this.mem, o);
      const c = this.b(o + 6);
      const seq = this.w(o + 4);
      const prio = this.b(o + 8);
      if (prio < this.b(R + 0x40)) continue;
      this.sb(R + 0x40, prio);
      this.voices[c] = R;
      put32(this.mem, R + 0x2e, s16(this.mem, o + 2));
      this.sw(R + 0x34, seq);
      if (seq !== 0) this.flags[c] = true;
      this.out(c, 'DMACON', 1 << c);
      this.sw(R + 0x38, (1 << c) + 0x8000);
      this.sw(R + 0x3a, 1 << c);
      put32(this.mem, R + 0x3c, c);
      this.sb(R + 0x03, this.b(o + 7));
      this.sb(R + 0x40, seq !== 0 ? prio : 0);
      this.sb(R + 0x17, this.b(o + 9));
      this.sw(R + 0x14, 63); this.sw(R + 0x12, 63);
      this.sw(R + 0x32, L ? 0x7f01 : 0x0001);
      this.sb(R + 0x43, s);
      for (const k of [0x36, 0x06, 0x08, 0x0a, 0x20, 0x0c]) this.sw(R + k, 0);
      this.sb(R + 0x41, L ? 0xff : 0);
      if (L) for (const k of [0x10, 0x18, 0x1a, 0x1c]) this.sw(R + k, 0);
      this.stepCmds[c] = null;
    }
  }

  /** One play call (§6.5). */
  tick(): void {
    this.out(-1, 'DMACON', this.dmaOff);
    this.dmaOff = 0;
    this.dmaOn = 0;
    for (let c = 0; c < 4; c++) {
      const R = this.voices[c];
      if (R < 0 || this.w(R + 0x34) === 0) continue;
      if (this.rowDue(R)) {
        if (this.rowTicks[this.rowTicks.length - 1] !== this.tickCount) this.rowTicks.push(this.tickCount);
        const left = ((this.b(R + 0x33) & 0x7f) - 1) & 0xff;
        this.sb(R + 0x33, left);
        if (left === 0) { this.readRow(R, c); continue; }
      }
      this.sound(R, c);
    }
    this.out(-1, 'DMACON', this.dmaOn | 0x8000);
    this.tickCount++;
  }

  private rowDue(R: number): boolean {
    if (this.driver === 'L') {
      const t = this.b(R + 0x41) + this.b(R + 0x03);
      this.sb(R + 0x41, t);
      return t > 0xff;
    }
    const tempo = this.b(R + 0x03);
    if (!(tempo & 0x80)) {
      const n = s8((this.b(R + 0x41) - 1) & 0xff);
      if (n >= 0) { this.sb(R + 0x41, n); return false; }
      this.sb(R + 0x41, tempo & 0x70);
    } else {
      const n = s8((this.b(R + 0x41) - 0x10) & 0xff);
      if (n >= 0) { this.sb(R + 0x41, n); return false; }
      this.sb(R + 0x41, tempo & 7);
    }
    this.sb(R + 0x03, tempo ^ 0x80);
    return true;
  }

  private sequenceEnd(c: number): void {
    this.flags[c] = false;
    if (this.flags.every((f) => !f)) {
      this.flags = this.flagCopy.slice();
      this.ends.push(this.tickCount);
    }
  }

  private setWords(R: number, at: number): { next: number; cmds: JoSetWord[] } {
    const cmds: JoSetWord[] = [];
    let o = at;
    while (this.b(o) & 0x80) {
      cmds.push({ at: o, field: this.b(o) - 0x80, value: this.b(o + 1) });
      this.sw(R + this.b(o) - 0x80, this.w(o));
      o += 2;
    }
    return { next: o, cmds };
  }

  private instrument(R: number): number {
    return u16(this.mem, u32(this.mem, R + 0x2e) + 2 * this.b(R + 0x01));
  }

  private readRow(R: number, c: number): void {
    const L = this.driver === 'L';
    let P = s16(this.mem, R + 0x34);
    if (this.w(P) === JO_END) {
      this.sw(R + 0x34, 0);
      this.out(c, 'VOL', 0);
      this.sequenceEnd(c);
      this.sb(R + 0x40, 0);
      return;
    }
    if (this.w(P) === JO_JUMP) {
      const x = this.w(P + 2);
      this.sw(R + 0x34, x);
      this.sequenceEnd(c);
      P = (x << 16) >> 16;
    }
    const step = this.setWords(R, P);
    if (step.cmds.length) this.stepCmds[c] = step.cmds;
    this.sw(R + 0x34, step.next);
    const pat = s16(this.mem, step.next);
    const rowAt = pat + s16(this.mem, R + 0x36);
    this.sw(R + 0x0c, 0);
    const row = this.setWords(R, rowAt);
    const Q = row.next;
    const a = this.b(Q), bb = this.b(Q + 1);
    if (a === 0x7e || a === 0x7f) {
      this.sb(R + 0x04, a); this.sb(R + 0x05, bb); this.sb(R + 0x33, bb);
      if (a === 0x7f) { this.sb(R + 0x32, 0x7f); this.dmaOff += this.w(R + 0x3a); }
      else { this.sb(R + 0x04, 0); this.sb(R + 0x05, bb & 0x80); }
    } else {
      if (!(bb & 0x80)) {
        this.sb(R + 0x42, 0xff);
        const I = this.instrument(R);
        this.mem.copyWithin(R + 0x22, I, I + 12);
        this.sw(R + 0x20, 0);
        const flags = this.b(I + 0x0d);
        if (L) {
          let dma = true;
          if (flags & 4) {
            if (this.b(R + 0x1c) !== 0) dma = false;
            else this.sb(R + 0x1c, 0xff);
          } else this.sb(R + 0x1c, 0);
          if (dma) {
            this.dmaOff += this.w(R + 0x3a);
            if (!(flags & 1)) this.out(c, 'DMACON', this.w(R + 0x3a));
          }
        } else if (flags & 1) this.out(c, 'DMACON', this.w(R + 0x3a));
        else this.dmaOff += this.w(R + 0x3a);
      }
      this.sb(R + 0x32, a); this.sb(R + 0x33, bb);
      if (L) { this.sb(R + 0x32, a + this.b(R + 0x0b)); this.sw(R + 0x20, 0); }
    }
    this.reads.push({
      channel: c, tick: this.tickCount, rowAt, noteAt: Q, stepAt: P, a, b: bb,
      instrument: this.b(R + 0x01), transpose: this.b(R + 0x0b),
      commands: row.cmds, stepCommands: this.stepCmds[c] ?? [],
    });
    this.stepCmds[c] = null;
    const pos = Q + 2 - pat;
    if (this.w(Q + 2) === 0) {
      this.sw(R + 0x36, 0);
      const rep = s8((this.b(R + 0x07) - 1) & 0xff);
      if (rep < 0) { this.sb(R + 0x07, 0); this.sw(R + 0x34, this.w(R + 0x34) + 2); }
      else this.sb(R + 0x07, rep);
    } else this.sw(R + 0x36, pos);
  }

  private sound(R: number, c: number): void {
    const L = this.driver === 'L';
    if (this.b(R + 0x32) === 0x7f) return;
    this.dmaOn += this.w(R + 0x3a);
    const I = this.instrument(R);
    if (!L) { this.sw(R + 0x0e, 0); this.sw(R + 0x08, 0); }
    const flags = this.b(I + 0x0d);
    const wave = this.b(R + 0x1f);
    const sample = u32(this.mem, I + 0x0e);
    if (this.b(R + 0x42)) {
      if (L) {
        this.sw(R + 0x0e, 0); this.sw(R + 0x08, 0); this.sb(R + 0x42, 0); this.sb(R + 0x05, 0xff);
        if (flags & 2) this.sb(R + 0x1f, 0);
        const w1f = this.b(R + 0x1f);
        if (sample & 0x80000000) {
          const o = sample & 0x7fffffff;
          this.out(c, 'LC', o);
          this.out(c, 'LEN', ((this.w(o - 82) + this.w(o - 78)) & 0xffff) >>> 1);
        } else {
          const add = flags & 0x80 ? (((2 * w1f * this.w(I + 0x12)) & 0xffff) << 16) >> 16 : 0;
          this.out(c, 'LC', sample + add);
          this.out(c, 'LEN', this.w(I + 0x12));
        }
      } else {
        this.out(c, 'LC', sample);
        this.out(c, 'LEN', this.w(I + 0x12));
        this.sb(R + 0x42, 0); this.sb(R + 0x05, 0xff);
      }
    } else if (L && (sample & 0x80000000)) {
      const o = sample & 0x7fffffff;
      const x = this.w(o - 82), y = this.w(o - 78);
      this.out(c, 'LEN', y >>> 1);
      this.out(c, 'LC', o + ((x << 16) >> 16));
    } else {
      const len = L ? this.w(I + 0x12) : this.w(I + 0x18);
      const add = flags & 0x80 ? (((2 * wave * len) & 0xffff) << 16) >> 16 : 0;
      this.out(c, 'LC', u32(this.mem, I + 0x14) + add);
      this.out(c, 'LEN', this.w(I + 0x18));
    }
    for (const k of [0x22, 0x26, 0x2a]) this.program(R, k);
    this.sw(R + 0x20, this.w(R + 0x20) + s8(this.b(R + 0x0d)));
    const vol = product(product(product(product(this.b(R + 0x17), this.b(R + 0x15)), this.b(R + 0x13)), this.master), this.b(I + 0x0c));
    this.out(c, 'VOL', vol & 0x7f);
    let n = this.b(R + 0x09);
    if (s8(n) >= 0) n = (n + (L ? 0 : this.b(R + 0x0b)) + this.b(R + 0x32)) & 0xff;
    const per = joPeriod(n) - s8(this.b(R + 0x11)) - (this.b(R + 0x19) & 1 ? 0 : s8(this.b(R + 0x0f))) - this.w(R + 0x20);
    this.out(c, 'PER', per & 0xffff);
  }

  private program(R: number, k: number): void {
    let p = s16(this.mem, R + k);
    if (p === 0) return;
    const c = s8((this.b(R + k + 2) - 1) & 0xff);
    if (c >= 0) { this.sb(R + k + 2, c); return; }
    this.sb(R + k + 2, 0);
    const setItem = (at: number) => {
      this.sb(R + (this.b(at) & 0x7f) + 1, this.b(at + 1));
      p = at + 2;
      this.sw(R + k, p);
      this.sb(R + k + 2, this.b(R + k + 3));
    };
    if (this.b(p) === 0x7e) {
      const v = this.b(p + 1);
      if (!(v & 0x80)) {
        this.sb(R + k + 3, v);
        this.sw(R + k, p + 2);
        this.sb(R + k + 2, v);
      } else if (!(this.b(R + 0x05) & 0x80)) {
        this.sw(R + k, p + 2);
        this.sb(R + k + 2, this.b(R + k + 3));
      }
      return;
    }
    const w = this.w(p);
    if (w === JO_END) return;
    if (w === JO_JUMP) { setItem(s16(this.mem, p + 2)); return; }
    setItem(p);
  }
}

/** Run subsong `subsong` (1-based) to the host's song end, or `maxTicks`. */
export function runJoSong(song: Uint8Array, subsong: number, maxTicks = 50 * 60 * 15): JoPlayer {
  const p = new JoPlayer(song);
  p.start(subsong);
  while (p.ends.length === 0 && p.tickCount < maxTicks) p.tick();
  return p;
}
