/**
 * beathovenEdits.ts - write the Beathoven Synthesizer grid's note edits back into the module (phase B).
 *
 * A grid note is the 16-bit note number of a note command (the first note of an arpeggio in the legacy engine). The
 * player looks the number up in its period table at (number + the entry's note base - origin [+ bias]), so an edited note
 * cell is a same-length patch of that one word, chosen so the table entry lands on the new note under the base in force
 * for the row (recorded per row by the grid). A stream played by several voices or track entries is shared by every
 * place that plays it. A note removed becomes the replayer's Rest command (legacy) or Hold command (extended engine, bthIsExtended), same four bytes.
 * An instrument edit rewrites the record address of the Instrument command [0x80][address] that chose the note's
 * instrument to the address another Instrument command of the module already names (same four bytes); every note that
 * command reaches changes with it, and an edit that renumbers the instruments (their order of first use) does not read
 * back and is refused. An effect edit (slide, legato, note bias) rewrites the operand of the command that shows in that
 * slot, same two bytes; adding, removing or retyping a command, the arpeggio count and an operand above 0xff are refused.
 * Edits the stream cannot hold at its length - a note on a row without one, a note removed in the basic replayer (no Rest or Hold), a note off, an
 * instrument on a note no Instrument command reaches, the volume column (not stored per row) - are refused with a
 * warning and nothing is written for them. After patching, the grid is decoded again: every edited cell must read back
 * as edited and every cell that does not share an edited word must be unchanged, otherwise the edit is taken out again.
 *
 * A note on an empty row inside a held plain note splits that note ([num][dur] -> [num][d][new][dur - d]); the stream
 * grows by 4 bytes, moves to the end of the code hunk (hunk size words and file grow, relocations stay valid) and every
 * track-list entry naming it is repointed (addNote).
 *
 * A lower arpeggio count drops note numbers from the end of the Arpeggio command [0x81|0x84][dur][count][n1..nk]
 * (beathoven_legacy.c / beathoven_voice.c start_arpeggio: the command is 2 * count + 6 bytes). The rest of the stream
 * moves up inside its own bytes, the freed bytes become 0x0000 (End) and the code hunk's relocations in the moved bytes
 * are lowered, so the file keeps its length (shrinkArpeggio). A higher count would need note numbers the module does not
 * have and is refused.
 */
import type { Pattern, TrackerCell } from '@/types';
import { buildBthGrid, bthIsExtended, bthShownNote, readBthParams, type BthGrid, type BthParams } from './beathovenGrid';
import { otherFieldsDiffer } from './howieDaviesEdits';
import { cellEffects, effectEditPatches } from './cellEffectSlots';
import { BTH_FX } from './beathovenEffectGlyphs';

const NOTE_OFF = 97;
const ROWS_PER_PATTERN = 64;
/** Note numbers 0x80 and above are commands. */
const MAX_NOTE_NUMBER = 0x7f;
const VOICES = 4;
/** The legacy replayer's Rest command word (beathoven_legacy.c COMMAND_REST). */
const LEGACY_REST = 0x82;
/** The extended replayers' Hold command word (beathoven_voice.c BTH_COMMAND_HOLD): [0x83][duration], keeps the voice's note state. */
const EXTENDED_HOLD = 0x83;
const PREFIX = 'Beathoven Synthesizer';

export interface BeathovenEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

interface Add { pattern: number; channel: number; row: number; note: number; instrument: number }

const be32 = (d: Uint8Array, o: number): number => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const put32 = (d: Uint8Array, o: number, v: number): void => { d[o] = v >>> 24; d[o + 1] = (v >>> 16) & 0xff; d[o + 2] = (v >>> 8) & 0xff; d[o + 3] = v & 0xff; };
const rd16 = (d: Uint8Array, o: number): number => (d[o] << 8) | d[o + 1];
const CODE = 0x20;

/** File offsets of every track-list entry (8 bytes: stream, note base) reachable from the four voices. */
function trackEntryOffsets(buf: Uint8Array, prm: BthParams): number[] {
  const out = new Set<number>();
  for (const l of prm.trackLists) for (const start of [l.track, l.loop]) {
    for (let ei = start, n = 0; n < 4096 && ei + CODE + 8 <= buf.length; ei += 8, n++) {
      if (be32(buf, ei + CODE) === 0) break;
      out.add(ei + CODE);
    }
  }
  return [...out];
}

/**
 * A note on a row no note starts on, inside a plain note. Refused: a different instrument, a row not held by a note
 * (rest, before the first note), an arpeggio note, a note outside the period table, and any split that does not read
 * back as the note on that row with the same length and every other cell (not on the moved stream) unchanged.
 */
function addNote(file: Uint8Array, a: Add, warnings: string[]): Uint8Array {
  const refuse = (why: string): Uint8Array => { warnings.push(`${PREFIX} ${where(a)}: ${why}; the note was not written.`); return file; };
  const g = buildBthGrid(file);
  const prm = readBthParams(file);
  if (typeof g === 'string' || typeof prm === 'string') return file;
  const row = a.pattern * ROWS_PER_PATTERN + a.row;
  let r0 = -1;
  for (let r = row - 1; r >= 0 && r0 < 0; r--) if (cellAt(g, a.channel, r)?.note) r0 = r;
  const src = r0 < 0 ? null : g.rowSources[Math.floor(r0 / ROWS_PER_PATTERN)]?.[a.channel]?.[r0 % ROWS_PER_PATTERN];
  const cov = r0 < 0 ? undefined : cellAt(g, a.channel, r0);
  if (!src || !cov) return refuse('no note is held on this row');
  if (src.length !== 4 || src.noteOffset !== src.offset) return refuse('the held note is an arpeggio and cannot be split');
  if (a.instrument !== 0 && a.instrument !== cov.instrument) return refuse('a different instrument would need an Instrument command');
  const num = numberFor(file, a.note, src.base, src.noteNum);
  if (num < 0) return refuse(`note ${a.note} is not in the player's period table`);
  const dur = rd16(file, src.offset + 2);
  const ticks = (v: number): number => (prm.legacy ? (prm.scaled ? (v >> 2) * 5 : v) : v);
  const want = g.clock.rowToTick(row) - g.clock.rowToTick(r0);
  if (want <= 0 || want >= ticks(dur)) return refuse('the row is not inside the held note');
  const stream = g.streams[src.stream];
  const entries = trackEntryOffsets(file, prm).filter((e) => be32(file, e) === stream.offset - CODE);
  if (entries.length === 0) return refuse('no track list entry names this stream');
  const cut = src.offset - stream.offset;
  const hunk = be32(file, 28) * 4;
  const added = Math.ceil((stream.size + 4) / 4) * 4;
  for (let d = 1; d < dur; d++) {
    if (ticks(d) !== want || ticks(dur - d) !== ticks(dur) - want) continue;
    const grown = new Uint8Array(added);
    grown.set(file.subarray(stream.offset, stream.offset + cut + 4));
    grown[cut + 2] = d >> 8; grown[cut + 3] = d & 0xff;
    grown.set([num >> 8, num & 0xff, (dur - d) >> 8, (dur - d) & 0xff], cut + 4);
    grown.set(file.subarray(stream.offset + cut + 4, stream.offset + stream.size), cut + 8);
    const moved = new Uint8Array(file.length + added);
    moved.set(file.subarray(0, CODE + hunk));
    moved.set(grown, CODE + hunk);
    moved.set(file.subarray(CODE + hunk), CODE + hunk + added);
    put32(moved, 28, hunk / 4 + added / 4);
    put32(moved, 20, be32(file, 20) + added / 4); // the size word keeps its memory flag bits
    for (const e of entries) put32(moved, e, hunk);
    const again = buildBthGrid(moved);
    if (typeof again === 'string' || again.rows !== g.rows || cellAt(again, a.channel, row)?.note !== a.note) continue;
    let clean = true;
    for (let c = 0; c < VOICES && clean; c++) for (let r = 0; r < g.rows && clean; r++) {
      if (c === a.channel && r === row) continue;
      const wasSrc = g.rowSources[Math.floor(r / ROWS_PER_PATTERN)]?.[c]?.[r % ROWS_PER_PATTERN];
      // cells played from the moved stream share the new note
      if (wasSrc && g.streams[wasSrc.stream].offset === stream.offset) continue;
      const x = cellAt(again, c, r), y = cellAt(g, c, r);
      if (x?.note !== y?.note || x?.instrument !== y?.instrument) clean = false;
    }
    if (clean) return moved;
  }
  return refuse('no split of the held note reads back as the new note on this row');
}

interface Arp { pattern: number; channel: number; row: number; count: number; fx: Array<[number, number]> }

/**
 * The arpeggio on a row plays fewer of its note numbers: the trailing ones leave the command and the stream after it
 * moves up in place (see the header). Refused: a count above the command's or below 1, a stream that another stream
 * starts inside, a relocation among the dropped words, and any result that does not read back as the new count on this
 * row with every cell not played from this command unchanged.
 */
function shrinkArpeggio(file: Uint8Array, a: Arp, warnings: string[]): Uint8Array {
  const refuse = (why: string): Uint8Array => { warnings.push(`${PREFIX} ${where(a)}: ${why}; the arpeggio change was not written.`); return file; };
  const g = buildBthGrid(file);
  if (typeof g === 'string') return refuse(g);
  const src = g.rowSources[a.pattern]?.[a.channel]?.[a.row];
  if (!src || src.noteOffset === src.offset) return refuse('no arpeggio command plays on this row');
  const count = rd16(file, src.offset + 4);
  if (a.count === count) return file; // another edited row on the same command already wrote it
  if (a.count < 1 || a.count > count) return refuse(`an arpeggio can only drop note numbers (1 to ${count}); more would need notes the module does not hold`);
  const stream = g.streams[src.stream];
  const end = stream.offset + stream.size + 2; // through the End word
  if (g.streams.some((s) => s.offset > src.offset && s.offset < end)) return refuse('another command stream starts inside the bytes that would move');
  const cut = src.offset + 6 + 2 * a.count;
  const delta = 2 * (count - a.count);
  const out = new Uint8Array(file);
  out.copyWithin(cut, cut + delta, end);
  out.fill(0, end - delta, end);
  out[src.offset + 4] = a.count >> 8; out[src.offset + 5] = a.count & 0xff;
  // HUNK_RELOC32 after the code hunk: [0x3ec] then ([n][hunk][n offsets])* [0]; offsets are code-relative
  let ro = CODE + be32(file, 28) * 4;
  if (be32(file, ro) === 0x3ec) {
    for (ro += 4; ro + 4 <= file.length && be32(file, ro) !== 0;) {
      const n = be32(file, ro);
      for (let i = 0, at = ro + 8; i < n; i++, at += 4) {
        const r = be32(file, at) + CODE;
        if (r >= cut && r < cut + delta) return refuse('a relocated address sits among the dropped note numbers');
        if (r >= cut + delta && r < end) put32(out, at, r - delta - CODE);
      }
      ro += 8 + 4 * n;
    }
  }
  const again = buildBthGrid(out);
  const got = typeof again === 'string' ? undefined : cellAt(again, a.channel, a.pattern * ROWS_PER_PATTERN + a.row);
  if (typeof again === 'string' || again.rows !== g.rows || !got || JSON.stringify(cellEffects(got)) !== JSON.stringify(a.fx)) {
    return refuse('the replayer would not play the new count on this row');
  }
  for (let c = 0; c < VOICES; c++) for (let r = 0; r < g.rows; r++) {
    if (g.rowSources[Math.floor(r / ROWS_PER_PATTERN)]?.[c]?.[r % ROWS_PER_PATTERN]?.offset === src.offset) continue; // plays the same command
    const x = cellAt(again, c, r), y = cellAt(g, c, r);
    if (x?.note !== y?.note || x?.instrument !== y?.instrument || JSON.stringify(x && cellEffects(x)) !== JSON.stringify(y && cellEffects(y))) {
      return refuse('the change moves other rows');
    }
  }
  return out;
}

/** A same-length patch of `size` bytes (a note word, or an Instrument command's record address when `instrument` is set). */
interface Edit { pattern: number; channel: number; row: number; note: number; instrument?: number; offset: number; value: number; size: 1 | 2 | 4; fx?: Array<[number, number]> }

const where = (e: { pattern: number; channel: number; row: number }): string => `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;

const cellAt = (g: BthGrid, channel: number, row: number): TrackerCell | undefined =>
  g.patterns[Math.floor(row / ROWS_PER_PATTERN)]?.channels[channel]?.rows[row % ROWS_PER_PATTERN];

/** The note number that shows `note` under `base`, nearest to `current`; -1 when the table has none. */
function numberFor(buf: Uint8Array, note: number, base: number, current: number): number {
  const prm = readBthParams(buf);
  if (typeof prm === 'string') return -1;
  let best = -1;
  for (let n = 1; n <= MAX_NOTE_NUMBER; n++) {
    if (bthShownNote(buf, prm, n, base) !== note) continue;
    if (best < 0 || Math.abs(n - current) < Math.abs(best - current)) best = n;
  }
  return best;
}

/** The edits of `patterns` against the grid decoded from the untouched module, as word patches in `data`. */
export function applyBeathovenGridEdits(original: Uint8Array, patterns: readonly Pattern[]): BeathovenEditResult {
  const data = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildBthGrid(original);
  if (typeof base === 'string') return { data, patched: 0, warnings };
  if (patterns.length !== base.patterns.length) {
    warnings.push(`${PREFIX}: the grid has ${patterns.length} patterns, the module decodes to ${base.patterns.length}; nothing was written.`);
    return { data, patched: 0, warnings };
  }

  const legacy = readBthParams(original);
  const isLegacy = typeof legacy !== 'string' && legacy.legacy;
  // the word that stands for "no note" over a plain note command, same four bytes: Rest (legacy) or Hold (extended engine)
  const restWord = isLegacy ? LEGACY_REST : bthIsExtended(original) ? EXTENDED_HOLD : 0;
  const claimed = new Map<number, number>();
  const accepted: Edit[] = [];
  const adds: Add[] = [];
  const arps: Arp[] = [];

  patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const was = base.patterns[pi]?.channels[c]?.rows[r];
    if (!was) return;
    const noteChanged = cell.note !== was.note;
    const instChanged = cell.instrument !== was.instrument;
    const otherChanged = otherFieldsDiffer(cell, was);
    const fxChanged = JSON.stringify(cellEffects(cell)) !== JSON.stringify(cellEffects(was));
    if (!noteChanged && !instChanged && !otherChanged && !fxChanged) return;
    const at = { pattern: pi, channel: c, row: r };
    const src = base.rowSources[pi]?.[c]?.[r];
    if (!src && was.note === 0 && cell.note >= 1 && cell.note < NOTE_OFF) {
      adds.push({ ...at, note: cell.note, instrument: cell.instrument });
      return;
    }
    if (instChanged) {
      const record = base.instrumentRecords[cell.instrument - 1];
      if (!src || was.note < 1 || was.note >= NOTE_OFF || cell.note < 1 || cell.note >= NOTE_OFF) {
        warnings.push(`${PREFIX} ${where(at)}: an instrument needs a note on its row; that change was not written.`);
      } else if (src.instrumentAt < 0) {
        warnings.push(`${PREFIX} ${where(at)}: no Instrument command chose this note's instrument; that change was not written.`);
      } else if (record === undefined) {
        warnings.push(`${PREFIX} ${where(at)}: instrument ${cell.instrument} is not one the module's Instrument commands name; that change was not written.`);
      } else {
        const other = claimed.get(src.instrumentAt + 2);
        if (other !== undefined && other !== record) {
          warnings.push(`${PREFIX} ${where(at)}: another edited row shares an Instrument command with this one and wants a different instrument; that change was not written.`);
        } else {
          claimed.set(src.instrumentAt + 2, record);
          accepted.push({ ...at, note: cell.note, instrument: cell.instrument, offset: src.instrumentAt + 2, value: record, size: 4 });
        }
      }
    }
    if (otherChanged) warnings.push(`${PREFIX} ${where(at)}: the volume column is not stored per row in this format; that change was not written.`);
    const now = cellEffects(cell), before = cellEffects(was);
    const arpOnly = fxChanged && src != null && src.noteOffset !== src.offset && now.length === before.length
      && now.every(([t, v], i) => t === before[i][0] && (v === before[i][1] || t === BTH_FX.arpeggio));
    if (arpOnly) {
      // the count is not a byte to patch: dropping note numbers shortens the command (shrinkArpeggio, after the patches)
      const count = now.find(([t]) => t === BTH_FX.arpeggio)?.[1] ?? 0;
      const other = arps.find((x) => base.rowSources[x.pattern]?.[x.channel]?.[x.row]?.offset === src?.offset);
      if (other && other.count !== count) warnings.push(`${PREFIX} ${where(at)}: another edited row plays the same arpeggio command and wants a different count; the effect change was not written.`);
      else if (!other) arps.push({ ...at, count, fx: now });
    } else if (fxChanged) {
      const fxr = effectEditPatches(cell, was, src?.effects ?? []);
      const conflict = fxr.patches.some(([offset, value]) => (claimed.get(offset) ?? value) !== value);
      if (fxr.refusal) warnings.push(`${PREFIX} ${where(at)}: ${fxr.refusal}; the effect change was not written.`);
      else if (conflict) warnings.push(`${PREFIX} ${where(at)}: another edited row shares a command with this one and wants a different value; the effect change was not written.`);
      else {
        const fx = cellEffects(cell);
        for (const [offset, value] of fxr.patches) {
          claimed.set(offset, value);
          accepted.push({ ...at, note: was.note, offset, value, size: 1, fx });
        }
      }
    }
    if (!noteChanged) return;
    if (!src || was.note < 1 || was.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: no note plays on this row, and adding or removing one, or changing a rest, would change the length of the stream; the edit was not written.`);
      return;
    }
    if (cell.note === 0 && restWord !== 0 && src.noteOffset === src.offset) {
      // legacy Rest command [0x82][duration] is the same four bytes as a note [number][duration] and switches the voice's DMA off
      const other = claimed.get(src.offset);
      if (other !== undefined && other !== restWord) {
        warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream word with this one and wants a different value; this edit was not written.`);
        return;
      }
      claimed.set(src.offset, restWord);
      accepted.push({ ...at, note: 0, offset: src.offset, value: restWord, size: 2 });
      return;
    }
    if (cell.note < 1 || cell.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: a note cannot be removed or turned into a note off without changing the stream length; the edit was not written.`);
      return;
    }
    const value = numberFor(original, cell.note, src.base, src.noteNum);
    if (value < 0) {
      warnings.push(`${PREFIX} ${where(at)}: note ${cell.note} is not in the player's period table; the note was not written.`);
      return;
    }
    const other = claimed.get(src.noteOffset);
    if (other !== undefined && other !== value) {
      warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream word with this one and wants a different value; this edit was not written.`);
      return;
    }
    claimed.set(src.noteOffset, value);
    accepted.push({ ...at, note: cell.note, offset: src.noteOffset, value, size: 2 });
  })));

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) for (let i = 0; i < e.size; i++) data[e.offset + i] = (e.value >>> (8 * (e.size - 1 - i))) & 0xff;
  };

  // cells that share an edited word legitimately change with it
  const touched = new Set(accepted.map((e) => e.offset));
  const shared = new Set<string>();
  base.rowSources.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((s, r) => {
    if (s && (touched.has(s.noteOffset) || touched.has(s.instrumentAt + 2))) shared.add(`${c}:${pi * ROWS_PER_PATTERN + r}`);
  })));

  const failing = (edits: Edit[]): Edit[] => {
    writeAll(edits);
    const again = buildBthGrid(data);
    if (typeof again === 'string' || again.rows !== base.rows) return edits;
    const bad = edits.filter((e) => {
      const got = cellAt(again, e.channel, e.pattern * ROWS_PER_PATTERN + e.row);
      if (e.fx !== undefined) return !got || JSON.stringify(cellEffects(got)) !== JSON.stringify(e.fx);
      return got?.note !== e.note || (e.instrument !== undefined && got.instrument !== e.instrument);
    });
    if (bad.length > 0) return bad;
    for (let c = 0; c < VOICES; c++) {
      for (let row = 0; row < base.rows; row++) {
        if (shared.has(`${c}:${row}`)) continue;
        const a = cellAt(again, c, row);
        const b = cellAt(base, c, row);
        if (a?.note !== b?.note || a?.instrument !== b?.instrument) return edits; // something else moved
      }
    }
    return [];
  };

  let live: Edit[] = [];
  for (const e of accepted) {
    if (failing([e]).length === 0) live.push(e);
    else warnings.push(`${PREFIX} ${where(e)}: the replayer would play this row differently than it is shown after the change, or the change moves other rows; it was not written.`);
  }
  for (let pass = 0; pass < 3 && live.length > 0; pass++) {
    const bad = failing(live);
    if (bad.length === 0) break;
    for (const e of bad) warnings.push(`${PREFIX} ${where(e)}: this edit conflicts with another edit once both are written; it was not written.`);
    live = bad.length === live.length ? [] : live.filter((e) => !bad.includes(e));
  }
  writeAll(live);
  let out: Uint8Array = data;
  for (const a of arps) out = shrinkArpeggio(out, a, warnings);
  for (const a of adds) out = addNote(out, a, warnings);
  let patched = 0;
  for (let i = 0; i < out.length; i++) if (out[i] !== original[i]) patched++;
  return { data: out, patched, warnings };
}
