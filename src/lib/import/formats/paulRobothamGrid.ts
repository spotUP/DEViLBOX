/**
 * paulRobothamGrid.ts - the Paul Robotham tracker grid, read from the module's own per-voice command streams.
 *
 * Byte layout (Paul Robotham_v1.asm, header read by the detector in PaulRobothamParser.ts): 4 voice start
 * pointers, then the sequence/pattern lookup tables and the 12-byte instrument records. Each voice is ONE linear
 * command stream, ended by a 0x00 byte (lbC0151D8, line 930: the voice stops). The streams are contiguous: each
 * ends where the next starts, the last at the end of the file.
 *
 * Stream grammar (Play, lbC014E9A, line 658):
 *   0x00          end of voice
 *   0x01..0x7e    note: the byte indexes the period table lbW015DCC (line 1832; ProTracker finetune 0 from 856),
 *                 so grid note = 13 + byte (C-1 = 13), 60 entries. A duration byte follows (line 733 / 790 / 1036).
 *   0x7f          tie (hold, line 662): a duration byte follows
 *   0x80..0xff    command (byte & 0x1f indexes the jump table lbL015CE4, line 1755), operands below
 * Duration byte d: ((d & 0x1f) << (d >> 5)) * tempoMul / tempoDiv frames, remainder carried per voice
 * (lbC014F3E, line 742: MULU lbW015DB2, DIVU lbW015DB4; init $3E8 / $2A30, command 14 sets mul = operand << 4).
 *
 * Command operand counts (handlers, lines 1308-1435; Error = no operands):
 *   1 push loop count 1   2 loop end 0     7 vibrato 1    8 vibrato speed 1   9 slide 1
 *   11 volume envelope 1  12 pitch envelope 1   13 volume 1   14 tempo 1   15 instrument 1
 *   19 flags 1  20 mode 1  21 1  22 fade 2  23 0  24 1  25 0  26 0
 *
 * Layers (docs/FORMAT_COMMAND_STREAM_GRID.md): `blockRows` carry every command byte-exact (cutoff = length,
 * period = byte 0, pan = byte 1, resonance = byte 2), the display grid is one row per frame with the note on the
 * frame it starts. An edited note is that note byte moved in place, so the stream keeps its length.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';
import { PR_FX, PR_FX_BASE } from './commandStreamEffectGlyphs';

export const PR_ROWS_PER_PATTERN = 64;
/** Grid note of note byte 0 (period 856 = C-1, src/lib/amiga/periodNotes.ts). */
export const PR_NOTE_BASE = 13;
/** Note bytes the period table holds: 0..59. */
export const PR_TABLE_NOTES = 60;
export const PR_TIE = 0x7f;
/** Most frames a display timeline may hold, so a pathological module cannot allocate without bound. */
const PR_MAX_FRAMES = 60000;

const OPERANDS: Readonly<Record<number, number>> = {
  1: 1, 2: 0, 7: 1, 8: 1, 9: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 19: 1, 20: 1, 21: 1, 22: 2, 23: 0, 24: 1, 25: 0, 26: 0,
};
const CMD_TEMPO = 14;
const CMD_INSTRUMENT = 15;
const TEMPO_MUL = 0x3e8;
const TEMPO_DIV = 0x2a30;

/** Bytes the command at `pos` takes. A note or tie is two bytes (note, duration); anything unknown is one byte so a walk never desyncs. */
export function prCommandLen(buf: Uint8Array, pos: number): number {
  const v = buf[pos];
  if (v === 0) return 1;
  if (v < 0x80) return 2;
  return 1 + (OPERANDS[v & 0x1f] ?? 0);
}

/** One carrier cell per command, up to and including the 0x00 terminator (or the end of `limit`). */
export function decodePRStream(buf: Uint8Array, start: number, limit: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  let pos = start;
  while (pos < limit) {
    const len = Math.min(prCommandLen(buf, pos), limit - pos);
    const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, cutoff: len, period: buf[pos] };
    if (len >= 2) cell.pan = buf[pos + 1];
    if (len >= 3) cell.resonance = buf[pos + 2];
    rows.push(cell);
    pos += len;
    if (buf[pos - len] === 0) break;
  }
  return rows;
}

/** The bytes of a stream's carrier cells, concatenated. */
export function encodePRStream(rows: TrackerCell[]): Uint8Array {
  const out: number[] = [];
  for (const c of rows) {
    const len = c.cutoff ?? 0;
    if (len >= 1) out.push((c.period ?? 0) & 0xff);
    if (len >= 2) out.push((c.pan ?? 0) & 0xff);
    if (len >= 3) out.push((c.resonance ?? 0) & 0xff);
  }
  return new Uint8Array(out);
}

export interface PRNotePlacement { voice: number; tick: number; offset: number; note: number; instrument: number }

export interface PRGrid {
  patterns: Pattern[];
  voices: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  /** Every note the grid shows, with the file byte of the command it is drawn from. */
  placements: PRNotePlacement[];
  ticks: number;
  /** Command effects that found no free effect column on their frame (more than five commands ran on one frame); the stream keeps them. */
  droppedEffects: number;
}

/** Voice start offsets from the header (8-byte header, then D1 four-byte pointers). */
export function prVoiceStarts(buf: Uint8Array): number[] {
  const n = (buf[0] << 8) | buf[1];
  const starts: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = 8 + i * 4;
    starts.push(((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0);
  }
  return starts;
}

const EFFECT_SLOTS = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']] as const;

/** The effect-column entries a command shows (none for the instrument command, which is the instrument column and unknown indexes). */
export function prCommandEffects(c: TrackerCell): Array<[effTyp: number, eff: number]> {
  const cmd = (c.period ?? 0) & 0x1f;
  if ((c.period ?? 0) < 0x80 || cmd === CMD_INSTRUMENT || OPERANDS[cmd] === undefined) return [];
  const out: Array<[number, number]> = [[PR_FX_BASE + cmd, c.pan ?? 0]];
  if (PR_FX_BASE + cmd === PR_FX.fade) out.push([PR_FX.fadeSecond, c.resonance ?? 0]);
  return out;
}

/** Put a command's effects in the first free effect columns of `cell`; entries beyond the five columns are not drawn. */
function addEffects(cell: TrackerCell, fx: Array<[number, number]>): number {
  let dropped = 0;
  for (const [typ, val] of fx) {
    const slot = EFFECT_SLOTS.find(([t]) => !cell[t]);
    if (!slot) { dropped++; continue; }
    cell[slot[0]] = typ;
    cell[slot[1]] = val;
  }
  return dropped;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** Build the grid a module shows. `sourceFile` only labels the patterns. */
export function buildPRGrid(buf: Uint8Array, sourceFile: string, instrumentCount: number): PRGrid | null {
  const starts = prVoiceStarts(buf);
  if (starts.length === 0 || starts.some(s => s <= 0 || s >= buf.length)) return null;
  // streams are contiguous: a voice's stream may not run past the next voice's start (or the file end)
  const order = starts.map((s, v) => ({ s, v })).sort((a, b) => a.s - b.s);
  const limitOf = new Map<number, number>();
  order.forEach((o, i) => limitOf.set(o.v, i + 1 < order.length ? order[i + 1].s : buf.length));

  const blockRows: TrackerCell[][] = [];
  const sizes: number[] = [];
  const placements: PRNotePlacement[] = [];
  const timelines: TrackerCell[][] = [];
  let droppedEffects = 0;
  starts.forEach((start, voice) => {
    const rows = decodePRStream(buf, start, limitOf.get(voice) ?? buf.length);
    blockRows.push(rows);
    sizes.push(rows.reduce((n, c) => n + (c.cutoff ?? 0), 0));
    const line: TrackerCell[] = [];
    let mul = TEMPO_MUL, rem = 0, tick = 0, inst = 0, pos = start;
    for (const c of rows) {
      const len = c.cutoff ?? 0, op = c.period ?? 0;
      if (op === 0) break;
      if (op >= 0x80) {
        const cmd = op & 0x1f;
        if (cmd === CMD_TEMPO) mul = (c.pan ?? 0) << 4;
        else if (cmd === CMD_INSTRUMENT) inst = Math.min((c.pan ?? 0) + 1, Math.max(instrumentCount, 1));
        // a command takes no time: its effect is drawn on the frame it runs, in the cell of the note that follows
        const fx = prCommandEffects(c);
        if (fx.length > 0 && tick < PR_MAX_FRAMES) droppedEffects += addEffects(line[tick] ??= emptyCell(), fx);
      } else if (len >= 2) {
        const d = c.pan ?? 0;
        const total = ((d & 0x1f) << (d >> 5)) * mul + rem;
        const frames = Math.floor(total / TEMPO_DIV);
        rem = total % TEMPO_DIV;
        if (tick < PR_MAX_FRAMES) {
          if (op !== PR_TIE && op < PR_TABLE_NOTES && !line[tick]?.note) {
            line[tick] = { ...(line[tick] ?? emptyCell()), note: PR_NOTE_BASE + op, instrument: inst };
            placements.push({ voice, tick, offset: pos, note: PR_NOTE_BASE + op, instrument: inst });
          }
        }
        tick += frames;
      }
      pos += len;
    }
    line.length = Math.max(line.length, Math.min(tick, PR_MAX_FRAMES));
    timelines.push(line);
  });

  const ticks = Math.max(1, ...timelines.map(t => t.length));
  const numPatterns = Math.ceil(ticks / PR_ROWS_PER_PATTERN);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: PR_ROWS_PER_PATTERN,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: PR_ROWS_PER_PATTERN }, (_, r) => ({ ...(line[p * PR_ROWS_PER_PATTERN + r] ?? emptyCell()) })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: timelines.length, originalPatternCount: numPatterns, originalInstrumentCount: instrumentCount,
    },
  }));
  return {
    patterns, voices: starts.length, filePatternAddrs: starts, filePatternSizes: sizes,
    trackMap: patterns.map(() => starts.map((_, v) => v)), blockRows, placements, ticks, droppedEffects,
  };
}

export interface PREditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module. `edited` is compared with the grid the module itself draws; a changed
 * note becomes its note byte (grid note - 13, 1..59) in place. A note on an empty row, a removed note, a note outside
 * the period table, and instrument or effect changes have no place in a same-length stream and come back as warnings.
 */
export function applyPRGridEdits(source: Uint8Array, edited: Pattern[], instrumentCount: number): PREditResult {
  const base = buildPRGrid(source, '', instrumentCount);
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  if (!base) return { data: out, patched: 0, warnings: ['the module has no voice streams to write into'] };
  const placed = new Set<string>();
  let patched = 0;
  const cellAt = (voice: number, tick: number): TrackerCell | undefined =>
    edited[Math.floor(tick / PR_ROWS_PER_PATTERN)]?.channels[voice]?.rows[tick % PR_ROWS_PER_PATTERN];
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.tick}`);
    const cell = cellAt(pl.voice, pl.tick);
    if (!cell) continue;
    if (cell.note !== pl.note) {
      const b = (cell.note ?? 0) - PR_NOTE_BASE;
      if (b >= 1 && b < PR_TABLE_NOTES) { out[pl.offset] = b; patched++; }
      else warnings.push(`voice ${pl.voice + 1} frame ${pl.tick}: note ${cell.note} is outside the player's period table (14-72) or removes the note; not written`);
    }
    if ((cell.instrument ?? 0) !== pl.instrument) warnings.push(`voice ${pl.voice + 1} frame ${pl.tick}: instrument changes are not written yet`);
  }
  let stray = 0;
  edited.forEach((pat, p) => pat.channels.forEach((chn, v) => chn.rows.forEach((cell, r) => {
    const tick = p * PR_ROWS_PER_PATTERN + r;
    if (placed.has(`${v}:${tick}`)) return;
    const was = base.patterns[p]?.channels[v]?.rows[r] ?? emptyCell();
    if (!cellFieldsEqual(cell, was)) stray++;
  })));
  if (stray > 0) warnings.push(`${stray} edited cell(s) are not on a note command; not written (the stream would change length)`);
  return { data: out, patched, warnings };
}
