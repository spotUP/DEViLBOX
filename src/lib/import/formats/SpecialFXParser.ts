/**
 * SpecialFXParser.ts — Special FX Amiga music format native parser
 *
 * Special FX (also known as "JD") is a 4-channel Amiga music format. The module
 * begins with a sequence of BRA (branch always) opcodes pointing to the player
 * subroutines, which serves as the format signature.
 *
 * NOTE: This parser handles the Special FX format (UADE prefix "JD.*") and must
 * not be confused with SoundFXParser.ts which handles the unrelated Sound FX
 * format (.sfx files).
 *
 * Detection (from UADE Special FX_v2.asm Check2 routine):
 *   buf.length >= 16
 *   u16BE(buf, 0)  === 0x6000   (BRA opcode at offset 0)
 *   u16BE(buf, 2)  !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 4)  === 0x6000   (BRA opcode at offset 4)
 *   u16BE(buf, 6)  !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 8)  === 0x6000   (BRA opcode at offset 8)
 *   u16BE(buf, 10) !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 12) === 0x6000   (BRA opcode at offset 12)
 *   u16BE(buf, 14) !== 0, bit 15 clear (positive), even
 *
 * File prefix: "JD." (e.g. "JD.songname")
 * Single-file format: music data binary.
 * Playback is the nuade port (third-party/nuade/players/specialfx/specialfx.c); this parser only reads the song.
 *
 * Stream grammar and table location: specialfx.c (locate_code, locate_tables, track_read, read_pattern). The module
 * is linked at an absolute address; the period table's lea gives the link base. Each subsong is four words in the song
 * table (word + signed offset = the voice's track list). A track list is pattern numbers (< $80) and commands ($80 end,
 * $81 loop point, $82 transpose, $83 repeats, $84 pattern byte); the pattern table gives each pattern's bytes: notes
 * (< $80, then a wait byte unless fixed length is on) and commands $80-$9F, bytes from $A0 ignored.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): every track list and every played pattern is a file block whose
 * `blockRows` carry its bytes (cutoff = byte count, period/pan/resonance = the bytes, one token per row; a 4-byte
 * vibrato command takes two rows); the display is a tick grid of subsong 1 (one row per GCD of the event ticks) with
 * `noteBytes` naming the byte of every note.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { specialFXEncoder } from '@/engine/uade/encoders/SpecialFXEncoder';

const MIN_FILE_SIZE = 16;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isSpecialFXFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // First BRA opcode
  if (u16BE(buf, 0) !== 0x6000) return false;

  // Branch displacement at offset 2: non-zero, positive (bit 15 clear), even
  const d2 = u16BE(buf, 2);
  if (d2 === 0 || (d2 & 0x8000) !== 0 || (d2 & 1) !== 0) return false;

  // Second BRA opcode
  if (u16BE(buf, 4) !== 0x6000) return false;

  // Branch displacement at offset 6: non-zero, positive (bit 15 clear), even
  const d3 = u16BE(buf, 6);
  if (d3 === 0 || (d3 & 0x8000) !== 0 || (d3 & 1) !== 0) return false;

  // Third BRA opcode
  if (u16BE(buf, 8) !== 0x6000) return false;

  // Branch displacement at offset 10: non-zero, positive (bit 15 clear), even
  const d4 = u16BE(buf, 10);
  if (d4 === 0 || (d4 & 0x8000) !== 0 || (d4 & 1) !== 0) return false;

  // Fourth BRA opcode
  if (u16BE(buf, 12) !== 0x6000) return false;

  // Branch displacement at offset 14: non-zero, positive (bit 15 clear), even
  const d5 = u16BE(buf, 14);
  if (d5 === 0 || (d5 & 0x8000) !== 0 || (d5 & 1) !== 0) return false;

  return true;
}


// ── Module layout (specialfx.c locate_code / locate_tables) ─────────────────

const OP_BRA_W = 0x6000;
const OP_LEA_A2 = 0x45f9;
const OP_LEA_A3 = 0x47f9;
const OP_LEA_A5 = 0x4bf9;
const OP_RTS = 0x4e75;
const OP_MOVEM_TO_STACK = 0x48e7;
const OP_ASL_W3_D0 = 0xe740;
const OP_SUBQ_B1_D0 = 0x5300;
const OP_MOVE_B_A2_POST_D0 = 0x101a;
const OP_BNE_B = 0x6600;
const OP_BCS_B = 0x6500;
const OP_CMP_W_IMM_D0 = 0x0c40;
const OP_CMP_W_IMM_D0_SHORT = 0xb07c;
const OP_MOVEQ_D7_2 = 0x7e02;
const OP_MOVEQ_D7_3 = 0x7e03;
const OP_ADDA_W_INDEX_A2 = 0xd4f2;
const OP_ADDA_W_INDEX_A3 = 0xd6f3;

const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
/** Display cap: a subsong longer than this many grid rows is cut (the blocks stay whole). */
const MAX_DISPLAY_ROWS = ROWS_PER_PATTERN * 512;
const MAX_TICKS = 1 << 20;

const rd8 = (b: Uint8Array, o: number): number => (o >= 0 && o < b.length ? b[o] : 0);
const rd16 = (b: Uint8Array, o: number): number => (rd8(b, o) << 8) | rd8(b, o + 1);
const rd16s = (b: Uint8Array, o: number): number => (rd16(b, o) << 16) >> 16;
const rd32 = (b: Uint8Array, o: number): number => ((rd16(b, o) << 16) | rd16(b, o + 2)) >>> 0;

function findWord(b: Uint8Array, from: number, to: number, word: number): number {
  for (let o = (from + 1) & ~1; o + 2 <= to; o += 2) if (rd16(b, o) === word) return o;
  return -1;
}

const braTarget = (b: Uint8Array, n: number): number => 4 * n + 2 + rd16s(b, 4 * n + 2);

function indexedAddaFollows(b: Uint8Array, from: number, indexed: number): boolean {
  for (let o = from; o < from + 12; o += 2) if (rd16(b, o) === indexed && rd16(b, o + 2) === 0) return true;
  return false;
}

export interface SpecialFXModule {
  /** Link address of file offset 0. */
  base: number;
  /** File offsets of the song table and the pattern table. */
  songs: number;
  patterns: number;
  voices: number;
  subsongs: number;
  patternsStartRelative: boolean;
  patternsPlayRelative: boolean;
  trackPatternByte: boolean;
}

export function analyseSpecialFX(b: Uint8Array): SpecialFXModule | null {
  if (!isSpecialFXFormat(b)) return null;
  const twoGroups = rd16(b, 16) === OP_BRA_W;
  let marker = 0x5f0166;
  let codeStart: number;
  let scan: number;
  if (twoGroups) {
    codeStart = braTarget(b, 0);
    const last = findWord(b, codeStart, b.length, 0x0077);
    if (last >= 2 && rd16(b, last - 2) === 0x007e) marker = 0x7701bf;
    scan = codeStart;
  } else {
    codeStart = findWord(b, 12, b.length, OP_MOVEM_TO_STACK);
    if (codeStart < 0) return null;
    scan = codeStart + 2;
  }
  const lea = findWord(b, scan, b.length, OP_LEA_A5);
  if (lea < 0) return null;
  const hit = findWord(b, lea + 6, b.length, marker & 0xffff);
  if (hit < 0) return null;
  const base = (rd32(b, lea + 2) - hit) >>> 0;
  let rts = hit;
  do rts -= 2; while (rts > codeStart && rd16(b, rts) !== OP_RTS);
  if (rts <= codeStart) return null;
  const hi = rts + 2;
  const addrAt = (o: number): number => (rd32(b, o) - base) | 0;

  const init = braTarget(b, twoGroups ? 4 : 2);
  const play = braTarget(b, twoGroups ? 6 : 3);
  const asl = findWord(b, init, init + 0x100, OP_ASL_W3_D0);
  if (asl < 6) return null;
  const songs = addrAt(asl - 4);
  const patternLea = findWord(b, asl, asl + 0x100, OP_LEA_A2);
  if (patternLea < 0) return null;
  const patterns = addrAt(patternLea + 2);
  let voices = 0;
  for (let o = asl; o < asl + 0x40 && voices === 0; o += 2) {
    const w = rd16(b, o);
    if (w === OP_MOVEQ_D7_2 || w === OP_MOVEQ_D7_3) voices = (w & 0xff) + 1;
  }
  let subsongs = 0;
  for (let o = init; o < init + 0x40 && subsongs === 0; o += 2) {
    const op = rd16(b, o);
    if ((op === OP_CMP_W_IMM_D0 || op === OP_CMP_W_IMM_D0_SHORT) && (rd16(b, o + 4) & 0xff00) === OP_BCS_B) subsongs = rd16(b, o + 2);
  }
  if (voices === 0 || subsongs === 0 || songs < 0 || patterns < 0 || songs >= b.length || patterns >= b.length) return null;
  const playLea = findWord(b, play, hi, OP_LEA_A3);
  let trackPatternByte = false;
  for (let o = (init + 1) & ~1; o + 6 <= init + 0x100 && !trackPatternByte; o += 2) {
    trackPatternByte = rd16(b, o) === OP_SUBQ_B1_D0 && (rd16(b, o + 2) & 0xff00) === OP_BNE_B && rd16(b, o + 4) === OP_MOVE_B_A2_POST_D0;
  }
  return {
    base, songs, patterns, voices, subsongs,
    patternsStartRelative: indexedAddaFollows(b, patternLea + 6, OP_ADDA_W_INDEX_A2),
    patternsPlayRelative: playLea >= 0 && indexedAddaFollows(b, playLea + 6, OP_ADDA_W_INDEX_A3),
    trackPatternByte,
  };
}

/** File offset of the voice's track list in subsong `index` (0-based), or -1 when the voice is unused. */
function trackStart(b: Uint8Array, m: SpecialFXModule, index: number, voice: number): number {
  const word = m.songs + 8 * index + 2 * voice;
  const off = rd16s(b, word);
  return off === 0 ? -1 : word + off;
}

function patternStart(b: Uint8Array, m: SpecialFXModule, n: number, relative: boolean): number {
  const entry = m.patterns + 2 * n;
  return (relative ? m.patterns : entry) + rd16s(b, entry);
}

// ── Stream tokens (byte-exact carriers) ────────────────────────────────────

/** Token lengths of a track list from `start` to its $80, or null when it leaves the file. */
function trackTokens(b: Uint8Array, start: number): number[] | null {
  const lens: number[] = [];
  for (let p = start; p < b.length;) {
    const c = b[p];
    const len = c === 0x82 || c === 0x83 ? 2 : 1;
    lens.push(len);
    p += len;
    if (c === 0x80) return p <= b.length ? lens : null;
  }
  return null;
}

/** Token lengths of a pattern from `start` to its $80; `fixed` = fixed length on at entry (no wait byte after notes). */
function patternTokens(b: Uint8Array, start: number, fixed: boolean): number[] | null {
  const lens: number[] = [];
  for (let p = start; p < b.length;) {
    const c = b[p];
    let len = 1;
    if (c < 0x80 || c === 0x87) len = fixed ? 1 : 2;
    else if (c === 0x84) { len = 2; fixed = true; } else if (c === 0x85) fixed = false;
    else if (c === 0x88 || c === 0x89) len = 3;
    else if (c === 0x8b) len = 4;
    else if (c === 0x8d || c === 0x8f || c === 0x90) len = 2;
    lens.push(len);
    p += len;
    if (c === 0x80) return lens;
  }
  return null;
}

/** Carrier rows of `size` bytes from `start` in tokens of `lens`; a token over 3 bytes spans more rows. */
function carrierRows(b: Uint8Array, start: number, lens: number[]): TrackerCell[] {
  const rows: TrackerCell[] = [];
  let p = start;
  for (const len of lens) {
    for (let left = len; left > 0;) {
      const n = Math.min(3, left);
      rows.push({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
      } as TrackerCell);
      p += n;
      left -= n;
    }
  }
  return rows;
}

// ── One voice's pass through a subsong (specialfx.c song_start / track_read / read_pattern) ─────

interface SfxNote { tick: number; offset: number; byte: number; transpose: number; instrument: number }

/** Walk one voice from its track list to the end or the first loop; reports every pattern start with its fixed-length state. */
function walkVoice(
  b: Uint8Array, m: SpecialFXModule, start: number,
  onPattern: (start: number, fixed: boolean) => void,
): SfxNote[] {
  const notes: SfxNote[] = [];
  let tp = start;
  let trackLoop = -1;
  let patternLoop = -1;
  let transpose = 0;
  let repeats = 1;
  let fixed = false;
  let fixedLen = 0;
  let instrument = 0;
  let number = 0;
  let pp = -1;
  const begin = (n: number, atStart: boolean) => {
    number = n;
    pp = patternStart(b, m, n, atStart ? m.patternsStartRelative : m.patternsPlayRelative);
    onPattern(pp, fixed);
  };
  const trackRead = (atStart: boolean): boolean => {
    for (let guard = 0; guard < 4096 && tp < b.length; guard++) {
      const c = b[tp++];
      if (c < 0x80) { begin(c, atStart); return true; }
      if (c === 0x80) {
        // End: a loop back is where one pass ends.
        if (trackLoop < 0 || !atStart) return false;
        tp = trackLoop;
      } else if (c === 0x81) trackLoop = tp;
      else if (c === 0x82) transpose = (rd8(b, tp++) << 24) >> 24;
      else if (c === 0x83) repeats = rd8(b, tp++);
      else if (c === 0x84 && atStart && m.trackPatternByte) { const n = rd8(b, tp); tp += 1; begin(n, true); return true; }
    }
    return false;
  };
  if (!trackRead(true)) return notes;
  let tick = 0;
  let delta = 0;
  for (let guard = 0; guard < 1 << 20 && pp >= 0 && pp < b.length && tick < MAX_TICKS; guard++) {
    const c = b[pp++];
    if (c < 0x80 || c === 0x87) {
      if (c < 0x80) notes.push({ tick, offset: pp - 1, byte: c, transpose, instrument });
      delta += fixed ? fixedLen : rd8(b, pp++);
      if (delta === 0) break; // the driver halts (or wraps 65536 ticks): the pass ends here
      tick += delta;
      delta = 0;
    } else if (c >= 0xa0) continue;
    else if (c === 0x80) {
      if (patternLoop >= 0) break; // a pattern loop plays forever
      if (--repeats !== 0) begin(number, false);
      else {
        repeats = 1;
        transpose = 0;
        if (!trackRead(false)) break;
      }
    } else if (c === 0x81) patternLoop = pp;
    else if (c === 0x84) { fixed = true; fixedLen = rd8(b, pp++); } else if (c === 0x85) fixed = false;
    else if (c === 0x86) delta += 0x100;
    else if (c === 0x88 || c === 0x89) pp += 2;
    else if (c === 0x8b) pp += 3;
    else if (c === 0x8d || c === 0x8f) pp += 1;
    else if (c === 0x90) instrument = rd8(b, pp++) + 1;
  }
  return notes;
}

const gcd = (a: number, c: number): number => (c === 0 ? a : gcd(c, a % c));

/**
 * Grid note of a note byte under its transpose. shortcut: the driver's period index also subtracts the instrument's
 * base note (from its setup list, not read here), so the grid shows the raw note number + 1, not the sounding pitch;
 * read the instruments' base notes when the grid must show pitch.
 */
export const specialFXGridNote = (byte: number, transpose: number): number => ((byte + transpose) & 0xff) + 1;

export function parseSpecialFXFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSpecialFXFormat(buf)) throw new Error('Not a Special FX module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^jd\./i, '').replace(/^doda\./i, '').replace(/\.jd$/i, '').replace(/\.doda$/i, '') || baseName;

  const m = analyseSpecialFX(buf);
  // Blocks: every track list of every subsong, and every pattern a pass reaches (with its entry fixed-length state).
  const blocks = new Map<number, number[]>();
  let ok = m !== null;
  const display: SfxNote[][] = [];
  if (m) {
    for (let s = 0; s < m.subsongs && ok; s++) {
      for (let v = 0; v < Math.min(m.voices, NUM_CHANNELS); v++) {
        const t = trackStart(buf, m, s, v);
        if (t < 0) { if (s === 0) display.push([]); continue; }
        if (!blocks.has(t)) {
          const lens = trackTokens(buf, t);
          if (lens) blocks.set(t, lens); else ok = false;
        }
        const notes = walkVoice(buf, m, t, (p, fixed) => {
          if (blocks.has(p)) return;
          const lens = patternTokens(buf, p, fixed);
          if (lens) blocks.set(p, lens); else ok = false;
        });
        if (s === 0) display.push(notes);
      }
    }
  }
  const sorted = ok ? [...blocks.entries()].sort((a, b) => a[0] - b[0]) : [];
  const sizeOf = (lens: number[]) => lens.reduce((a, n) => a + n, 0);
  // Blocks must not overlap: two streams sharing bytes would encode them twice.
  for (let i = 1; i < sorted.length && ok; i++) ok = sorted[i - 1][0] + sizeOf(sorted[i - 1][1]) <= sorted[i][0];

  const ticks = ok ? display.flat().map((n) => n.tick) : [];
  const step = Math.max(1, ticks.reduce((a, t) => gcd(a, t), 0));
  const lastRow = Math.min(MAX_DISPLAY_ROWS - 1, Math.max(0, ...ticks.map((t) => t / step)));
  const numPatterns = Math.max(1, Math.ceil((lastRow + 1) / ROWS_PER_PATTERN));
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, pi) => ({
    id: `pattern-${pi}`,
    name: `Pattern ${pi}`,
    length: ROWS_PER_PATTERN,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
  }));

  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const usedInstruments = new Set<number>();
  if (ok) {
    display.forEach((notes, ch) => {
      for (const n of notes) {
        const r = n.tick / step;
        const note = specialFXGridNote(n.byte, n.transpose);
        if (r > lastRow || note > 96) continue;
        const pattern = Math.floor(r / ROWS_PER_PATTERN);
        const row = r % ROWS_PER_PATTERN;
        const cell = patterns[pattern].channels[ch].rows[row];
        cell.note = note;
        cell.instrument = n.instrument;
        if (n.instrument) usedInstruments.add(n.instrument);
        noteBytes.push({ pattern, channel: ch, row, offset: n.offset, note });
      }
    });
  }

  const layout: UADEVariablePatternLayout | undefined = ok && sorted.length ? {
    formatId: 'specialFX',
    numChannels: NUM_CHANNELS,
    numFilePatterns: sorted.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buf.length,
    encoder: specialFXEncoder,
    filePatternAddrs: sorted.map(([start]) => start),
    filePatternSizes: sorted.map(([, lens]) => sizeOf(lens)),
    // The display is a tick grid, not the file streams: no display pattern maps to a block.
    trackMap: patterns.map(() => Array.from({ length: NUM_CHANNELS }, () => -1)),
    blockRows: sorted.map(([start, lens]) => carrierRows(buf, start, lens)),
    noteBytes,
  } : undefined;

  const instruments: InstrumentConfig[] = [...usedInstruments].sort((a, c) => a - c).map((id) => ({
    id, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const songPositions = patterns.map((_, i) => i);
  return {
    name: `${moduleName} [Special FX]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: step,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    ...(layout ? { uadeVariableLayout: layout } : {}),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
