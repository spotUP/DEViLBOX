/**
 * FredEditorModule.ts - a Fred Editor (Final) module as its replayer reads it,
 * every byte accounted for, and its exact inverse.
 *
 * A .fred file is the "music module" FrEd v0.90 saves: the replay routine
 * itself (four jmps: Init / Play / Stop / FadeOut) followed by the song data
 * it was assembled with. Reversed from the replayer source
 * docs/formats/Replayers/FredEditor/FREDPLA0.2ED (Lab2_*), the same code that
 * sits at the top of every corpus file. Write-up:
 * thoughts/shared/research/2026-10-06_fred-editor-format.md
 *
 * Layout (Base = the module's Lab2_Base, file offset `base`; D = dataPtr):
 *   [0, D+0xB0E)         code + replayer variables, kept verbatim. Among them
 *                        D+0x895 MaxPart (subsongs - 1), D+0x897 Tempo[10]
 *                        (start tempo per subsong), D+0x8A2 OffsetStruct and
 *                        D+0x8A6 OffsetPattern (longs, relative to Base).
 *   [D+0xB0E, patStart)  Lab2_BlockTrk: per subsong 4 words = offsets (from
 *                        BlockTrk) of each voice's track list, then the track
 *                        lists: words = pattern offset (from patStart), a word
 *                        with bit 15 = jump to byte offset (word & 0x7FFF) in
 *                        the same list, $FFFF = stop the music.
 *   [patStart, struct)   the patterns, one after another, each a command
 *                        stream ended by $80; then a pad byte or none.
 *   [struct, pcm)        64-byte instrument records (Lab2_InsStr).
 *   [pcm, end)           sample data (InsAdr longs point here, from Base).
 *
 * Pattern command stream (Lab2_NewLine):
 *   $00-$7F  note: plays for one line (TempoCur ticks)
 *   $80      end of pattern: the voice takes its next track-list entry
 *   $81 s n d portamento (zero time): glide to note n over s lines, after d lines
 *   $82 t    tempo (zero time): TempoCur = t, for every voice
 *   $83 i    instrument (zero time): the voice plays instrument record i
 *   $84      pause: DMA off for one line
 *   $85-$FF  hold: the voice waits (256 - byte) lines (FrEd writes $A1..$FF, 1..95)
 *
 * Decoded, a pattern is a list of LINES (one line = TempoCur ticks): what
 * starts on that line (note / pause / nothing = held) and the zero-time
 * commands read just before it. Encoding a line list is canonical - holds in
 * chunks of 95, commands in the order tempo, portamento, instrument - and
 * every corpus pattern IS canonical, so decode -> encode is byte-exact
 * (fredEditorModule.test.ts asserts it per pattern).
 */

/** Command bytes (Lab2_* EndCode..MaxCode). */
export const FRED_END = 0x80;
export const FRED_PORT = 0x81;
export const FRED_TEMPO = 0x82;
export const FRED_INS = 0x83;
export const FRED_PAUSE = 0x84;
/** Bytes above MaxCode ($A0) are holds; FrEd writes 1..95 lines per byte. */
export const FRED_MAX_HOLD = 95;
export const FRED_INSTRUMENT_SIZE = 64;
/** Offset of Lab2_BlockTrk from dataPtr. */
const BLOCKTRK = 0xb0e;
const MAXPART = 0x895;
const TEMPO = 0x897;
const OFFSET_STRUCT = 0x8a2;
const OFFSET_PATTERN = 0x8a6;

export interface FredPorta {
  /** Glide length in lines (Lab2_TrkSpd = lines * TempoCur ticks). */
  lines: number;
  /** Target note byte. */
  note: number;
  /** Lines before the glide starts. */
  delay: number;
}

/** One line of a pattern. A line with neither `note` nor `pause` is held (silent rest when nothing sounds). */
export interface FredLine {
  /** Note byte 0..127 started on this line. */
  note?: number;
  /** $84: DMA off for this line. */
  pause?: boolean;
  /** $83 argument read before this line's event. */
  instrument?: number;
  /** $82 argument read before this line's event. */
  tempo?: number;
  /** $81 read before this line's event. */
  porta?: FredPorta;
}

export interface FredPattern {
  /** Byte offset from patStart in the decoded file. */
  offset: number;
  lines: FredLine[];
}

export interface FredModule {
  /** File offset of Lab2_Base (offsets in the module are relative to it; may be negative in ripped files). */
  base: number;
  /** File offset the replayer variables are addressed from (D). */
  dataPtr: number;
  /** [0, D+0xB0E): code and replayer variables, verbatim. */
  code: Uint8Array;
  /** Subsongs (MaxPart + 1). */
  songs: number;
  /** Start tempo per subsong. */
  tempos: number[];
  /** Words of Lab2_BlockTrk: songs*4 list offsets, then the track lists. */
  trackWords: number[];
  patterns: FredPattern[];
  /** Bytes between the last $80 and the instrument records: FrEd's pad byte to an even address, or none. */
  patternTail: Uint8Array;
  /** 64-byte instrument records, verbatim. */
  instruments: Uint8Array[];
  /** Everything after the records: sample data. */
  pcm: Uint8Array;
}

function u16(b: Uint8Array, o: number): number { return (b[o] << 8) | b[o + 1]; }
function u32(b: Uint8Array, o: number): number { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function s16(b: Uint8Array, o: number): number { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; }
function w16(b: Uint8Array, o: number, v: number): void { b[o] = (v >>> 8) & 0xff; b[o + 1] = v & 0xff; }
function w32(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 24) & 0xff; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff;
}

/**
 * dataPtr and Base from the replay code (the FlodJS FEPlayer loader's scan):
 * `move.b MaxPart(pc),d1 / cmp.b d1,d0` in InitReplay gives D, the first
 * `move.l a2,(a0) / lea Base(pc),a3` gives Base. Null when not a Fred module.
 */
export function locateFredModule(bytes: Uint8Array): { dataPtr: number; base: number } | null {
  if (bytes.length < 1024) return null;
  for (let p = 0; p < 16; p += 4) if (u16(bytes, p) !== 0x4efa) return null;
  let dataPtr = -1;
  for (let p = 16; p + 8 <= 1024; p += 2) {
    const v = u16(bytes, p);
    if (v === 0x123a && u16(bytes, p + 4) === 0xb001) dataPtr = p + 2 + u16(bytes, p + 2) - MAXPART;
    else if (v === 0x214a && u16(bytes, p + 4) === 0x47fa) {
      if (dataPtr < 0) return null;
      return { dataPtr, base: p + 6 + s16(bytes, p + 6) };
    }
  }
  return null;
}

/** Bytes a command at `p` occupies. */
export function fredCommandLength(byte: number): number {
  if (byte === FRED_PORT) return 4;
  if (byte === FRED_TEMPO || byte === FRED_INS) return 2;
  return 1;
}

/** Lines a hold byte waits. */
export function fredHoldLines(byte: number): number { return 256 - byte; }

/**
 * Decode one pattern starting at `start`; returns the lines and the offset
 * after its $80, or null when the stream runs past `end` without one.
 */
export function decodeFredPattern(bytes: Uint8Array, start: number, end: number): { lines: FredLine[]; next: number } | null {
  const lines: FredLine[] = [];
  let pending: FredLine = {};
  let hasPending = false;
  let p = start;
  while (p < end) {
    const c = bytes[p];
    if (c === FRED_END) {
      if (hasPending) throw new Error(`Fred pattern at ${start}: commands before $80 with no line to carry them`);
      return { lines, next: p + 1 };
    }
    if (p + fredCommandLength(c) > end) return null;
    if (c === FRED_PORT) {
      if (pending.porta) throw new Error(`Fred pattern at ${start}: two portamentos before one line`);
      pending.porta = { lines: bytes[p + 1], note: bytes[p + 2], delay: bytes[p + 3] };
      hasPending = true; p += 4; continue;
    }
    if (c === FRED_TEMPO || c === FRED_INS) {
      const key = c === FRED_TEMPO ? 'tempo' : 'instrument';
      if (pending[key] !== undefined) throw new Error(`Fred pattern at ${start}: two ${key} commands before one line`);
      pending[key] = bytes[p + 1];
      hasPending = true; p += 2; continue;
    }
    if (c < FRED_END) {
      pending.note = c;
      lines.push(pending);
    } else if (c === FRED_PAUSE) {
      pending.pause = true;
      lines.push(pending);
    } else {
      const n = fredHoldLines(c);
      lines.push(pending);
      for (let i = 1; i < n; i++) lines.push({});
    }
    pending = {}; hasPending = false; p++;
  }
  return null;
}

/** True when a line starts something the encoder must write (an event or a command). */
function lineHasContent(l: FredLine): boolean {
  return l.note !== undefined || !!l.pause || l.instrument !== undefined || l.tempo !== undefined || !!l.porta;
}

/** A pattern's bytes, canonical: commands tempo, portamento, instrument; holds in chunks of 95; $80. */
export function encodeFredPattern(lines: readonly FredLine[]): Uint8Array {
  const out: number[] = [];
  const hold = (n: number): void => {
    while (n > 0) { const k = Math.min(n, FRED_MAX_HOLD); out.push(256 - k); n -= k; }
  };
  let i = 0;
  // Lines held from the top (the pattern starts with a hold).
  while (i < lines.length && !lineHasContent(lines[i])) i++;
  hold(i);
  while (i < lines.length) {
    const l = lines[i];
    if (l.tempo !== undefined) out.push(FRED_TEMPO, l.tempo & 0xff);
    if (l.porta) out.push(FRED_PORT, l.porta.lines & 0xff, l.porta.note & 0xff, l.porta.delay & 0xff);
    if (l.instrument !== undefined) out.push(FRED_INS, l.instrument & 0xff);
    let j = i + 1;
    while (j < lines.length && !lineHasContent(lines[j])) j++;
    if (l.note !== undefined) { out.push(l.note & 0x7f); hold(j - i - 1); }
    else if (l.pause) { out.push(FRED_PAUSE); hold(j - i - 1); }
    else hold(j - i); // commands only: the hold starts on this line
    i = j;
  }
  out.push(FRED_END);
  return new Uint8Array(out);
}

/** The offsets the module's sections start at. */
export function fredSections(bytes: Uint8Array, loc = locateFredModule(bytes)): {
  dataPtr: number; base: number; blockTrk: number; patStart: number; structStart: number;
} {
  if (!loc) throw new Error('Not a Fred Editor module');
  const { dataPtr, base } = loc;
  const blockTrk = dataPtr + BLOCKTRK;
  const structStart = base + u32(bytes, dataPtr + OFFSET_STRUCT);
  const patStart = base + u32(bytes, dataPtr + OFFSET_PATTERN);
  if (!(blockTrk <= patStart && patStart <= structStart && structStart <= bytes.length) || ((patStart - blockTrk) & 1)) {
    throw new Error('Fred Editor: section offsets out of order');
  }
  return { dataPtr, base, blockTrk, patStart, structStart };
}

export function decodeFredModule(bytes: Uint8Array): FredModule {
  const { dataPtr, base, blockTrk, patStart, structStart } = fredSections(bytes);
  const songs = bytes[dataPtr + MAXPART] + 1;
  const tempos = Array.from(bytes.subarray(dataPtr + TEMPO, dataPtr + TEMPO + songs));
  const trackWords: number[] = [];
  for (let o = blockTrk; o < patStart; o += 2) trackWords.push(u16(bytes, o));
  if (trackWords.length < songs * 4) throw new Error('Fred Editor: track table shorter than its subsongs');

  const patterns: FredPattern[] = [];
  let p = patStart;
  for (;;) {
    const dec = decodeFredPattern(bytes, p, structStart);
    if (!dec) break;
    patterns.push({ offset: p - patStart, lines: dec.lines });
    p = dec.next;
  }
  const patternTail = bytes.slice(p, structStart);

  // Records run until the first sample's data (FEPlayer: while pos > position).
  const instruments: Uint8Array[] = [];
  let pcmStart = Infinity;
  let q = structStart;
  while (q + FRED_INSTRUMENT_SIZE <= bytes.length && q < pcmStart) {
    const ptr = u32(bytes, q);
    if (ptr) {
      const abs = base + ptr;
      if (abs < q + 4 || abs >= bytes.length) break;
      pcmStart = Math.min(pcmStart, abs);
    }
    instruments.push(bytes.slice(q, q + FRED_INSTRUMENT_SIZE));
    q += FRED_INSTRUMENT_SIZE;
  }
  return {
    base, dataPtr,
    code: bytes.slice(0, blockTrk),
    songs, tempos, trackWords, patterns, patternTail, instruments,
    pcm: bytes.slice(q),
  };
}

/** True when a track word is a pattern offset (not a jump or the stop mark). */
export function isPatternEntry(word: number): boolean { return (word & 0x8000) === 0; }

export function encodeFredModule(m: FredModule): Uint8Array {
  const pats = m.patterns.map((p) => encodeFredPattern(p.lines));
  const newOffset = new Map<number, number>();
  let off = 0;
  m.patterns.forEach((p, i) => { newOffset.set(p.offset, off); off += pats[i].length; });
  // The records are read with word/long moves: keep them on an even address
  // (the tail is FrEd's pad byte; an edit that changes the parity adds or drops it).
  let tail = m.patternTail;
  if (((m.code.length + m.trackWords.length * 2 + off + tail.length) & 1) !== 0) {
    tail = tail.length ? tail.subarray(0, tail.length - 1) : new Uint8Array(1);
  }
  const patBytes = off + tail.length;
  const trackBytes = m.trackWords.length * 2;
  const blockTrk = m.code.length;
  const patStart = blockTrk + trackBytes;
  const structStart = patStart + patBytes;
  const oldStruct = m.base + u32(m.code, m.dataPtr + OFFSET_STRUCT);
  const delta = structStart - oldStruct;
  const total = structStart + m.instruments.length * FRED_INSTRUMENT_SIZE + m.pcm.length;
  const out = new Uint8Array(total);

  out.set(m.code, 0);
  w32(out, m.dataPtr + OFFSET_STRUCT, structStart - m.base);
  w32(out, m.dataPtr + OFFSET_PATTERN, patStart - m.base);
  m.trackWords.forEach((w, i) => {
    let v = w;
    if (i >= m.songs * 4 && isPatternEntry(w)) {
      const moved = newOffset.get(w);
      if (moved === undefined) throw new Error(`Fred Editor: track entry ${w} is not the start of a pattern`);
      v = moved;
    }
    w16(out, blockTrk + i * 2, v);
  });
  let o = patStart;
  for (const p of pats) { out.set(p, o); o += p.length; }
  out.set(tail, o);
  o = structStart;
  for (const rec of m.instruments) {
    out.set(rec, o);
    const ptr = u32(rec, 0);
    if (ptr && delta) w32(out, o, ptr + delta);
    o += FRED_INSTRUMENT_SIZE;
  }
  out.set(m.pcm, o);
  return out;
}

/** Pattern index (in `m.patterns`) by its offset from patStart. */
export function fredPatternIndex(m: FredModule): Map<number, number> {
  return new Map(m.patterns.map((p, i) => [p.offset, i]));
}

/** Byte offset of subsong `song`, voice `voice`'s track list within trackWords (in words). */
export function fredTrackListStart(m: FredModule, song: number, voice: number): number {
  return m.trackWords[song * 4 + voice] >> 1;
}
