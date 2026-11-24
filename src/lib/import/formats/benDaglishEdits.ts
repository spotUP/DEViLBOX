/**
 * benDaglishEdits.ts - write the tick grid's note edits back into the Ben Daglish module (G24, G16-benDaglish).
 *
 * The grid (benDaglishGrid.ts) is the replayer's own walk: a note cell is made of a BD_WALK_NOTE event, which
 * names the track and the byte position of the note command that ran. A note byte 0x00-0x7e is the player's
 * note index (ben_daglish.c: period index = -note + the sample's note transpose + FINE_TUNE_START_INDEX), so
 * one step of the byte is one step of the period table, one semitone of the cell, whatever the voice's
 * transpose and the sample's base note add. An edited note is therefore the command's byte plus the cell's
 * change, written in place; the track keeps its length.
 *
 * A note column 2 delay (`extraNotes[0].delay`, ticks into the row) is the note's onset inside its row. The onset is the sum of the
 * duration bytes before it (a note command is the note byte then its ticks byte; a rest is 0x7f then its ticks), so a
 * delay change of d ticks adds d to the duration byte of the timing command just before the note and takes d from the
 * note's own duration byte: the note moves, every later onset on the voice stays where it was and no byte is added.
 *
 * An instrument is the sample a note plays with. The note byte holds none: the sample is set by the last sample-map
 * command (byte 0x80+index, or index & 7) the voice ran, which picks entry `index` of the voice's mapping (identity at
 * the start, changed by position-list map-set commands). So an instrument edit is written as a new index byte in that
 * one command, when every note it governs was edited to the same instrument and some mapping index holds that sample on
 * every run of the command; a lone note of a shared command cannot be changed without changing the others.
 *
 * A blank row given a note with another instrument is written as [map byte][note][ticks][old map byte]: the sample is
 * captured at note start (ben_daglish.c sample_info2 = sample_info), so the first byte sets the new sample for this note and
 * the last restores the command in force for the next. The note byte is shifted by the new sample's own transpose. Written only
 * when one command is in force on every run of the covering track, some mapping index holds the sample on every run, and
 * the byte is 0x80-0xfe; else refused with the reason.
 *
 * Not written, and named in `warnings`, never half-applied: a note where the replayer ran none, a note removed
 * (both change the track's length), a note outside 0x00-0x7e, a delay the duration bytes cannot hold (outside the
 * row, or a duration that would leave 1..255), an instrument edit that does not cover every note its sample-map
 * command governs (or names a sample no mapping index reaches), and effect-column changes (the command arguments
 * have no cell-to-byte map yet).
 */
import type { Pattern } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { getColumnField, maxNoteColumns } from '@/lib/tracker/noteColumns';
import type { BdWalk, BdWalkEvent } from './BenDaglishWasmExtractor';
import { BD_WALK } from './BenDaglishWasmExtractor';
import { buildBDGridFromWalk, bdNotePlacements, bdIsVisibleNote, type BdNotePlacement } from './benDaglishGrid';

const ROWS_PER_PATTERN = 64;
const NOTE_MAX = 0x7e;
const REST_BYTE = 0x7f;
/** A note on a row the replayer holds: `swap` adds the sample-map bytes around it (see swapFor). */
type BdSplit = { cover: BdWalkEvent; at: number; first: number; note: number; where: string; swap?: { newByte: number; oldByte: number } };

export interface BdEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

/**
 * Apply the differences between `edited` (the grid as it is now) and the grid the module's own walk draws to the
 * module bytes. `trackFileOffsets[track]` is where the track's bytes start in `source`.
 */
export function applyBdGridEdits(
  source: Uint8Array, walk: BdWalk, trackFileOffsets: readonly number[], edited: Pattern[],
  grow?: { sizes: readonly number[]; pointersAt: number; base: number },
): BdEditResult {
  const baseGrid = buildBDGridFromWalk(walk);
  const base = baseGrid.patterns;
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const noteAt = new Map<string, { track: number; pos: number }>();
  const placeAt = new Map<string, BdNotePlacement>();
  // keyed by voice, grid row and note column: the same placement the grid is drawn from
  for (const pl of bdNotePlacements(walk, baseGrid.clock).placed) {
    noteAt.set(`${pl.voice}:${pl.row}:${pl.col}`, { track: pl.event.track, pos: pl.event.pos });
    placeAt.set(`${pl.voice}:${pl.row}:${pl.col}`, pl);
  }

  const wanted = new Map<number, number>();
  /** A note on a row the replayer holds (inside a note's or rest's duration): the track gets two bytes more. */
  const splits: BdSplit[] = [];
  const step = baseGrid.step;
  const eventIndex = new Map(walk.events.map((e, i) => [e, i]));
  /** The duration byte of a timing command (note or rest) and the ticks it spans, when the bytes agree with the walk. */
  const durationOf = (e: BdWalkEvent): number => {
    const off = trackFileOffsets[e.track] + e.pos + 1;
    const ok = (e.kind === BD_WALK.note || (e.kind === BD_WALK.rest && source[off - 1] === REST_BYTE)) && off < source.length;
    return ok ? off : -1;
  };
  /** Move the note at `pl` by `delta` ticks inside its row (see the file header); false with a warning when the bytes cannot hold it. */
  const moveOnset = (pl: BdNotePlacement, delta: number, where: string): void => {
    const e = pl.event;
    if (walk.tickRate.num !== walk.tickRate.den) { warnings.push(`${where}: the song skips frames; a delay change is not written`); return; }
    const idx = eventIndex.get(e) ?? -1;
    let prev: BdWalkEvent | undefined, next: BdWalkEvent | undefined;
    for (let i = idx - 1; i >= 0 && !prev; i--) { const x = walk.events[i]; if (x.voice === e.voice && (x.kind === BD_WALK.note || x.kind === BD_WALK.rest)) prev = x; }
    for (let i = idx + 1; i < walk.events.length && !next; i++) { const x = walk.events[i]; if (x.voice === e.voice && (x.kind === BD_WALK.note || x.kind === BD_WALK.rest)) next = x; }
    const pOff = prev ? durationOf(prev) : -1, nOff = durationOf(e);
    const cur = (o: number): number => wanted.get(o) ?? source[o];
    if (!prev || pOff < 0 || nOff < 0 || prev.track !== e.track || prev.ptick + source[pOff] !== e.ptick
      || (next && (next.track !== e.track || e.ptick + source[nOff] !== next.ptick))) {
      warnings.push(`${where}: the note's neighbours are not plain duration bytes; a delay change is not written`); return;
    }
    const p = cur(pOff) + delta, n = cur(nOff) - delta;
    if (p < 1 || p > 255 || n < 1 || n > 255) { warnings.push(`${where}: the duration bytes cannot hold a ${delta > 0 ? '+' : ''}${delta} tick move; not written`); return; }
    wanted.set(pOff, p); wanted.set(nOff, n);
  };
  /** Plan the split of the timing command that holds `voice` at `row`: its duration is cut at the row and a note command follows. */
  const planSplit = (voice: number, row: number, cn: number, where: string, instrument: number): void => {
    const t = row * step;
    let cover: BdWalkEvent | undefined, prevNote: BdWalkEvent | undefined;
    for (const x of walk.events) {
      if (x.voice !== voice || x.ptick > t) continue;
      if (bdIsVisibleNote(x) && x.ptick < t) prevNote = x;
      if ((x.kind === BD_WALK.note || x.kind === BD_WALK.rest) && durationOf(x) >= 0 && x.ptick + source[durationOf(x)] > t) cover = x;
    }
    if (!cover || !prevNote) { warnings.push(`${where}: no note or rest command holds this row; not written`); return; }
    const first = t - cover.ptick;
    const pb = source[trackFileOffsets[prevNote.track] + prevNote.pos];
    const swap = instrument > 0 ? swapFor(cover, instrument - 1, where) : null;
    if (typeof swap === 'string') { warnings.push(swap); return; }
    // the new sample's own transpose moves the sounding note: compensate by the difference of the samples' pitch offsets
    let shift = 0;
    if (swap) {
      const k = pitchOffset(instrument - 1);
      if (k === undefined) { warnings.push(`${where}: sample ${instrument} plays no note in this module, so its pitch offset is unknown; instrument not written`); return; }
      shift = (periodToNote(prevNote.c) - prevNote.b) - k;
    }
    const nb = pb + (cn - periodToNote(prevNote.c)) + shift;
    if (pb > NOTE_MAX || nb < 0 || nb > NOTE_MAX) { warnings.push(`${where}: note ${cn} is outside the player's note range; not written`); return; }
    if (splits.some((s) => s.cover === cover)) { warnings.push(`${where}: another note already splits the same command; not written`); return; }
    if (first === 0) {
      if (swap) { warnings.push(`${where}: the note replaces a rest byte, so a sample-map byte cannot go before it; instrument not written`); return; }
      // a rest that starts on this row: the note byte replaces the rest byte, the duration stays
      if (cover.kind !== BD_WALK.rest) { warnings.push(`${where}: the row starts a note the grid does not show; not written`); return; }
      wanted.set(trackFileOffsets[cover.track] + cover.pos, nb);
      return;
    }
    splits.push({ cover, at: durationOf(cover), first, note: nb, where, swap: swap ?? undefined });
  };
  /** Grid note minus transposed note byte a sample plays with (its own transpose and base note); most common over the walk's notes. */
  const pitchOffset = (sample: number): number | undefined => {
    const count = new Map<number, number>();
    for (const e of walk.events) if (e.kind === BD_WALK.note && e.a === sample && e.c > 0) { const k = periodToNote(e.c) - e.b; count.set(k, (count.get(k) ?? 0) + 1); }
    return [...count].sort((x, y) => y[1] - x[1])[0]?.[0];
  };
  /**
   * The two sample-map bytes a blank-row note of another sample needs: [new] before the note, [old] after its rest, so the
   * note starts with the wanted sample (the replayer copies the sample at note start, a map byte parsed during a note
   * only changes the next one) and the command in force is back before the next note. null: the sample already plays;
   * string: the reason it cannot be written.
   */
  const swapFor = (cover: BdWalkEvent, sample: number, where: string): { newByte: number; oldByte: number } | string | null => {
    if (cover.voice >= 4) return `${where}: voice ${cover.voice + 1} has no sample mapping; instrument not written`;
    if (sample >= walk.samples) return `${where}: instrument ${sample + 1} is not a sample of the module; not written`;
    const mapping = Array.from({ length: 4 }, () => Array.from({ length: 10 }, (_, j) => j));
    const last: Array<BdWalkEvent | undefined> = [undefined, undefined, undefined, undefined];
    const runs: Array<{ cmd?: BdWalkEvent; map: number[] }> = [];
    for (const e of walk.events) {
      if (e.voice >= 4) continue;
      if (e.kind === BD_WALK.mapSet && e.a >= 0 && e.a < 10) mapping[e.voice][e.a] = e.b;
      else if (e.kind === BD_WALK.sampleMap && e.track >= 0) last[e.voice] = e;
      else if (e.voice === cover.voice && e.kind === cover.kind && e.track === cover.track && e.pos === cover.pos) runs.push({ cmd: last[e.voice], map: mapping[e.voice].slice() });
    }
    if (runs.every((r) => r.cmd && r.map[r.cmd.a] === sample)) return null;
    const cmd = runs[0]?.cmd;
    if (!cmd || runs.some((r) => !r.cmd || r.cmd.track !== cmd.track || r.cmd.pos !== cmd.pos)) return `${where}: no single sample-map command is in force on every run of the track; instrument not written`;
    const j = Array.from({ length: 10 }, (_, k) => k).find((k) => runs.every((r) => r.map[k] === sample));
    if (j === undefined) return `${where}: no sample-mapping index holds sample ${sample + 1} on every run; instrument not written`;
    const oldByte = source[trackFileOffsets[cmd.track] + cmd.pos], newByte = oldByte + (j - cmd.a);
    if (oldByte < 0x80 || oldByte > 0xfe || newByte < 0x80 || newByte > 0xfe) return `${where}: the sample-map byte ${newByte} is outside 0x80-0xfe; instrument not written`;
    return { newByte, oldByte };
  };
  for (let p = 0; p < edited.length; p++) {
    const bp = base[p];
    if (!bp) { warnings.push(`pattern ${p} is past the end of the module's walk; not written`); continue; }
    for (let ch = 0; ch < bp.channels.length; ch++) {
      const eRows = edited[p].channels[ch]?.rows;
      if (!eRows) continue;
      for (let row = 0; row < bp.length && row < ROWS_PER_PATTERN; row++) {
        const b = bp.channels[ch].rows[row];
        const c = eRows[row];
        if (!c) continue;
        const where = `pattern ${p} voice ${ch + 1} row ${row}`;
        const colCount = maxNoteColumns([c, b]);
        const cols: Array<{ col: number; cn: number; bn: number }> = Array.from({ length: colCount }, (_, col) => ({ col, cn: getColumnField(c, col, 'note') ?? 0, bn: getColumnField(b, col, 'note') ?? 0 }));
        for (const { col, cn, bn } of cols) {
          if (cn === bn) continue;
          const at = noteAt.get(`${ch}:${p * ROWS_PER_PATTERN + row}:${col}`);
          if (!at) {
            if (col === 0 && bn === 0 && cn >= 1 && cn <= 96) planSplit(ch, p * ROWS_PER_PATTERN + row, cn, where, c.instrument ?? 0);
            else warnings.push(`${where}: a note where the replayer runs none needs a longer track; not written`);
          }
          else if (cn < 1 || cn > 96 || bn < 1 || bn > 96) warnings.push(`${where}: a note removed or turned into a note-off needs a different command; not written`);
          else {
            const off = trackFileOffsets[at.track] + at.pos;
            const nb = (source[off] ?? 0xff) + (cn - bn);
            if (off >= out.length || (source[off] ?? 0xff) > NOTE_MAX) warnings.push(`${where}: the command byte is not a note; not written`);
            else if (nb < 0 || nb > NOTE_MAX) warnings.push(`${where}: note ${cn} is outside the player's note range; not written`);
            else wanted.set(off, nb);
          }
        }
        for (let col = 1; col < colCount; col++) {
          if ((getColumnField(c, col, 'delay') ?? 0) === (getColumnField(b, col, 'delay') ?? 0)) continue;
          const pl = placeAt.get(`${ch}:${p * ROWS_PER_PATTERN + row}:${col}`);
          const d = getColumnField(c, col, 'delay') ?? 0;
          if (!pl) warnings.push(`${where}: a delay on a row with no note in that column; not written`);
          else if (d < 0 || d >= step) warnings.push(`${where}: a delay of ${d} is outside the row (0-${step - 1} ticks); not written`);
          else moveOnset(pl, d - pl.offset, where);
        }
        const splitCell = (b.note ?? 0) === 0 && (c.note ?? 0) > 0;
        if (c.instrument !== b.instrument && !noteAt.has(`${ch}:${p * ROWS_PER_PATTERN + row}:0`) && !splitCell) warnings.push(`${where}: an instrument on a cell with no note has no command byte; not written`);
        const fx = (x: typeof c) => [x.effTyp, x.eff, x.effTyp2, x.eff2, x.effTyp3, x.eff3, x.effTyp4, x.eff4, x.effTyp5, x.eff5].join();
        if (fx(c) !== fx(b)) warnings.push(`${where}: an effect column change has no command byte mapped yet; not written`);
      }
    }
  }
  planInstrumentEdits(walk, trackFileOffsets, source, edited, bdNotePlacements(walk, baseGrid.clock).placed, wanted, warnings);
  let patched = 0;
  for (const [off, v] of wanted) if (out[off] !== v) { out[off] = v; patched++; }
  return growTracks(out, splits, trackFileOffsets, grow, patched, warnings);
}

/**
 * Apply the planned splits: each affected track is copied to the end of the module with its duration byte cut and
 * [note, rest-of-duration] inserted behind it, and its entry in the track offset table points there. Nothing else in the
 * file moves, so no other pointer needs fixing; the old copy stays as dead bytes.
 */
function growTracks(
  out: Uint8Array, splits: BdSplit[],
  trackFileOffsets: readonly number[], grow: { sizes: readonly number[]; pointersAt: number; base: number } | undefined,
  patched: number, warnings: string[],
): BdEditResult {
  const byTrack = new Map<number, typeof splits>();
  for (const s of splits) byTrack.set(s.cover.track, [...(byTrack.get(s.cover.track) ?? []), s]);
  let data = out;
  for (const [track, list] of byTrack) {
    const start = trackFileOffsets[track], size = grow?.sizes[track];
    if (!grow || size === undefined) { warnings.push(`${list[0].where}: the module has no track table to repoint; not written`); continue; }
    const bytes = Array.from(data.subarray(start, start + size));
    // behind-first so earlier positions stay valid
    for (const s of [...list].sort((a, b) => b.at - a.at)) {
      const i = s.at - start;
      const rest = bytes[i] - s.first;
      bytes[i] = s.first;
      bytes.splice(i + 1, 0, ...(s.swap ? [s.swap.newByte, s.note, rest, s.swap.oldByte] : [s.note, rest]));
    }
    const newAt = (data.length + 1) & ~1;
    const entry = newAt - grow.base;
    if (entry > 0xffff) { warnings.push(`${list[0].where}: the longer track does not fit the 16-bit offset table; not written`); continue; }
    const next = new Uint8Array(newAt + bytes.length);
    next.set(data); next.set(bytes, newAt);
    next[grow.pointersAt + track * 2] = entry >> 8; next[grow.pointersAt + track * 2 + 1] = entry & 0xff;
    data = next;
    patched += list.reduce((n, s) => n + (s.swap ? 4 : 2), 0);
  }
  return { data, patched, warnings };
}

/** Plan the sample-map command bytes an instrument edit needs (see the file header); one byte per command, all runs of it agreeing. */
function planInstrumentEdits(
  walk: BdWalk, trackFileOffsets: readonly number[], source: Uint8Array, edited: Pattern[],
  placed: BdNotePlacement[], wanted: Map<number, number>, warnings: string[],
): void {
  const placeOf = new Map(placed.map((pl) => [pl.event, pl]));
  const mapping = Array.from({ length: 4 }, () => Array.from({ length: 10 }, (_, j) => j));
  type Group = { s: BdWalkEvent; runs: number[][]; notes: BdNotePlacement[] };
  const groups = new Map<string, Group>();
  const current: Array<Group | undefined> = [undefined, undefined, undefined, undefined];
  for (const e of walk.events) {
    if (e.voice >= 4) continue;
    if (e.kind === BD_WALK.mapSet && e.a >= 0 && e.a < 10) mapping[e.voice][e.a] = e.b;
    else if (e.kind === BD_WALK.sampleMap && e.track >= 0) {
      const key = `${e.track}:${e.pos}`;
      const g = groups.get(key) ?? { s: e, runs: [], notes: [] };
      groups.set(key, g);
      g.runs.push(mapping[e.voice].slice());
      current[e.voice] = g;
    } else if (placeOf.has(e)) current[e.voice]?.notes.push(placeOf.get(e)!);
  }
  for (const g of groups.values()) {
    const asked = g.notes.map((pl) => {
      const cell = edited[Math.floor(pl.row / ROWS_PER_PATTERN)]?.channels[pl.voice]?.rows[pl.row % ROWS_PER_PATTERN];
      return cell ? getColumnField(cell, pl.col, 'instrument') ?? 0 : undefined;
    });
    if (g.notes.every((pl, i) => asked[i] === pl.event.a + 1)) continue;
    const where = `voice ${g.s.voice + 1} sample-map command at track ${g.s.track} byte ${g.s.pos}`;
    const sample = (asked[0] ?? 0) - 1;
    if (asked.some((a) => a !== asked[0])) { warnings.push(`${where}: it sets the sample of ${g.notes.length} notes; change them all to the same instrument; not written`); continue; }
    if (sample < 0 || sample >= walk.samples) { warnings.push(`${where}: instrument ${sample + 1} is not a sample of the module; not written`); continue; }
    const j = Array.from({ length: 10 }, (_, k) => k).find((k) => g.runs.every((m) => m[k] === sample));
    if (j === undefined) { warnings.push(`${where}: no sample-mapping index holds sample ${sample + 1}; not written`); continue; }
    const off = trackFileOffsets[g.s.track] + g.s.pos;
    wanted.set(off, source[off] + (j - g.s.a));
  }
}
