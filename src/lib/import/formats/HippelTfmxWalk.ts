/**
 * HippelTfmxWalk.ts - Jochen Hippel's Amiga TFMX song (4 voices, or 7V's 7) as
 * the player walks it.
 *
 * The song is libtfmxaudiodecoder's `HippelDecoder` TFMX path (the engine that
 * plays .hip and .hip7 in the app; tfmx-wasm/lib/libtfmxaudiodecoder/src/Jochen/
 * TFMX.cpp, TFMX7V.cpp, Probe.cpp). Layout (header = the 'TFMX',0 magic):
 *   +4 sound sequences-1, +6 volume sequences-1, +8 patterns-1, +A steps-1,
 *   +D pattern size (0x40), +10 subsongs, +12 samples; from +0x20: sound
 *   sequences (64 bytes each), volume sequences (64), patterns (64 bytes: 32
 *   rows of note, info), the track table, the subsong table, sample headers.
 *   4 voices: a step is 12 bytes, three per voice (pattern, transpose, sound
 *   transpose), a subsong entry 6 bytes (first step, last step, speed). 7V: a
 *   step is 28 bytes, four per voice (the fourth a command), an entry 8 bytes
 *   (speed at +6).
 * A tick: the speed counter runs down; at 0 it reloads and every voice reads a
 * row. A voice whose pattern is out (64 bytes) or whose next note byte is 1
 * (the break) first loads the next step of its own range (wrapping after the
 * last). A row's note byte & $7F is the note (0 = nothing, bit 7 = no new
 * instrument), the info byte & $1F + the step's sound transpose the volume
 * sequence (the instrument).
 *
 * `walkHippelTfmx` runs that and logs it in the records the C decoder's own
 * walk export (tfmx_module_walk_*, Decoder.h walkEnable) gives, so the test
 * can hold one against the other, tick for tick. The grid is built from this
 * walk: one grid pattern per step, as many rows as the voices read in it. A
 * song whose voices do not load their steps on the same tick has no
 * pattern-per-step grid; the walk reports why and the parser opens the song in
 * the scope view.
 */
import { periodToPitch } from '@/lib/amiga/periodNotes';

export const HIPPEL_PATTERN_SIZE = 0x40;
export const HIPPEL_ROWS = 0x20;
/** HippelDecoder::FC14_PERIOD_MIN: the lowest period the player writes. */
const PERIOD_MIN = 0x71;

/** HippelDecoder::periods (Jochen/HippelDecoder.cpp), reachable by `& 0x7F`. */
export const HIPPEL_PERIODS: readonly number[] = [
  0x06b0, 0x0650, 0x05f4, 0x05a0, 0x054c, 0x0500, 0x04b8, 0x0474, 0x0434, 0x03f8, 0x03c0, 0x038a,
  0x0358, 0x0328, 0x02fa, 0x02d0, 0x02a6, 0x0280, 0x025c, 0x023a, 0x021a, 0x01fc, 0x01e0, 0x01c5,
  0x01ac, 0x0194, 0x017d, 0x0168, 0x0153, 0x0140, 0x012e, 0x011d, 0x010d, 0x00fe, 0x00f0, 0x00e2,
  0x00d6, 0x00ca, 0x00be, 0x00b4, 0x00aa, 0x00a0, 0x0097, 0x008f, 0x0087, 0x007f, 0x0078, 0x0071,
  0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071,
  0x0d60, 0x0ca0, 0x0be8, 0x0b40, 0x0a98, 0x0a00, 0x0970, 0x08e8, 0x0868, 0x07f0, 0x0780, 0x0714,
  0x06b0, 0x0650, 0x05f4, 0x05a0, 0x054c, 0x0500, 0x04b8, 0x0474, 0x0434, 0x03f8, 0x03c0, 0x038a,
  0x0358, 0x0328, 0x02fa, 0x02d0, 0x02a6, 0x0280, 0x025c, 0x023a, 0x021a, 0x01fc, 0x01e0, 0x01c5,
  0x01ac, 0x0194, 0x017d, 0x0168, 0x0153, 0x0140, 0x012e, 0x011d, 0x010d, 0x00fe, 0x00f0, 0x00e2,
  0x00d6, 0x00ca, 0x00be, 0x00b4, 0x00aa, 0x00a0, 0x0097, 0x008f, 0x0087, 0x007f, 0x0078, 0x0071,
  0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071, 0x0071,
];

const s8 = (v: number): number => (v << 24) >> 24;
const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const isTfmx = (b: Uint8Array, o: number): boolean => b[o] === 0x54 && b[o + 1] === 0x46 && b[o + 2] === 0x4d && b[o + 3] === 0x58;
const isCoso = (b: Uint8Array, o: number): boolean => b[o] === 0x43 && b[o + 1] === 0x4f && b[o + 2] === 0x53 && b[o + 3] === 0x4f;

/**
 * The period-table index the player plays for pattern note `note` under track
 * transpose `transpose` (TFMX_processPerVol with a sequence transpose of 0): a
 * signed-byte sum, a small underflow looped into the low octave, & $7F.
 */
export function hippelNoteIndex(note: number, transpose: number): number {
  let t = s8(note + transpose);
  if (t < 0 && (t & 0x7f) >= 0x78) t = s8(t + 0x48);
  return t & 0x7f;
}

/**
 * The octave a song's grid is shifted up when the player plays below C-0 (the
 * period table's own lowest octave, indices 60-71, sounds one octave under the
 * notation's note 1). 0 otherwise, so a song that stays in range keeps
 * ProTracker naming (428 = note 25 = C-2).
 */
export const HIPPEL_LOW_BIAS = 12;

/** The pitch of a period-table index in ProTracker naming; at or below 0 under C-0. */
export function hippelIndexToPitch(index: number): number {
  return periodToPitch(Math.max(PERIOD_MIN, HIPPEL_PERIODS[index & 0x7f]));
}

/** The grid note of a period-table index, `bias` notes up (HIPPEL_LOW_BIAS for a song that plays below C-0). */
export function hippelIndexToXm(index: number, bias = 0): number {
  return Math.max(1, hippelIndexToPitch(index) + bias);
}

/**
 * The period-table index the player plays for a note under a track transpose
 * and a sound sequence's transpose `seq` (TFMX_processPerVol): a sequence
 * transpose below 0 is the note itself (a fixed-pitch instrument), else it is
 * added to the pattern note and the step's transpose.
 */
export function hippelPlayedIndex(noteByte: number, transpose: number, seq = 0): number {
  return seq < 0 ? hippelNoteIndex(0, seq) : hippelNoteIndex(noteByte & 0x7f, transpose + seq);
}

/** The grid note a pattern note plays under a track transpose and sequence transpose; 0 when the row has none (note byte & $7F of 0 or 1). */
export function hippelCellNote(noteByte: number, transpose: number, seq = 0, bias = 0): number {
  const n = noteByte & 0x7f;
  return n < 2 ? 0 : hippelIndexToXm(hippelPlayedIndex(n, transpose, seq), bias);
}

/**
 * The pattern note (2..$7F) under which the player plays grid note `note`, the
 * one nearest the plain `note - 1 - bias - transpose - seq`; null when none does
 * (a fixed-pitch sound sequence ignores the pattern note, or the note is
 * outside what the table reaches).
 */
export function hippelNoteByteFor(note: number, transpose: number, seq = 0, bias = 0): number | null {
  if (seq < 0) return null;
  const guess = Math.min(0x7f, Math.max(2, note - 1 - bias - transpose - seq));
  for (let d = 0; d <= 0x7f; d++) {
    for (const n of d === 0 ? [guess] : [guess + d, guess - d]) {
      if (n >= 2 && n <= 0x7f && hippelCellNote(n, transpose, seq, bias) === note) return n;
    }
  }
  return null;
}

/** Sound-sequence transposes the decoder applied at note starts, by `hippelPlayedKey`. Absent = none known (0). */
export type HippelPlayed = ReadonlyMap<string, number>;

export const hippelPlayedKey = (step: number, voice: number, row: number): string => `${step}:${voice}:${row}`;

/**
 * The sound-sequence transpose in force at each note start, from the decoder's
 * walk records (kind 2 follows the row read, kind 1, of the same voice and
 * tick): the first pass of each step's row is the one the grid shows.
 */
export function hippelPlayedFromRecords(records: readonly HippelWalkRecord[]): HippelPlayed {
  const out = new Map<string, number>();
  const row = new Map<number, number>();
  for (const r of records) {
    if (r[1] === 1) row.set(r[2], r[4]);
    else if (r[1] === 2) {
      const key = hippelPlayedKey(r[3], r[2], row.get(r[2]) ?? 0);
      if (!out.has(key)) out.set(key, r[8]);
    }
  }
  return out;
}

export interface HippelTfmx {
  buf: Uint8Array;
  /** Offset of the 'TFMX' magic. */
  header: number;
  voices: 4 | 7;
  /** Track table bytes per voice in a step (3, or 4 with a command). */
  columnSize: 3 | 4;
  stepLen: number;
  songEntrySize: 6 | 8;
  nSound: number;
  nVolume: number;
  nPatterns: number;
  nSteps: number;
  nSongs: number;
  nSamples: number;
  patternsOff: number;
  trackOff: number;
  songTabOff: number;
  sampleHeadersOff: number;
  sampleDataOff: number;
}

/**
 * Where the decoder finds the song: the first 'TFMX' followed by a zero byte
 * (TFMX_findTag), not preceded by 'COSO' 0x20 before it. Null when there is none.
 */
export function findHippelTfmxHeader(buf: Uint8Array): number | null {
  for (let h = 0; h + 5 <= buf.length; h++) {
    if (!isTfmx(buf, h)) continue;
    if (buf[h + 4] !== 0) return null;
    if (h >= 0x20 && isCoso(buf, h - 0x20)) return null;
    return h;
  }
  return null;
}

/**
 * The song's layout as HippelDecoder::TFMX_init reads it, 4 or 7 voices by
 * the decoder's own rule (7V only when the 4-voice layout is implausible and
 * the 7-voice one is not). Null when the sections do not fit the file.
 */
export function readHippelTfmx(buf: Uint8Array, header = findHippelTfmxHeader(buf)): HippelTfmx | null {
  if (header === null || header + 0x20 > buf.length) return null;
  const h = header;
  if (buf[h + 0xd] !== HIPPEL_PATTERN_SIZE) return null;
  const nSound = 1 + u16(buf, h + 4);
  const nVolume = 1 + u16(buf, h + 6);
  const nPatterns = 1 + u16(buf, h + 8);
  const nSteps = 1 + u16(buf, h + 0xa);
  const nSongs = u16(buf, h + 0x10);
  const nSamples = Math.min(256, u16(buf, h + 0x12));
  const patternsOff = h + 0x20 + nSound * 64 + nVolume * 64;
  const trackOff = patternsOff + nPatterns * HIPPEL_PATTERN_SIZE;

  const sampleHeadersPlausible = (headers: number, structSize: number): boolean => {
    let sh = headers;
    const dataOff = headers + nSamples * structSize;
    for (let s = 0; s < nSamples; s++) {
      sh += 0x12;
      if (sh + 8 > buf.length || buf[sh] !== 0 || buf[sh + 6] !== 0) return false;
      if (u32(buf, sh) + dataOff > buf.length) return false;
      sh += structSize - 0x12;
    }
    return true;
  };
  // Sample headers are 0x12 (name) + 4 + 2 + 4 + 2 bytes.
  const SAMPLE = 0x1e;

  const songTab4 = trackOff + nSteps * 12;
  if (songTab4 + 6 * (nSongs + 1) >= buf.length) return null;
  const heads4 = songTab4 + 6 * (nSongs + 1);
  const probe4 = songTab4 + 6 * nSongs;
  const maybe4 = probe4 < buf.length && u16(buf, probe4) === 0 && u16(buf, probe4 + 2) === 0 && buf[probe4 + 4] === 0
    && sampleHeadersPlausible(heads4, SAMPLE);

  const probe7 = trackOff + nSteps * 28 + nSongs * 8;
  let maybe7 = probe7 < buf.length && u32(buf, probe7) === 0 && u32(buf, probe7 + 4) === 0;
  if (maybe7) {
    // The 7V sample headers follow the empty entry; the decoder skips the 0x12 name of the first before it looks.
    let sh = probe7 + 8 + 0x12;
    const dataOff = probe7 + 8 + nSamples * SAMPLE;
    for (let s = 0; s < nSamples && maybe7; s++) {
      if (sh + 8 > buf.length || buf[sh] !== 0 || buf[sh + 6] !== 0 || u32(buf, sh) + dataOff > buf.length) maybe7 = false;
      sh += SAMPLE;
    }
  }

  if (!maybe4 && maybe7) {
    const songTab = trackOff + nSteps * 28;
    const heads = songTab + (nSongs + 1) * 8;
    return {
      buf, header: h, voices: 7, columnSize: 4, stepLen: 28, songEntrySize: 8,
      nSound, nVolume, nPatterns, nSteps, nSongs, nSamples, patternsOff, trackOff,
      songTabOff: songTab, sampleHeadersOff: heads, sampleDataOff: heads + nSamples * SAMPLE,
    };
  }
  return {
    buf, header: h, voices: 4, columnSize: 3, stepLen: 12, songEntrySize: 6,
    nSound, nVolume, nPatterns, nSteps, nSongs, nSamples, patternsOff, trackOff,
    songTabOff: songTab4, sampleHeadersOff: heads4, sampleDataOff: heads4 + nSamples * SAMPLE,
  };
}

export interface HippelSubsong { first: number; last: number; speed: number }

/** Subsong `index` as the decoder's startSong + setTrackRange read it (a range the table cannot hold is the whole table). */
export function hippelSubsong(m: HippelTfmx, index: number): HippelSubsong {
  const e = m.songTabOff + index * m.songEntrySize;
  const first = u16(m.buf, e);
  const last = u16(m.buf, e + 2);
  const speed = u16(m.buf, e + (m.voices === 7 ? 6 : 4));
  const tab = m.nSteps * m.stepLen;
  const from = first * m.stepLen < tab ? first : 0;
  const to = (last + 1) * m.stepLen <= tab ? last : m.nSteps - 1;
  return { first: from, last: to, speed: speed === 0 ? 3 : speed };
}

/**
 * One walk record, the C decoder's: ints [tick, kind, voice, step, a..f].
 *   kind 0 step load:  a pattern, b transpose, c sound transpose, d command byte (7V), e speed, f voices
 *   kind 1 row read:   a row, b note byte, c info byte, d transpose, e sound transpose, f speed
 *   kind 2 note:       a period-table index, b period (min-clamped, before vibrato), c pattern note, d transpose,
 *                      e sequence transpose (always 0 here), f volume sequence playing
 * Kind 2 is the player's own pitch lookup; the log from this walk carries it
 * for a sequence transpose of 0 (a sound sequence that transposes moves it).
 */
export type HippelWalkRecord = [number, number, number, number, number, number, number, number, number, number];

/** Run the decoder's TFMX sequencer over subsong `index` and log it. */
export function walkHippelTfmx(m: HippelTfmx, index: number, maxTicks: number): HippelWalkRecord[] {
  const { buf } = m;
  const sub = hippelSubsong(m, index);
  const out: HippelWalkRecord[] = [];
  const voices = Array.from({ length: m.voices }, () => ({
    trackPos: 0, pattStart: 0, pattPos: HIPPEL_PATTERN_SIZE, transpose: 0, soundTranspose: 0,
    fresh: false, note: 0, info: 0, volumeSequence: 0, stepIndex: 0,
  }));
  let speed = sub.speed;
  let count = 1;
  const trackStart = sub.first * m.stepLen;
  const trackEnd = (sub.last + 1) * m.stepLen;
  for (let tick = 0; tick < maxTicks; tick++) {
    count--;
    if (count === 0) {
      count = speed;
      voices.forEach((vs, v) => {
        const pat = () => m.patternsOff + vs.pattStart * HIPPEL_PATTERN_SIZE + vs.pattPos;
        if (vs.pattPos === HIPPEL_PATTERN_SIZE || (buf[pat()] & 0x7f) === 1) {
          let at = trackStart + vs.trackPos;
          if (at >= trackEnd) { vs.trackPos = 0; at = trackStart; }
          vs.trackPos += m.stepLen;
          const o = m.trackOff + at + v * m.columnSize;
          vs.pattStart = buf[o];
          vs.transpose = s8(buf[o + 1]);
          vs.soundTranspose = s8(buf[o + 2]);
          let command = 0;
          if (m.columnSize === 4) {
            command = buf[o + 3];
            const hi = command >> 4;
            if (hi === 0x0f) { /* voice volume: not part of the walk */ }
            else if (hi === 0x0e) speed = command & 0x0f;
          }
          vs.pattPos = 0;
          vs.stepIndex = at / m.stepLen;
          out.push([tick, 0, v, vs.stepIndex, vs.pattStart, vs.transpose, vs.soundTranspose, command, speed, m.voices]);
        }
        const note = buf[pat()];
        const info = buf[pat() + 1];
        out.push([tick, 1, v, vs.stepIndex, vs.pattPos >> 1, note, info, vs.transpose, vs.soundTranspose, speed]);
        if ((note & 0x7f) !== 0) {
          vs.note = note & 0x7f;
          vs.info = info;
          vs.fresh = true;
          if ((note & 0x80) === 0) vs.volumeSequence = ((info & 0x1f) + vs.soundTranspose) & 0xff;
        }
        vs.pattPos += 2;
      });
    }
    voices.forEach((vs, v) => {
      if (!vs.fresh) return;
      vs.fresh = false;
      const index = hippelNoteIndex(vs.note, vs.transpose);
      out.push([tick, 2, v, vs.stepIndex, index, Math.max(PERIOD_MIN, HIPPEL_PERIODS[index]), vs.note, vs.transpose, 0, vs.volumeSequence]);
    });
  }
  return out;
}

// ── The grid ──────────────────────────────────────────────────────────────

/** One cell of the walked grid. */
export interface HippelWalkCell {
  /** Grid note (0 = none). */
  note: number;
  /** Volume sequence number + 1 (the instrument the player starts), 0 for no instrument or a sequence the song does not have. */
  instrument: number;
  /** Pattern byte offset in the file of the row (note byte; info follows). */
  offset: number;
  /** The row's note byte as the file holds it (the pattern note, bit 7 = no new instrument). */
  noteByte: number;
  /** The sound-sequence transpose the decoder had when the note started (negative = a fixed pitch); 0 when none is known. */
  seq: number;
}

export interface HippelWalkStep {
  /** Index in the track table. */
  step: number;
  rows: number;
  /** Per voice: the step's pattern, transpose, sound transpose, command byte and the step's byte offset. */
  voices: Array<{ pattern: number; transpose: number; soundTranspose: number; command: number; offset: number }>;
  /** Ticks each row lasts (the speed the counter was reloaded with at the row). */
  rowSpeeds: number[];
}

export interface HippelGrid {
  steps: HippelWalkStep[];
  /** Cells by [step in `steps`][voice][row]. */
  cells: HippelWalkCell[][][];
  /** Octave the grid's notes are shifted up (HIPPEL_LOW_BIAS when the song plays below C-0), else 0. */
  bias: number;
  /** Why no grid can be shown, or null. */
  unmatched: string | null;
}

/** Ticks the grid walk runs: enough for any pass of 256 steps at speed 15. */
export function passTicks(sub: HippelSubsong): number {
  return (sub.last - sub.first + 2) * HIPPEL_ROWS * Math.max(sub.speed, 15) + 64;
}

/**
 * The walked grid of subsong `index`: the steps from the first, voices
 * loading together, until the first step is loaded again (the loop). The
 * rows of a step are the ticks the speed counter reloaded in it.
 */
export function hippelGrid(m: HippelTfmx, index: number, played?: HippelPlayed, biasOverride?: number): HippelGrid {
  const sub = hippelSubsong(m, index);
  const log = walkHippelTfmx(m, index, passTicks(sub));
  const empty = (unmatched: string): HippelGrid => ({ steps: [], cells: [], bias: 0, unmatched });
  const loads = log.filter((r) => r[1] === 0);
  const perVoice: HippelWalkRecord[][] = Array.from({ length: m.voices }, (_, v) => loads.filter((r) => r[2] === v));
  // A pass: voice 0's loads from the first step to the one before it loads the first step again.
  const own = perVoice[0];
  let passLen = own.length;
  for (let i = 1; i < own.length; i++) if (own[i][3] === sub.first) { passLen = i; break; }
  if (own.length <= passLen) return empty('the song never returns to its first step within the walk');
  // Voice 0's row reads of the pass, in order. A row lasts the speed the counter was reloaded with at
  // its tick: the first row the subsong's own, each later row the speed in force after the row before it
  // (a step's speed command changes the speed after the counter reloaded, so it is the next row's).
  const passStart = own[0][0];
  const passEnd = own[passLen][0];
  const passReads = log.filter((r) => r[1] === 1 && r[2] === 0 && r[0] >= passStart && r[0] < passEnd);
  const durations = passReads.map((_, i) => (i === 0 ? sub.speed : passReads[i - 1][9]));
  let readIndex = 0;
  const steps: HippelWalkStep[] = [];
  for (let k = 0; k < passLen; k++) {
    const ticks = perVoice.map((l) => l[k]?.[0]);
    const stepNo = own[k][3];
    if (ticks.some((t) => t !== ticks[0]) || perVoice.some((l) => l[k]?.[3] !== stepNo)) {
      return empty(`the voices load step ${stepNo} on different rows (the grid shows one pattern per step)`);
    }
    const startTick = own[k][0];
    const endTick = own[k + 1][0];
    // The rows of the step: each row read of voice 0 between the loads.
    const reads = passReads.filter((r) => r[0] >= startTick && r[0] < endTick);
    if (reads.length === 0) return empty(`step ${stepNo} has no rows (its first note byte is the break)`);
    // A voice that reads a different number of rows would have loaded its next step elsewhere (caught above).
    steps.push({
      step: stepNo, rows: reads.length,
      voices: perVoice.map((l, v) => ({
        pattern: l[k][4], transpose: l[k][5], soundTranspose: l[k][6], command: l[k][7],
        offset: m.trackOff + stepNo * m.stepLen + v * m.columnSize,
      })),
      rowSpeeds: durations.slice(readIndex, readIndex + reads.length),
    });
    readIndex += reads.length;
  }
  // The notes each cell plays, then the song's octave bias: the one shift that keeps every note at or above note 1.
  const cells: HippelWalkCell[][][] = steps.map((st) => st.voices.map((sv, v) => Array.from({ length: st.rows }, (_, r) => {
    const offset = m.patternsOff + sv.pattern * HIPPEL_PATTERN_SIZE + r * 2;
    const noteByte = m.buf[offset];
    const seq = played?.get(hippelPlayedKey(st.step, v, r)) ?? 0;
    return { note: 0, instrument: 0, offset, noteByte, seq };
  })));
  let lowest = 1;
  steps.forEach((st, i) => st.voices.forEach((sv, v) => cells[i][v].forEach((c) => {
    if ((c.noteByte & 0x7f) >= 2) lowest = Math.min(lowest, hippelIndexToPitch(hippelPlayedIndex(c.noteByte, sv.transpose, c.seq)));
  })));
  // Without the decoder's transposes a cell's pitch is a guess (a sound sequence fixes most), so no shift is judged from it.
  const bias = biasOverride ?? (played && lowest < 1 ? HIPPEL_LOW_BIAS : 0);
  steps.forEach((st, i) => st.voices.forEach((sv, v) => cells[i][v].forEach((c) => {
    c.note = hippelCellNote(c.noteByte, sv.transpose, c.seq, bias);
    if (c.note > 0 && (c.noteByte & 0x80) === 0) {
      const seq = ((m.buf[c.offset + 1] & 0x1f) + sv.soundTranspose) & 0xff;
      c.instrument = seq < m.nVolume ? seq + 1 : 0;
    }
  })));
  // A command the grid has no column for is no grid.
  for (const st of steps) {
    for (const sv of st.voices) {
      const hi = sv.command >> 4;
      if (m.columnSize === 4 && (hi === 0x0d || hi === 0x08)) {
        return empty(`step ${st.step} uses the ${hi === 0x0d ? 'rate' : 'player off'} command ($${sv.command.toString(16)}), which the grid does not show`);
      }
    }
  }
  return { steps, cells, bias, unmatched: null };
}
