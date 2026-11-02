/**
 * fpGridEdits.ts - write the Future Player grid's edits back into the module's command streams.
 *
 * The grid is the player's walk (fpWalk.ts, fpGrid.ts, docs/FORMAT_COMMAND_STREAM_GRID.md): each note is
 * drawn on the row its command ran, and the grid builder records which command that is (cellSources).
 * An edited cell is a byte patch of that command, never a re-pack, so the module keeps its length and
 * every other byte:
 *   - note: the command's note byte, the table index whose period names the edited note once the
 *     sample's base note, both transposes and the arpeggio's step are added (the byte is that index
 *     minus them, mod 128); a note byte of 0 is a rest, so a note that would need it is refused;
 *   - removed note: the note byte becomes 0, a rest of the same duration (the duration byte keeps the row
 *     count, so the block needs no new length and nothing after it moves);
 *   - removed transpose / portamento / arpeggio command: overwritten with no-op commands of the same length;
 *   - instrument: the pointer of the set-instrument command in force at the note.
 * A command is shared by every row that replays its block (a subroutine), so the edit shows wherever
 * the block plays.
 * A note byte patched in place plays at every replay of its block, under that replay's transposes: an edit that sends
 * any replay past the period table is refused.
 * Edits that need more bytes grow the module (fpModuleGrow.ts). A typed note changes only the row it was typed on:
 *   - a note typed on a rest's rows splits the rest (rest up to the note, the note over the rest's remaining rows) in a
 *     COPY of the rest's block, and only the reference that brought the voice there (the innermost call's pointer, or
 *     the song data's voice block at the top level) is moved to it; every other place that plays the block keeps it.
 *     Where that reference itself replays the block at other rows (a loop, a shared caller) the result would change
 *     them too: the module is walked again and any change outside the typed notes refuses the growth with a warning;
 *   - a note typed on a voice that has no command stream gets a new one (set-instrument, rests, notes, then a
 *     one-row rest looped forever) and a voice block pointing at it, entered in the subsong's song data.
 * A note-off, or an edit the module cannot hold, comes back as a warning, never as a half-edit.
 */
import type { Pattern } from '@/types';
import { buildFuturePlayerGrid } from './FuturePlayerParser';
import { fpPeriodToNote, fpTableIndexOfPitch } from './fpGrid';
import { FP_PERIODS, FP_WALK, fpBaseNote, fpNoteDelta, fpSongs } from './fpWalk';
import { FpGrowError, FpHunkModule, cloneHeader, copyStreamRange, fpStreamRanges, pointRestartsAt, type FpRestReplacement } from './fpModuleGrow';
import { noteValueToPitch } from '@/lib/tracker/noteValue';

/** The note byte the player turns into the table index `idx`, given what it adds first; null when that is the rest byte. */
const noteByteFor = (idx: number, delta: number): number | null => {
  const byte = (idx - delta + 256) & 0x7f;
  return byte === 0 ? null : byte;
};

/** The set-instrument command `81 00 <pointer>`: its bytes and where the pointer sits. */
const setInstrument = (ptr: number): number[] => [0x81, 0x00, (ptr >>> 24) & 0xff, (ptr >>> 16) & 0xff, (ptr >>> 8) & 0xff, ptr & 0xff];

/** Rest commands of at most 127 rows covering `rows` rows. */
const restBytes = (rows: number): number[] => {
  const out: number[] = [];
  for (let left = rows; left > 0; left -= 127) out.push(0, Math.min(left, 127));
  return out;
};

/** A note over `rows` rows (the player's duration byte holds 127 at most; the rest of the rows is a rest). */
const noteBytes = (note: number, rows: number): number[] => [note, Math.min(rows, 127), ...restBytes(rows - 127)];

interface SplitNote { k: number; note: number; instr: number; inForce: number }
/** One replay of a rest with notes typed on its rows. */
interface RestSplit { off: number; rows: number; ret: number; voice: number; row0: number; notes: SplitNote[] }
interface FreshNote { row: number; note: number; ptr: number }

export interface FpEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * `source` is the module's file; `edited` the song's patterns as they are now; `instrumentPtr` maps an instrument
 * slot to the pointer it stands for (the parsed song's instrument metadata); `subsong` the subsong the grid shows.
 */
export function applyFpGridEdits(source: Uint8Array, edited: Pattern[], instrumentPtr: (id: number) => number | undefined, subsong = 0): FpEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const m = buildFuturePlayerGrid(source, undefined, subsong);
  if (!m.grid) return { data: out, patched: 0, warnings: [`the module has no matched grid to write edits into (${m.unmatched ?? 'no walk'})`] };
  const grid = m.grid;
  const base = m.code.byteOffset - source.byteOffset; // file offset of the code section
  const wanted = new Map<number, { value: number; why: string }>();
  const want = (off: number, value: number, why: string): void => {
    const prev = wanted.get(off);
    if (prev && prev.value !== value) { warnings.push(`${why}: conflicts with ${prev.why} on the same byte, kept the first`); return; }
    wanted.set(off, { value: value & 0xff, why });
  };

  const splits = new Map<string, RestSplit>();   // voice and first song row of a rest's replay -> notes typed on it
  const typed: Array<{ voice: number; row: number; note: number; endRow: number }> = []; // what the grown module must show
  const notePatches: Array<{ off: number; byte: number; where: string }> = [];
  const fresh = new Map<number, FreshNote[]>();  // voice without a command stream -> notes typed on it
  const song = fpSongs(m.code)[subsong];
  const rowBase: number[] = [];
  grid.patterns.reduce((acc, bp, i) => { rowBase[i] = acc; return acc + bp.length; }, 0);

  for (let p = 0; p < edited.length; p++) {
    const bp = grid.patterns[p];
    if (!bp) { warnings.push(`pattern ${p} is past the end of the module's song; not written`); continue; }
    for (let ch = 0; ch < bp.channels.length; ch++) {
      const eRows = edited[p].channels[ch]?.rows;
      if (!eRows) continue;
      for (let row = 0; row < bp.length; row++) {
        const b = bp.channels[ch].rows[row];
        const c = eRows[row];
        if (!c) continue;
        const es = grid.effectSources[p][ch][row];
        if (es) {
          // a removed command is overwritten by no-op commands (command 5: command byte and argument byte, no operand) of the same
          // length, so the block keeps its length and every command after it stays at its address; commands take no ticks
          const slotsOf = (cell: Record<string, unknown>): number[] => ['effTyp', 'effTyp2', 'effTyp3', 'effTyp4', 'effTyp5'].map((k) => Number(cell[k] ?? 0));
          const left = new Map<number, number>();
          for (const t of slotsOf(c as unknown as Record<string, unknown>)) left.set(t, (left.get(t) ?? 0) + 1);
          for (const e of es) {
            const n = left.get(e.typ) ?? 0;
            if (n > 0) { left.set(e.typ, n - 1); continue; }
            for (let k = 0; k < e.size; k += 2) { want(base + e.off + k, 0x85, `pattern ${p} voice ${ch + 1} row ${row} removed command`); want(base + e.off + k + 1, 0, `pattern ${p} voice ${ch + 1} row ${row} removed command`); }
          }
        }
        const dNote = (c.note ?? 0) !== (b.note ?? 0);
        const dIns = (c.instrument ?? 0) !== (b.instrument ?? 0);
        if (!dNote && !dIns) continue;
        const where = `pattern ${p} voice ${ch + 1} row ${row}`;
        // a note typed on a blank row inside a rest (its first row included) splits that rest
        const cov0 = grid.restCover[p][ch][row];
        const src = grid.cellSources[p][ch][row] ?? ((c.note ?? 0) !== 0 && !cov0 ? grid.commandSources[p][ch][row] : null);
        if (!src) {
          const n = c.note ?? 0;
          if (n === 0) continue;
          const pitch = noteValueToPitch(n);
          const cov = grid.restCover[p][ch][row];
          if (pitch === null) { warnings.push(`${where}: a note-off is a rest placed on a sounding note, which this writer does not infer; not written`); continue; }
          const idx = fpTableIndexOfPitch(pitch);
          if (idx < 0) { warnings.push(`${where}: no entry of the player's period table plays note ${n}; not written`); continue; }
          const ptr = (c.instrument ?? 0) !== 0 ? instrumentPtr(c.instrument ?? 0) : undefined;
          if (cov) {
            // the note byte is relative to the instrument that plays it: the transposes in force stay, the base note is the new instrument's
            const useDelta = ptr !== undefined && ptr !== cov.instr ? (cov.delta - fpBaseNote(m.code, cov.instr) + fpBaseNote(m.code, ptr)) & 0xff : cov.delta;
            const byte = noteByteFor(idx, useDelta);
            if (byte === null) { warnings.push(`${where}: note ${n} would need note byte 0, which is a rest; not written`); continue; }
            if (ptr === undefined && cov.instr === 0) { warnings.push(`${where}: no instrument is set on this voice and none was given; not written`); continue; }
            const row0 = rowBase[p] + row - cov.k;
            const key = `${ch}:${row0}`;
            const split = splits.get(key) ?? { off: cov.off, rows: cov.rows, ret: cov.ret, voice: ch, row0, notes: [] };
            split.notes.push({ k: cov.k, note: byte, instr: ptr ?? cov.instr, inForce: cov.instr });
            splits.set(key, split);
            typed.push({ voice: ch, row: rowBase[p] + row, note: n, endRow: -1 });
          } else if (song && song.voiceSeqPtrs[ch] === 0) {
            const useDelta = ptr === undefined ? null : fpNoteDelta(m.code, { instr: ptr, t1: 0, t2: 0, arp: 0, porta: 0 }, 0);
            if (ptr === undefined || useDelta === null) { warnings.push(`${where}: voice ${ch + 1} has no command stream and instrument ${c.instrument ?? 0} has no pointer in the module; not written`); continue; }
            const byte = noteByteFor(idx, useDelta);
            if (byte === null) { warnings.push(`${where}: note ${n} would need note byte 0, which is a rest; not written`); continue; }
            const list = fresh.get(ch) ?? [];
            list.push({ row: rowBase[p] + row, note: byte, ptr });
            fresh.set(ch, list);
            typed.push({ voice: ch, row: rowBase[p] + row, note: n, endRow: -1 });
          } else warnings.push(`${where}: this row lies in no rest and starts no command of the module; not written`);
          continue;
        }
        if (dNote) {
          const n = c.note ?? 0;
          const pitch = noteValueToPitch(n);
          // a removed note is a rest of the same duration: note byte 0, so the block keeps its length and every command after it stays at its address
          if (n === 0) want(base + src.off, 0, `${where} removed note`);
          else if (pitch === null) warnings.push(`${where}: a note-off is a rest placed on a sounding note, which this writer does not infer; not written`);
          else {
            const idx = fpTableIndexOfPitch(pitch);
            if (idx < 0) warnings.push(`${where}: no entry of the player's period table plays note ${n}; not written`);
            else {
              const byte = noteByteFor(idx, src.delta);
              if (byte === null) warnings.push(`${where}: note ${n} would need note byte 0, which is a rest; not written`);
              else { want(base + src.off, byte, `${where} note`); notePatches.push({ off: src.off, byte, where }); }
            }
          }
        }
        if (dIns) {
          const ptr = instrumentPtr(c.instrument ?? 0);
          if (!src.retrigger) warnings.push(`${where}: a legato note plays no instrument; not written`);
          else if (src.instrCmd < 0) warnings.push(`${where}: no set-instrument command ran on this voice before the note; not written`);
          else if (ptr === undefined) warnings.push(`${where}: instrument ${c.instrument ?? 0} has no pointer in the module; not written`);
          else for (let k = 0; k < 4; k++) want(base + src.instrCmd + 2 + k, (ptr >>> (24 - 8 * k)) & 0xff, `${where} instrument`);
        }
      }
    }
  }
  // a note byte plays at every replay of its block, each under its own transposes: none may leave the period table
  for (const { off, byte, where } of notePatches) {
    const bad = m.walk?.events.find((e) => e.off === off && (e.kind === FP_WALK.note || e.kind === FP_WALK.legato) && fpPeriodToNote(FP_PERIODS[(byte + e.delta) & 0x7f] ?? 0) === 0);
    if (bad && wanted.get(base + off)?.value === byte) {
      warnings.push(`${where}: the note's command is replayed at tick ${bad.tick} under transposes that would play a table entry past the period table; not written`);
      wanted.delete(base + off);
    }
  }
  let patched = 0;
  for (const [off, { value }] of wanted) if (out[off] !== value) { out[off] = value; patched++; }
  if (splits.size === 0 && fresh.size === 0) return { data: out, patched, warnings };

  const lost = (why: string): FpEditResult => {
    warnings.push(`${why}; ${typed.length} typed note(s) not written`);
    return { data: out, patched, warnings };
  };
  let grown: Uint8Array;
  try {
    const mod = FpHunkModule.parse(out);
    const ranges = fpStreamRanges(mod.code);
    const rd = (o: number): number => ((mod.code[o] << 24) | (mod.code[o + 1] << 16) | (mod.code[o + 2] << 8) | mod.code[o + 3]) >>> 0;
    // the replays that come through the same reference into the same block share one copy
    const copies = new Map<string, { range: number; refOff: number; reps: FpRestReplacement[] }>();
    for (const split of splits.values()) {
      const range = ranges.findIndex(([a, z]) => split.off >= a && split.off + 2 <= z);
      if (range < 0) throw new FpGrowError(`the rest at code offset ${split.off} belongs to no command stream the module reaches`);
      const refOff = split.ret > 0 ? split.ret - 4 : song!.songDataPtr + 8 + split.voice * 4;
      const key = `${range}:${refOff}`;
      const copy = copies.get(key) ?? { range, refOff, reps: [] };
      if (copy.reps.some((r) => r.off === split.off)) throw new FpGrowError(`voice ${split.voice + 1} replays the rest at code offset ${split.off} from the same place at more than one row, so a note in one replay would sound in all`);
      copy.reps.push(splitRest(split.off, split));
      copies.set(key, copy);
      const notes = [...split.notes].sort((x, y) => x.k - y.k);
      notes.forEach((n, i) => {
        const t = typed.find((x) => x.voice === split.voice && x.row === split.row0 + n.k);
        if (t) t.endRow = split.row0 + (i + 1 < notes.length ? notes[i + 1].k : split.rows);
      });
      patched += split.notes.length;
    }
    for (const { range, refOff, reps } of copies.values()) {
      const [start, end] = ranges[range];
      const entry = rd(rd(refOff) + 8);
      if (entry < start || entry >= end) throw new FpGrowError(`the voice reaches the rest's block at code offset ${start} by a jump, not through the reference at ${refOff}`);
      const { base, map } = copyStreamRange(mod, start, end, reps);
      const copyEnd = mod.code.length;
      const oldHeader = rd(refOff);
      pointRestartsAt(mod, base, copyEnd, oldHeader, cloneHeader(mod, refOff, map(entry)));
    }
    for (const [ch, notes] of fresh) {
      addVoiceStream(mod, song!, ch, notes, m.walk?.stop === 'loop' && m.walk.loopRow === 0 ? m.walk.rows : undefined);
      patched += notes.length;
      const sorted = [...notes].sort((x, y) => x.row - y.row);
      sorted.forEach((n, i) => { const t = typed.find((x) => x.voice === ch && x.row === n.row); if (t) t.endRow = i + 1 < sorted.length ? sorted[i + 1].row : n.row + 1; });
    }
    grown = mod.build();
  } catch (e) {
    if (!(e instanceof FpGrowError)) throw e;
    patched -= typed.length;
    return lost(`the module cannot grow (${e.message})`);
  }
  // the grown module, walked again, must show the typed notes and nothing else new
  // the baseline is the module with the in-place patches already written, so they do not count as changes
  const replays = new Map([...splits.values()].map((x) => [`${x.voice}:${x.off}:${x.ret}`, x.row0]));
  const diff = gridChange(buildFuturePlayerGrid(out, undefined, subsong).grid ?? grid, buildFuturePlayerGrid(grown, undefined, subsong), typed, replays);
  if (diff) { patched -= typed.length; return lost(`the grown module would change ${diff}`); }
  return { data: grown, patched, warnings };
}

type FpGridOf = NonNullable<ReturnType<typeof buildFuturePlayerGrid>['grid']>;
const CELL_KEYS = ['note', 'instrument', 'volume', 'effTyp', 'eff', 'effTyp2', 'eff2', 'effTyp3', 'eff3', 'effTyp4', 'eff4', 'effTyp5', 'eff5'] as const;

/**
 * Where the grid of the grown module differs from the old one other than by the typed notes (each on its row, its
 * release, a note-off, allowed on the row its note ends), or null when it does not. `replays` names the split rests
 * (voice, rest offset, return address): a voice whose stream starts over replays the same rest through the same
 * reference, as the player does, so the cells it covers there may change the same way.
 */
function gridChange(before: FpGridOf, after: ReturnType<typeof buildFuturePlayerGrid>, typed: Array<{ voice: number; row: number; note: number; endRow: number }>, replays: Map<string, number>): string | null {
  if (!after.grid) return `the song so it no longer plays as a grid: ${after.unmatched ?? 'no walk'}`;
  const a = after.grid;
  if (a.patterns.length !== before.patterns.length || a.patterns.some((bp, i) => bp.length !== before.patterns[i].length)) return 'the song\'s length';
  const typedAt = new Map(typed.map((t) => [`${t.voice}:${t.row}`, t.note]));
  const endAt = new Set(typed.map((t) => `${t.voice}:${t.endRow}`));
  let row0 = 0;
  for (let p = 0; p < before.patterns.length; p++) {
    const ob = before.patterns[p], nb = a.patterns[p];
    for (let ch = 0; ch < ob.channels.length; ch++) {
      for (let r = 0; r < ob.length; r++) {
        const o = ob.channels[ch].rows[r] as unknown as Record<string, number | undefined>;
        const n = nb.channels[ch]?.rows[r] as unknown as Record<string, number | undefined> | undefined;
        const key = `${ch}:${row0 + r}`;
        const where = `pattern ${p} voice ${ch + 1} row ${r}`;
        const want = typedAt.get(key);
        if (want !== undefined) { if ((n?.note ?? 0) !== want) return `${where} (the typed note does not play there)`; continue; }
        // a replay of a split rest through the same reference (a loop around the call, or the voice starting over) would
        // play the typed note too; the walk cannot tell one replay from another, so it counts as a change
        const cov = before.restCover[p][ch][r];
        const split0 = cov ? replays.get(`${ch}:${cov.off}:${cov.ret}`) : undefined;
        if (cov && split0 !== undefined && split0 !== row0 + r - cov.k) {
          const was = o.note ?? 0, now = n?.note ?? 0;
          if (was !== now) return `${where}, a replay of the split rest through the same call (a loop around it, or the voice starting over)`;
        }
        for (const k of CELL_KEYS) {
          const was = o[k] ?? 0, now = n?.[k] ?? 0;
          if (was !== now && !(k === 'note' && now === 97 && endAt.has(key))) return `${where}, which plays the same block`;
        }
      }
    }
    row0 += ob.length;
  }
  return null;
}

/** The commands that replace the rest at `off` once notes are typed inside it. */
function splitRest(off: number, split: RestSplit): FpRestReplacement {
  const notes = [...split.notes].sort((a, b) => a.k - b.k);
  const bytes: number[] = [];
  const relocAt: number[] = [];
  const instr = (ptr: number): void => { relocAt.push(bytes.length + 2); bytes.push(...setInstrument(ptr)); };
  if (notes[0].k > 0) bytes.push(...restBytes(notes[0].k));
  notes.forEach((n, i) => {
    const until = i + 1 < notes.length ? notes[i + 1].k : split.rows;
    // an instrument other than the one in force is set for this note only; the one in force comes back after it
    const changed = n.instr !== 0 && n.instr !== n.inForce;
    if (changed) instr(n.instr);
    bytes.push(...noteBytes(n.note, until - n.k));
    if (changed && n.inForce !== 0) instr(n.inForce);
  });
  return { off, bytes, relocAt };
}

/**
 * Give voice `ch` a command stream playing `notes`, and a voice block that points at it, entered in the subsong's song data.
 * `restartRows` is the length of one pass when the whole song starts over from row 0 (the walk's loop starts at row 0):
 * the new voice then jumps back to its own start on that row, in step with the others, so the song keeps its length
 * and its loop point. Without it the voice idles for ever after its last note.
 */
function addVoiceStream(mod: FpHunkModule, song: NonNullable<ReturnType<typeof fpSongs>[number]>, ch: number, notes: FreshNote[], restartRows?: number): void {
  const slot = song.songDataPtr + 8 + ch * 4;
  const rd = (o: number): number => ((mod.code[o] << 24) | (mod.code[o + 1] << 16) | (mod.code[o + 2] << 8) | mod.code[o + 3]) >>> 0;
  if (slot + 4 > mod.code.length || rd(slot) !== 0) throw new FpGrowError(`song data slot of voice ${ch + 1} is not empty`);
  let donor = 0;
  for (let i = 0; i < 4 && !donor; i++) if (i !== ch && slot !== 0) donor = rd(song.songDataPtr + 8 + i * 4);
  if (donor === 0 || donor + 12 > mod.code.length) throw new FpGrowError('no voice block of the subsong to copy');

  const sorted = [...notes].sort((a, b) => a.row - b.row);
  const bytes: number[] = [];
  const relocAt: number[] = [];
  let cursor = 0;
  let current = 0;
  // the first note's instrument is set before anything else, so a pass that starts over reads the stream's first rows
  // under the instrument it read them with the first time
  if (sorted.length > 0 && sorted[0].ptr !== 0) { relocAt.push(bytes.length + 2); bytes.push(...setInstrument(sorted[0].ptr)); current = sorted[0].ptr; }
  sorted.forEach((n, i) => {
    bytes.push(...restBytes(n.row - cursor));
    if (n.ptr !== current) { relocAt.push(bytes.length + 2); bytes.push(...setInstrument(n.ptr)); current = n.ptr; }
    const until = i + 1 < sorted.length ? sorted[i + 1].row : n.row + 1;
    bytes.push(...noteBytes(n.note, until - n.row));
    cursor = until;
  });
  let jumpAt = -1;
  if (restartRows !== undefined) {
    // rest up to the song's restart, then jump back to the stream's start through its voice block (command 7)
    if (restartRows > cursor) bytes.push(...restBytes(restartRows - cursor));
    jumpAt = bytes.length + 2;
    bytes.push(0x87, 0x00, 0, 0, 0, 0);
  } else {
    // loop start, a one-row rest, jump back: the voice idles for ever without ending (an end would show on the grid)
    bytes.push(0x88, 0x00, 0x00, 0x01, 0x8a, 0x00);
  }
  const stream = mod.append(bytes);
  for (const r of relocAt) mod.addReloc(stream + r);

  // the voice block is a copy of another voice's, pointing at the new stream
  const put = (o: number, v: number): void => { mod.code[o] = (v >>> 24) & 0xff; mod.code[o + 1] = (v >>> 16) & 0xff; mod.code[o + 2] = (v >>> 8) & 0xff; mod.code[o + 3] = v & 0xff; };
  put(slot, donor);
  mod.addReloc(slot);
  const block = cloneHeader(mod, slot, stream);
  if (jumpAt >= 0) { put(stream + jumpAt, block); mod.addReloc(stream + jumpAt); }
}
