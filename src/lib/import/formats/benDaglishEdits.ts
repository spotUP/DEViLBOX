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
 * Not written, and named in `warnings`, never half-applied: a note where the replayer ran none, a note removed
 * (both change the track's length), a note outside 0x00-0x7e, a delay the duration bytes cannot hold (outside the
 * row, or a duration that would leave 1..255), and instrument / effect-column changes (the command arguments have
 * no cell-to-byte map yet).
 */
import type { Pattern } from '@/types';
import { getColumnField, maxNoteColumns } from '@/lib/tracker/noteColumns';
import type { BdWalk, BdWalkEvent } from './BenDaglishWasmExtractor';
import { BD_WALK } from './BenDaglishWasmExtractor';
import { buildBDGridFromWalk, bdNotePlacements, type BdNotePlacement } from './benDaglishGrid';

const ROWS_PER_PATTERN = 64;
const NOTE_MAX = 0x7e;
const REST_BYTE = 0x7f;

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
export function applyBdGridEdits(source: Uint8Array, walk: BdWalk, trackFileOffsets: readonly number[], edited: Pattern[]): BdEditResult {
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
          if (!at) warnings.push(`${where}: a note where the replayer runs none needs a longer track; not written`);
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
        if (c.instrument !== b.instrument) warnings.push(`${where}: an instrument change has no command byte mapped yet; not written`);
        const fx = (x: typeof c) => [x.effTyp, x.eff, x.effTyp2, x.eff2, x.effTyp3, x.eff3, x.effTyp4, x.eff4, x.effTyp5, x.eff5].join();
        if (fx(c) !== fx(b)) warnings.push(`${where}: an effect column change has no command byte mapped yet; not written`);
      }
    }
  }
  let patched = 0;
  for (const [off, v] of wanted) if (out[off] !== v) { out[off] = v; patched++; }
  return { data: out, patched, warnings };
}
