/**
 * JochenHippelSTModule.ts - Jochen Hippel's Atari ST song (TFMX-ST / COSO-ST)
 * as the player reads it, every byte accounted for, and its exact inverse.
 *
 * Reversed from the Wanted Team eagleplayer "Jochen Hippel ST" (UADE ships
 * V1.2 as players/Jochen_Hippel_ST; the source read is V1.3,
 * uade master amigasrc/players/wanted_team/Jochen_Hippel_ST/src/Jochen Hippel ST_v4.asm:
 * Check, InitPlayer, Compress, Init lbC0008FE, Play lbC000784/lbC000854).
 * Full write-up: thoughts/shared/research/2026-10-05_hippel-st-replayer.md
 *
 * A file is [prefix][song][trailing]:
 *   prefix   - the original 68000 replay code (.hst), or nothing (.sog, .soc).
 *              The song is found as Check finds it: magic at offset 0, or the
 *              target of the first `lea d16(pc)` ($41FA) in the first 128 words.
 *   song     - 'COSO' (packed; the player plays it in place) or 'TFMX'/'MMME'
 *              (raw; the player packs it into a COSO copy first, Compress).
 *   trailing - what follows the song: digital drum samples (a table of 8-byte
 *              entries whose first word is $80 or $100), a text, or nothing.
 *
 * Raw TFMX song (all counts are "n - 1" words):
 *   +0  magic  +4 snd  +6 vol  +8 patterns  +10 steps  +12 patternSize
 *   +14 (unused)  +16 subsongs (n, the table holds n + 1)  +18 table - 1
 *   +32 sound sequences, 64 bytes each; volume sequences, 64 bytes each;
 *       patterns, patternSize bytes each (rows of note, info; note 1 ends
 *       the pattern); steps, 12 bytes each; subsongs, 6 bytes each (first
 *       step, last step, speed); the table, 6 bytes each.
 *
 * COSO song:
 *   +0 'COSO'  +4 sound pointer table  +8 volume pointer table
 *   +12 pattern pointer table  +16 steps  +20 subsongs  +24 table
 *   +28 drum samples (the player writes it)  +32 the TFMX header (as above)
 *   Pointer tables hold word offsets from the song start, or longs when the
 *   first word of the sound table is 0 (the player's TypeAdr). A pattern is a
 *   byte stream: FF ends it; FE w sets the voice's row wait; FD w sets it and
 *   ends the row with no note; anything else is a note: note, info, and when
 *   info & $E0 one more byte (the portamento speed / sound sequence override).
 *   A voice reads its next event when its wait has run out, so an event lasts
 *   wait + 1 rows.
 *
 * Step (12 bytes): three voices of (pattern, transpose, sound transpose,
 * command). Command $Fx attenuates the voice by x; $Ex sets the speed (ticks
 * per row) from the voice's next row on. The ST has three voices (YM2149).
 */

export const HST_VOICES = 3;
export const HST_STEP_SIZE = 12;
export const HST_SUBSONG_SIZE = 6;
export const HST_HEADER_SIZE = 32;
const SEQ_SIZE = 64;

/** Stream bytes. */
export const HST_END = 0xff;
export const HST_WAIT = 0xfe;
export const HST_REST = 0xfd;

function u16(b: Uint8Array, o: number): number { return (b[o] << 8) | b[o + 1]; }
function u32(b: Uint8Array, o: number): number { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function w16(b: Uint8Array, o: number, v: number): void { b[o] = (v >>> 8) & 0xff; b[o + 1] = v & 0xff; }
function w32(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 24) & 0xff; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff;
}
function s8(v: number): number { return (v << 24) >> 24; }
function magicAt(b: Uint8Array, o: number): string {
  return o >= 0 && o + 4 <= b.length ? String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]) : '';
}

export interface HstStepVoice {
  pattern: number;
  /** Signed note transpose. */
  transpose: number;
  /** Signed volume-sequence (instrument) transpose. */
  soundTranspose: number;
  /** $Fx attenuation, $Ex speed, anything else nothing. */
  command: number;
}

export interface HstSubsong { first: number; last: number; speed: number }

/** The raw TFMX/MMME song: fixed-size sections, the pattern rows as stored. */
export interface HstRawSong {
  kind: 'raw';
  /** The 32-byte header, magic included. */
  header: Uint8Array;
  sndSeqs: Uint8Array[];
  volSeqs: Uint8Array[];
  patternSize: number;
  /** patternSize bytes each: rows of (note, info). */
  patterns: Uint8Array[];
  steps: Uint8Array;
  subsongs: Uint8Array;
  table: Uint8Array;
}

/**
 * The COSO song. The sequences and pattern streams are kept as the regions
 * they sit in (pointer table included); `patternOffsets` locates each pattern
 * stream inside the file's song.
 */
export interface HstCosoSong {
  kind: 'coso';
  /** COSO magic, the seven section offsets and the TFMX header: 64 bytes. */
  head: Uint8Array;
  longPointers: boolean;
  /** [sound table, volume table): the sound pointer table and sequences. */
  sndRegion: Uint8Array;
  /** [volume table, pattern table). */
  volRegion: Uint8Array;
  /** [pattern table, steps): the pattern pointer table and streams. */
  patRegion: Uint8Array;
  steps: Uint8Array;
  subsongs: Uint8Array;
  table: Uint8Array;
}

export interface HstModule {
  prefix: Uint8Array;
  song: HstRawSong | HstCosoSong;
  trailing: Uint8Array;
}

/** Song offset and magic, as the player's Check finds them; null when there is no song. */
export function locateHstSong(b: Uint8Array): { offset: number; magic: string } | null {
  const ok = (o: number) => { const m = magicAt(b, o); return m === 'TFMX' || m === 'MMME' || m === 'COSO' ? m : null; };
  const m0 = ok(0);
  if (m0) return { offset: 0, magic: m0 };
  let a1 = 0;
  for (let n = 0; n < 0x80 && a1 + 4 <= b.length; n++) {
    const op = u16(b, a1); a1 += 2;
    if (op !== 0x41fa) continue;
    const d = u16(b, a1);
    if (d & 0x8000 || d & 1) continue;
    const m = ok(a1 + d);
    if (m) return { offset: a1 + d, magic: m };
  }
  return null;
}

/** Counts from a TFMX header at `h`. */
function headerCounts(b: Uint8Array, h: number) {
  return {
    nSnd: u16(b, h + 4) + 1,
    nVol: u16(b, h + 6) + 1,
    nPat: u16(b, h + 8) + 1,
    nSteps: u16(b, h + 10) + 1,
    patternSize: u16(b, h + 12),
    nSubsongs: u16(b, h + 16),
    nTable: u16(b, h + 18) + 1,
  };
}

function decodeRaw(b: Uint8Array, s: number): { song: HstRawSong; end: number } {
  const c = headerCounts(b, s);
  if (c.patternSize < 2 || c.patternSize & 1) throw new Error('Hippel ST: bad pattern size');
  let o = s + HST_HEADER_SIZE;
  const take = (n: number) => { if (o + n > b.length) throw new Error('Hippel ST: song runs past the end of the file'); const r = b.slice(o, o + n); o += n; return r; };
  const header = b.slice(s, s + HST_HEADER_SIZE);
  const sndSeqs = Array.from({ length: c.nSnd }, () => take(SEQ_SIZE));
  const volSeqs = Array.from({ length: c.nVol }, () => take(SEQ_SIZE));
  const patterns = Array.from({ length: c.nPat }, () => take(c.patternSize));
  const steps = take(c.nSteps * HST_STEP_SIZE);
  const subsongs = take((c.nSubsongs + 1) * HST_SUBSONG_SIZE);
  // Rips cut the trailing zero bytes of the table (demo music10.sog: 4 short,
  // astaroth.sog: 2). The table is kept as far as the file holds it;
  // `rawSongShortfall` tells the player's size check what is missing.
  const table = b.slice(o, Math.min(b.length, o + c.nTable * HST_SUBSONG_SIZE));
  o += table.length;
  return { song: { kind: 'raw', header, sndSeqs, volSeqs, patternSize: c.patternSize, patterns, steps, subsongs, table }, end: o };
}

function decodeCoso(b: Uint8Array, s: number): { song: HstCosoSong; end: number } {
  if (s + 64 > b.length) throw new Error('Hippel ST: COSO header past the end of the file');
  const off = (i: number) => u32(b, s + 4 + i * 4);
  const [snd, vol, pat, steps, subs, table] = [0, 1, 2, 3, 4, 5].map(off);
  const c = headerCounts(b, s + 32);
  const tableEnd = table + c.nTable * HST_SUBSONG_SIZE;
  const order = [64, snd, vol, pat, steps, subs, table, tableEnd];
  for (let i = 1; i < order.length; i++) {
    if (order[i] < order[i - 1]) throw new Error('Hippel ST: COSO sections out of order');
  }
  if (snd !== 64) throw new Error('Hippel ST: COSO sound table not after the header');
  if (s + tableEnd > b.length) throw new Error('Hippel ST: COSO song runs past the end of the file');
  if (subs - steps !== c.nSteps * HST_STEP_SIZE || table - subs !== (c.nSubsongs + 1) * HST_SUBSONG_SIZE) {
    throw new Error('Hippel ST: COSO step/subsong sizes disagree with the header');
  }
  const r = (a: number, z: number) => b.slice(s + a, s + z);
  return {
    song: {
      kind: 'coso',
      head: r(0, 64),
      longPointers: u16(b, s + 64) === 0,
      sndRegion: r(snd, vol), volRegion: r(vol, pat), patRegion: r(pat, steps),
      steps: r(steps, subs), subsongs: r(subs, table), table: r(table, tableEnd),
    },
    end: s + tableEnd,
  };
}

/** Read the whole file. Throws when there is no song or a section runs past the end. */
export function decodeHstModule(bytes: Uint8Array): HstModule {
  const loc = locateHstSong(bytes);
  if (!loc) throw new Error('Hippel ST: no TFMX/MMME/COSO song');
  const { song, end } = loc.magic === 'COSO' ? decodeCoso(bytes, loc.offset) : decodeRaw(bytes, loc.offset);
  return { prefix: bytes.slice(0, loc.offset), song, trailing: bytes.slice(end) };
}

/** Write the file back. The exact inverse of decodeHstModule. */
export function encodeHstModule(m: HstModule): Uint8Array {
  const parts: Uint8Array[] = [m.prefix];
  const s = m.song;
  if (s.kind === 'raw') {
    parts.push(s.header, ...s.sndSeqs, ...s.volSeqs, ...s.patterns, s.steps, s.subsongs, s.table);
  } else {
    parts.push(s.head, s.sndRegion, s.volRegion, s.patRegion, s.steps, s.subsongs, s.table);
  }
  parts.push(m.trailing);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ── Song view: steps, subsongs, pattern streams ───────────────────────────

export function hstHeader(m: HstModule): Uint8Array {
  return m.song.kind === 'raw' ? m.song.header : m.song.head.subarray(32, 64);
}

export function hstStepCount(m: HstModule): number { return m.song.steps.length / HST_STEP_SIZE; }

export function hstStep(m: HstModule, step: number, voice: number): HstStepVoice {
  const o = step * HST_STEP_SIZE + voice * 4;
  const st = m.song.steps;
  return { pattern: st[o], transpose: s8(st[o + 1]), soundTranspose: s8(st[o + 2]), command: st[o + 3] };
}

/** Subsongs as the player counts them (header word +16); entry n plays for subsong n + 1. */
export function hstSubsongs(m: HstModule): HstSubsong[] {
  const n = u16(hstHeader(m), 16);
  const t = m.song.subsongs;
  const out: HstSubsong[] = [];
  for (let i = 0; i < n; i++) out.push({ first: u16(t, i * 6), last: u16(t, i * 6 + 2), speed: u16(t, i * 6 + 4) });
  return out;
}

/** One pattern stream token. `at` is its offset in the pattern's stream bytes. */
export type HstToken =
  | { kind: 'end'; at: number }
  | { kind: 'wait'; at: number; wait: number }
  | { kind: 'rest'; at: number; wait: number }
  | { kind: 'note'; at: number; note: number; info: number; extra: number | null };

/** Tokenise a COSO pattern stream up to and including its end byte. */
export function tokenizeHstStream(b: Uint8Array, start: number): HstToken[] {
  const out: HstToken[] = [];
  let p = start;
  while (p < b.length) {
    const v = b[p];
    if (v === HST_END) { out.push({ kind: 'end', at: p - start }); return out; }
    if (v === HST_WAIT || v === HST_REST) {
      if (p + 1 >= b.length) break;
      out.push({ kind: v === HST_WAIT ? 'wait' : 'rest', at: p - start, wait: b[p + 1] });
      p += 2;
      continue;
    }
    if (p + 1 >= b.length) break;
    const info = b[p + 1];
    const long = (info & 0xe0) !== 0;
    if (long && p + 2 >= b.length) break;
    out.push({ kind: 'note', at: p - start, note: v, info, extra: long ? b[p + 2] : null });
    p += long ? 3 : 2;
  }
  throw new Error('Hippel ST: pattern stream without an end byte');
}

/** Pattern pointer `i` of a COSO song, as an offset from the song start. */
export function cosoPatternOffset(s: HstCosoSong, i: number): number {
  return s.longPointers ? u32(s.patRegion, i * 4) : u16(s.patRegion, i * 2);
}

/** Offset of the pattern region inside the song (header +12). */
export function cosoPatRegionStart(s: HstCosoSong): number { return u32(s.head, 12); }

/**
 * Compress (the player's lbC002922): one raw pattern as the COSO stream the
 * player plays. Empty rows (note 0) fold into the wait of the note before,
 * leading empty rows become FD; note 1, or the last row, ends the pattern.
 * The extra byte of a note whose info has $E0 bits is the byte before the
 * note in the raw pattern (the previous row's info; for row 0 the pattern's
 * last byte).
 */
export function compressHstPattern(pat: Uint8Array): Uint8Array {
  const out: number[] = [];
  const rows = pat.length >> 1;
  let d6 = 0;
  let d7 = -1;
  let a5 = 0;
  for (;;) {
    if (pat[a5] === 1) break;
    if (pat[a5] !== 0) break;
    a5 += 2; d6++;
    if (d6 === rows) break;
  }
  if (d6 === rows || pat[a5] === 1 || a5 >= pat.length) {
    if (d6 !== 0) { d6--; d7 = d6; out.push(HST_REST, d6 & 0xff); }
    out.push(HST_END);
    return new Uint8Array(out);
  }
  if (d6 !== 0) { d6--; d7 = d6; out.push(HST_REST, d6 & 0xff); d6++; }
  for (;;) {
    let d4 = 0;
    const d1 = pat[a5];
    const d2 = pat[a5 + 1];
    const extra = (d2 & 0xe0) !== 0 ? (d6 === 0 ? pat[pat.length - 1] : pat[a5 - 1]) : null;
    const emit = () => { out.push(d1, d2); if (extra !== null) out.push(extra); };
    let last = false;
    for (;;) {
      a5 += 2; d6++; d4++;
      if (d6 === rows || pat[a5] === 1) { last = true; break; }
      if (pat[a5] !== 0) break;
    }
    d4--;
    if (d4 !== d7) { d7 = d4; out.push(HST_WAIT, d4 & 0xff); }
    emit();
    if (last) { out.push(HST_END); return new Uint8Array(out); }
  }
}

/** Compress (the player's routine): a raw song as the COSO song the player builds from it. */
export function compressHstSong(s: HstRawSong): Uint8Array {
  const out: number[] = [];
  const push = (a: ArrayLike<number>) => { for (let i = 0; i < a.length; i++) out.push(a[i]); };
  const align = () => { if (out.length & 1) out.push(0); };
  push([0x43, 0x4f, 0x53, 0x4f]);
  for (let i = 4; i < 32; i++) out.push(0);
  push(s.header);
  const offsets: number[] = [];
  const seqTable = (seqs: Uint8Array[], body: (seq: Uint8Array, next: number) => Uint8Array, after: number) => {
    offsets.push(out.length);
    const table = out.length;
    for (let i = 0; i < seqs.length * 2; i++) out.push(0);
    seqs.forEach((seq, i) => {
      out[table + i * 2] = (out.length >> 8) & 0xff;
      out[table + i * 2 + 1] = out.length & 0xff;
      push(body(seq, i + 1 < seqs.length ? seqs[i + 1][0] : after));
    });
    align();
  };
  seqTable(s.sndSeqs, truncateHstSeq, s.volSeqs[0]?.[0] ?? 0);
  seqTable(s.volSeqs, truncateHstSeq, s.patterns[0]?.[0] ?? 0);
  seqTable(s.patterns, compressHstPattern, 0);
  offsets.push(out.length);
  push(s.steps);
  offsets.push(out.length);
  push(s.subsongs);
  offsets.push(out.length);
  push(s.table);
  // A cut table reads as zeros (the player's song image is zero-filled).
  for (let i = s.table.length; i < (u16(s.header, 18) + 1) * HST_SUBSONG_SIZE; i++) out.push(0);
  offsets.push(out.length);
  const b = new Uint8Array(out);
  offsets.forEach((v, i) => w32(b, 4 + i * 4, v));
  return b;
}

/**
 * The sequence bytes Compress copies (lbC0028E4): up to the last $E1 (end)
 * found scanning back from the end, or past an $E0 (loop) and its offset;
 * the whole 64 bytes when there is neither. An $E0 in the last byte copies
 * one byte more: `next`, the byte after the sequence in the raw song.
 */
export function truncateHstSeq(seq: Uint8Array, next = 0): Uint8Array {
  let a4 = seq.length;
  for (let d7 = 0x3f; d7 >= 0; d7--) {
    a4--;
    if (seq[a4] === 0xe1) return seq.slice(0, d7 + 1);
    if (seq[a4] === 0xe0) {
      if (d7 + 2 <= seq.length) return seq.slice(0, d7 + 2);
      const out = new Uint8Array(d7 + 2);
      out.set(seq);
      out[seq.length] = next;
      return out;
    }
  }
  return seq.slice(0, 64);
}

/**
 * Every pattern of the song as the player reads it: the COSO stream bytes
 * (for a raw song, Compress's output) and, for a COSO song, the stream's
 * offset in the file's song.
 */
export function hstPatternStreams(m: HstModule): Array<{ bytes: Uint8Array; songOffset: number | null }> {
  const s = m.song;
  if (s.kind === 'raw') return s.patterns.map((p) => ({ bytes: compressHstPattern(p), songOffset: null }));
  const base = cosoPatRegionStart(s);
  const n = u16(s.head, 32 + 8) + 1;
  const out: Array<{ bytes: Uint8Array; songOffset: number }> = [];
  for (let i = 0; i < n; i++) {
    const off = cosoPatternOffset(s, i);
    const rel = off - base;
    if (rel < 0 || rel >= s.patRegion.length) throw new Error(`Hippel ST: pattern ${i} points outside the pattern region`);
    const toks = tokenizeHstStream(s.patRegion, rel);
    const end = rel + toks[toks.length - 1].at + 1;
    out.push({ bytes: s.patRegion.slice(rel, end), songOffset: off });
  }
  return out;
}

export { u16 as hstU16, u32 as hstU32, w16 as hstW16, w32 as hstW32 };

// ── The player's sequencer, row by row ────────────────────────────────────

/** One event a voice reads, at the row it reads it (rows count from the start of the run). */
export interface HstVoiceEvent {
  row: number;
  /** Index into the step table. */
  step: number;
  pattern: number;
  /** Offset of the event in the pattern's stream. */
  at: number;
  kind: 'note' | 'rest';
  note: number;
  info: number;
  extra: number | null;
  transpose: number;
  soundTranspose: number;
}

/** Where a voice starts a step: the row it read the step's pattern from. */
export interface HstStepStart { row: number; step: number; voice: number }

export interface HstPlayback {
  events: HstVoiceEvent[][];
  stepStarts: HstStepStart[];
  /** Rows of one pass (voice 0 ended the run on the next row). */
  rows: number;
  /** Speed (ticks per row) in force from each row on: [row, speed] in row order. */
  speeds: Array<[number, number]>;
  /** Tick at which each row starts. */
  rowTicks: number[];
}

/**
 * Run the player's sequencer (Init lbC0008FE, Play lbC000784) over steps
 * first..last for one pass. Every row the three voices count down their wait
 * and, when it has run out, read stream bytes until a note or a rest: FF
 * loads the voice's next step (voice 0 ends the pass after `last`), FE sets
 * the wait, FD sets it and rests. A step's $Ex command sets the speed from the
 * next row on (the counter was reloaded before the voices ran); the first
 * step's is not read (Init reads only $Fx).
 */
export function runHstSequencer(m: HstModule, first: number, last: number, speed: number, maxRows = 1 << 16): HstPlayback {
  const nSteps = hstStepCount(m);
  if (first >= nSteps) throw new Error('Hippel ST: subsong starts past the step table');
  const streams = hstPatternStreams(m).map((p) => p.bytes);
  const voices = Array.from({ length: HST_VOICES }, (_, v) => {
    const st = hstStep(m, first, v);
    return { stepIdx: first, next: first + 1, pattern: st.pattern, pos: 0, wait: 0, counter: 0, tr: st.transpose, sound: st.soundTranspose };
  });
  let stepsLeft = last - first;
  let current = speed;
  let pending = speed;
  const events: HstVoiceEvent[][] = voices.map(() => []);
  const stepStarts: HstStepStart[] = voices.map((_, v) => ({ row: 0, step: first, voice: v }));
  const speeds: Array<[number, number]> = [[0, speed]];
  const rowTicks: number[] = [];
  let tick = 0;
  let ended = false;
  let row = 0;
  for (; row < maxRows && !ended; row++) {
    if (pending !== current) { current = pending; speeds.push([row, current]); }
    rowTicks.push(tick);
    tick += current === 0 ? 0x10000 : current;
    voices.forEach((vs, v) => {
      vs.counter = (vs.counter - 1) & 0xff;
      if (!(vs.counter & 0x80)) return;
      vs.counter = vs.wait;
      for (let guard = 0; guard < 4096; guard++) {
        const s = streams[vs.pattern];
        if (!s) throw new Error(`Hippel ST: step names missing pattern ${vs.pattern}`);
        const b = s[vs.pos];
        if (b === HST_END || b === undefined) {
          if (v === 0) {
            stepsLeft--;
            if (stepsLeft < 0) {
              ended = true;
              stepsLeft = last - first;
              for (const o of voices) o.next = first;
            }
          }
          const stepIdx = vs.next;
          if (stepIdx >= nSteps) throw new Error('Hippel ST: song runs past the step table');
          const st = hstStep(m, stepIdx, v);
          vs.stepIdx = stepIdx;
          vs.next = stepIdx + 1;
          vs.tr = st.transpose;
          vs.sound = st.soundTranspose;
          if ((st.command & 0xf0) === 0xe0) pending = st.command & 0x0f;
          vs.pattern = st.pattern;
          vs.pos = 0;
          if (!ended) stepStarts.push({ row, step: stepIdx, voice: v });
          continue;
        }
        if (b === HST_WAIT || b === HST_REST) {
          vs.wait = vs.counter = s[vs.pos + 1];
          const at = vs.pos;
          vs.pos += 2;
          if (b === HST_WAIT) continue;
          events[v].push({ row, step: vs.stepIdx, pattern: vs.pattern, at, kind: 'rest', note: 0, info: 0, extra: null, transpose: vs.tr, soundTranspose: vs.sound });
          return;
        }
        const info = s[vs.pos + 1];
        const extra = info & 0xe0 ? s[vs.pos + 2] : null;
        const at = vs.pos;
        vs.pos += extra === null ? 2 : 3;
        events[v].push({ row, step: vs.stepIdx, pattern: vs.pattern, at, kind: 'note', note: b, info, extra, transpose: vs.tr, soundTranspose: vs.sound });
        return;
      }
      throw new Error('Hippel ST: pattern stream loops without a row');
    });
  }
  // The row on which voice 0 ended the pass belongs to the next pass.
  const rows = ended ? row - 1 : row;
  for (const list of events) while (list.length && list[list.length - 1].row >= rows) list.pop();
  return {
    events, rows,
    stepStarts: stepStarts.filter((s) => s.row < rows),
    speeds: speeds.filter(([r]) => r < rows),
    rowTicks: rowTicks.slice(0, rows),
  };
}

/** The subsong as InitSound plays it: speed 0 is 4, a backwards range is step 0 alone. */
export function hstSubsongRange(m: HstModule, index: number): HstSubsong {
  const sub = hstSubsongs(m)[index] ?? { first: 0, last: 0, speed: 0 };
  const speed = sub.speed === 0 ? 4 : sub.speed;
  return sub.last < sub.first ? { first: 0, last: 0, speed } : { first: sub.first, last: sub.last, speed };
}

/** One pass of subsong `index` (0-based; the player's dtg_SndNum is index + 1). */
export function simulateHstSubsong(m: HstModule, index: number, maxRows = 1 << 16): HstPlayback {
  const r = hstSubsongRange(m, index);
  return runHstSequencer(m, r.first, r.last, r.speed, maxRows);
}

// ── Pattern rows: the grid's view of a pattern, and its streams ──────────

/** A pattern row: an empty row (note === null) or a note event (note byte, info, extra byte when info & $E0). */
export interface HstRow { note: number | null; info: number; extra: number | null }

/**
 * Rows of every pattern, by pattern index, from the voices' reads: an event
 * read on row r of a step is row r of the step's pattern for that voice,
 * the rows it waits are empty. Every step the runs reach is used; a pattern
 * read twice must read the same rows (a stream that leans on the wait left
 * by the pattern before it would not). Steps no subsong reaches are run
 * alone. Returns rows per step too (all three voices end a step together).
 */
export function hstPatternRows(m: HstModule): { patterns: Array<HstRow[] | null>; stepRows: Array<number | null> } {
  const nSteps = hstStepCount(m);
  const nPat = hstPatternStreams(m).length;
  const patterns: Array<HstRow[] | null> = Array(nPat).fill(null);
  const stepRows: Array<number | null> = Array(nSteps).fill(null);
  const absorb = (p: HstPlayback) => {
    const starts = HST_VOICES_LIST.map((v) => p.stepStarts.filter((s) => s.voice === v));
    for (let k = 0; k < starts[0].length; k++) {
      const s0 = starts[0][k];
      const end = k + 1 < starts[0].length ? starts[0][k + 1].row : p.rows;
      for (const v of HST_VOICES_LIST) {
        const sv = starts[v][k];
        const endV = k + 1 < starts[v].length ? starts[v][k + 1].row : p.rows;
        if (!sv || sv.step !== s0.step || sv.row !== s0.row || endV !== end) throw new Error('Hippel ST: voices do not keep step together');
      }
      const n = end - s0.row;
      if (stepRows[s0.step] !== null && stepRows[s0.step] !== n) throw new Error(`Hippel ST: step ${s0.step} plays ${stepRows[s0.step]} and ${n} rows`);
      stepRows[s0.step] = n;
      for (const v of HST_VOICES_LIST) {
        const pt = hstStep(m, s0.step, v).pattern;
        const rows: HstRow[] = Array.from({ length: n }, () => ({ note: null, info: 0, extra: null }));
        for (const e of p.events[v]) {
          if (e.row < s0.row || e.row >= end || e.kind !== 'note') continue;
          rows[e.row - s0.row] = { note: e.note, info: e.info, extra: e.extra };
        }
        const prev = patterns[pt];
        if (prev && !sameRows(prev, rows)) throw new Error(`Hippel ST: pattern ${pt} reads differently in two steps`);
        patterns[pt] = rows;
      }
    }
  };
  for (let i = 0; i < hstSubsongs(m).length; i++) absorb(simulateHstSubsong(m, i));
  for (let st = 0; st < nSteps; st++) {
    if (stepRows[st] !== null) continue;
    try { absorb(runHstSequencer(m, st, st, 4)); } catch { /* a step no subsong plays and that does not play alone */ }
  }
  return { patterns, stepRows };
}

const HST_VOICES_LIST = [0, 1, 2] as const;

function sameRows(a: HstRow[], b: HstRow[]): boolean {
  return a.length === b.length && a.every((r, i) => r.note === b[i].note && r.info === b[i].info && r.extra === b[i].extra);
}

/** Row bytes as the per-row stream holds them: a note event, or FD 00 for an empty row. */
function rowBytes(r: HstRow): number[] {
  if (r.note === null) return [HST_REST, 0];
  return r.extra === null ? [r.note, r.info] : [r.note, r.info, r.extra];
}

/**
 * A pattern as one event per row: every row is read (wait 0), an empty row
 * is FD 00. It plays the rows the packed stream plays, on the same rows, and
 * a row's bytes stay where they are while the rows before it keep their
 * length - so a grid edit is a write of that row.
 */
export function perRowHstStream(rows: HstRow[]): Uint8Array {
  const out: number[] = [];
  for (const r of rows) out.push(...rowBytes(r));
  out.push(HST_END);
  return new Uint8Array(out);
}

/** Offset of each row in perRowHstStream(rows). */
export function perRowHstOffsets(rows: HstRow[]): number[] {
  const out: number[] = [];
  let o = 0;
  for (const r of rows) { out.push(o); o += rowBytes(r).length; }
  return out;
}

/**
 * Pack rows as a COSO stream the way Compress does: leading empty rows are
 * one FD, a note's wait (the empty rows after it) is set with FE only when
 * it changes, FF ends the pattern.
 */
export function packHstRows(rows: HstRow[]): Uint8Array {
  const out: number[] = [];
  let i = 0;
  let wait = -1;
  while (i < rows.length && rows[i].note === null) i++;
  if (i > 0) { wait = i - 1; out.push(HST_REST, wait); }
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].note === null) j++;
    const w = j - i - 1;
    if (w !== wait) { wait = w; out.push(HST_WAIT, w); }
    out.push(...rowBytes(rows[i]));
    i = j;
  }
  out.push(HST_END);
  return new Uint8Array(out);
}
