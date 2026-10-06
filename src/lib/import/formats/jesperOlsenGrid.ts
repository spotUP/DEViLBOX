/**
 * jesperOlsenGrid.ts - the Jesper Olsen (L/G) grid: every row each voice's
 * driver reads, on the row clock the driver keeps.
 *
 * The driver (JoPlayer, JesperOlsenModule.ts) is run to the host's song end;
 * a grid row is a tick on which a row was due (description §6.6: L adds the
 * tempo to an 8-bit counter, a row every time it wraps - $5A gives rows 3,3,
 * 3,2,... ticks apart; G counts two nibbles, $22 = every 3 ticks), and each
 * row a voice reads sits on the row of the tick it was read. A cell is that
 * file row: note (with the voice's transpose at that moment), rest = note cut,
 * release = note off, its set-words as the instrument column and private
 * effects (jesperOlsenEffectGlyphs.ts), and the step's set-words on the
 * step's first row.
 *
 * A cell maps back to its file row, so an edit is a write of that row's
 * bytes in place (note byte, tie bit, the values of the set-words it has):
 * `joWriteCell`. Growing a row (a set-word it does not have, a note where the
 * voice holds) moves every later byte and is not written.
 */

import type { TrackerCell } from '@/types';
import { JoPlayer, joPeriod, type JoRowRead, type JoSetWord } from './JesperOlsenModule';
import { JO_FIELD_FX, JO_FX } from './jesperOlsenEffectGlyphs';

/** The grid's first and last note (C-0 .. B-3 by period index 48 .. 94). */
const FIRST_INDEX = 48;
const LAST_INDEX = 94;
export const JO_NOTE_CUT = 254;
export const JO_NOTE_OFF = 97;
const EFFECT_SLOTS = 5;

export interface JoGrid {
  /** Tick (0 = the first play call) of every grid row. */
  rowTicks: number[];
  /** reads[row][channel], the row a voice read on that grid row (or undefined). */
  reads: Array<Array<JoRowRead | undefined>>;
  /** The tick the host's song end fired on. */
  endTick: number;
  player: JoPlayer;
}

/** Run subsong `subsong` (0-based) to the song end and lay its row reads on the row clock. */
export function buildJoGrid(bytes: Uint8Array, subsong: number, maxTicks = 50 * 60 * 20): JoGrid {
  const p = new JoPlayer(bytes);
  p.start(subsong + 1);
  while (p.ends.length === 0 && p.tickCount < maxTicks) p.tick();
  const endTick = p.ends[0] ?? p.tickCount - 1;
  const rowTicks = p.rowTicks.filter((t) => t <= endTick);
  const rowOf = new Map(rowTicks.map((t, r) => [t, r]));
  const reads: Array<Array<JoRowRead | undefined>> = rowTicks.map(() => [undefined, undefined, undefined, undefined]);
  for (const r of p.reads) {
    const row = rowOf.get(r.tick);
    if (row === undefined) continue;
    reads[row][r.channel] = r;
  }
  return { rowTicks, reads, endTick, player: p };
}

/** The set-words a cell shows, in the order the driver runs them: the step's, then the row's. */
function commandsOf(read: JoRowRead): JoSetWord[] {
  return [...read.stepCommands, ...read.commands];
}

/** Index (in commandsOf) of the set-word the instrument column shows: the last one to field 0. */
function instrumentCommand(cmds: JoSetWord[]): number {
  for (let i = cmds.length - 1; i >= 0; i--) if (cmds[i].field === 0) return i;
  return -1;
}

/** The period index a note row names (L: the record's note after the transpose). */
function noteIndex(read: JoRowRead): number {
  return (read.a + read.transpose) & 0x7f;
}

export function joCell(read: JoRowRead | undefined): TrackerCell {
  const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  if (!read) return cell;
  const effects: Array<[number, number]> = [];
  if (read.a === 0x7f) cell.note = JO_NOTE_CUT;
  else if (read.a === 0x7e) cell.note = JO_NOTE_OFF;
  else {
    const idx = noteIndex(read);
    if (idx >= FIRST_INDEX && idx <= LAST_INDEX) {
      cell.note = idx - FIRST_INDEX + 1;
      cell.period = joPeriod(idx);
    } else effects.push([JO_FX.rawNote, read.a]);
  }
  if (read.b & 0x80) effects.push([JO_FX.tie, 0]);
  const cmds = commandsOf(read);
  const ins = instrumentCommand(cmds);
  cmds.forEach((c, i) => {
    if (i === ins) { cell.instrument = c.value + 1; return; }
    const fx = JO_FIELD_FX[c.field];
    if (fx !== undefined) effects.push([fx, c.value]);
    else effects.push([JO_FX.field, c.field], [JO_FX.value, c.value]);
  });
  if (effects.length > EFFECT_SLOTS) throw new Error(`JO: a row with ${effects.length} effects (at ${read.noteAt})`);
  setEffects(cell, effects);
  return cell;
}

function setEffects(cell: TrackerCell, effects: Array<[number, number]>): void {
  const [e1, e2, e3, e4, e5] = effects;
  if (e1) { cell.effTyp = e1[0]; cell.eff = e1[1]; }
  if (e2) { cell.effTyp2 = e2[0]; cell.eff2 = e2[1]; }
  if (e3) { cell.effTyp3 = e3[0]; cell.eff3 = e3[1]; }
  if (e4) { cell.effTyp4 = e4[0]; cell.eff4 = e4[1]; }
  if (e5) { cell.effTyp5 = e5[0]; cell.eff5 = e5[1]; }
}

function effectsOf(cell: TrackerCell): Array<[number, number]> {
  return ([
    [cell.effTyp, cell.eff], [cell.effTyp2, cell.eff2], [cell.effTyp3, cell.eff3],
    [cell.effTyp4, cell.eff4], [cell.effTyp5, cell.eff5],
  ] as Array<[number | undefined, number | undefined]>)
    .filter(([t, v]) => (t ?? 0) !== 0 || (v ?? 0) !== 0)
    .map(([t, v]) => [t ?? 0, v ?? 0]);
}

/** Effect columns a cell needs (the channel shows at least 2). */
export function joCellEffectColumns(cell: TrackerCell): number {
  return effectsOf(cell).length;
}

/**
 * The byte runs (file offsets) that make `read`'s file row say what `cell`
 * says: the note byte, the tie bit of the length byte, the value byte of each
 * set-word the row already has. [] when nothing changes; parts the row cannot
 * hold in place (a removed note, a set-word it does not have) are not written.
 */
export function joWriteCell(read: JoRowRead, cell: TrackerCell): Array<{ offset: number; bytes: Uint8Array }> {
  const runs: Array<{ offset: number; bytes: Uint8Array }> = [];
  const effects = effectsOf(cell);
  const has = (t: number) => effects.some(([e]) => e === t);

  let a = read.a;
  if (cell.note === JO_NOTE_CUT) a = 0x7f;
  else if (cell.note === JO_NOTE_OFF) a = 0x7e;
  else if (cell.note >= 1 && cell.note <= LAST_INDEX - FIRST_INDEX + 1) {
    const v = (cell.note - 1 + FIRST_INDEX - read.transpose) & 0xff;
    if (v < 0x7e) a = v;
  } else if (has(JO_FX.rawNote)) a = effects.find(([e]) => e === JO_FX.rawNote)![1] & 0xff;
  const b = has(JO_FX.tie) ? read.b | 0x80 : read.b & 0x7f;
  if (a !== read.a || b !== read.b) runs.push({ offset: read.noteAt, bytes: Uint8Array.of(a, b) });

  // Set-word values, matched by position against what the row holds.
  const cmds = commandsOf(read);
  const ins = instrumentCommand(cmds);
  const shown = effects.filter(([e]) => e !== JO_FX.tie && e !== JO_FX.rawNote);
  const want: number[] = [];
  let k = 0;
  let fits = true;
  cmds.forEach((c, i) => {
    if (i === ins) { want.push(cell.instrument > 0 ? (cell.instrument - 1) & 0xff : c.value); return; }
    const fx = JO_FIELD_FX[c.field];
    if (fx !== undefined) {
      const e = shown[k++];
      if (!e || e[0] !== fx) { fits = false; want.push(c.value); } else want.push(e[1] & 0xff);
    } else {
      const x = shown[k++], y = shown[k++];
      if (!x || !y || x[0] !== JO_FX.field || x[1] !== c.field || y[0] !== JO_FX.value) { fits = false; want.push(c.value); } else want.push(y[1] & 0xff);
    }
  });
  cmds.forEach((c, i) => {
    if (i !== ins && !fits) return;
    if (want[i] !== c.value) runs.push({ offset: c.at + 1, bytes: Uint8Array.of(want[i]) });
  });
  return runs;
}
