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
 * Not written, and named in `warnings`, never half-applied: a note where the replayer ran none, a note removed
 * (both change the track's length), a note outside 0x00-0x7e, and instrument / effect-column changes (the
 * command arguments have no cell-to-byte map yet).
 */
import type { Pattern } from '@/types';
import type { BdWalk } from './BenDaglishWasmExtractor';
import { buildBDGridFromWalk, bdNotePlacements } from './benDaglishGrid';

const ROWS_PER_PATTERN = 64;
const NOTE_MAX = 0x7e;

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
  // keyed by voice, grid row and note column: the same placement the grid is drawn from
  for (const pl of bdNotePlacements(walk, baseGrid.clock).placed) noteAt.set(`${pl.voice}:${pl.row}:${pl.col}`, { track: pl.event.track, pos: pl.event.pos });

  const wanted = new Map<number, number>();
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
        const cols: Array<{ col: number; cn: number; bn: number }> = [{ col: 0, cn: c.note, bn: b.note }, { col: 1, cn: c.note2 ?? 0, bn: b.note2 ?? 0 }];
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
        if ((c.delay2 ?? 0) !== (b.delay2 ?? 0)) warnings.push(`${where}: a note delay change has no command byte mapped yet; not written`);
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
